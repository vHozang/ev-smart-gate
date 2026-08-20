from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from smart_gate.application.alerts import AlertService
from smart_gate.application.barrier import BarrierService
from smart_gate.application.dto import GateVerificationInput, VerificationOutput
from smart_gate.config import Settings
from smart_gate.domain.entities import GateLog
from smart_gate.domain.enums import (
    AlertSeverity,
    BarrierStatus,
    Direction,
    PlateMatchType,
    VerificationStatus,
)
from smart_gate.domain.exceptions import ConflictError, SmartGateError
from smart_gate.domain.ports import (
    AuthorizationRepository,
    DriverRepository,
    EvidenceStorageGateway,
    FaceGateway,
    GateLogRepository,
    LicensePlateGateway,
    VehicleRepository,
)
from smart_gate.domain.services import FaceMatchingService, PlateMatchingService

logger = logging.getLogger(__name__)


class VerifyEntryUseCase:
    def __init__(
        self,
        settings: Settings,
        drivers: DriverRepository,
        vehicles: VehicleRepository,
        authorizations: AuthorizationRepository,
        gate_logs: GateLogRepository,
        evidence: EvidenceStorageGateway,
        lpr: LicensePlateGateway,
        face: FaceGateway,
        plate_matcher: PlateMatchingService,
        face_matcher: FaceMatchingService,
        alerts: AlertService,
        barrier: BarrierService,
    ) -> None:
        self.settings = settings
        self.drivers = drivers
        self.vehicles = vehicles
        self.authorizations = authorizations
        self.gate_logs = gate_logs
        self.evidence = evidence
        self.lpr = lpr
        self.face = face
        self.plate_matcher = plate_matcher
        self.face_matcher = face_matcher
        self.alerts = alerts
        self.barrier = barrier

    async def execute(self, payload: GateVerificationInput) -> VerificationOutput:
        existing = await self.gate_logs.get_by_event_id(payload.event_id)
        if existing is not None:
            if existing.direction != Direction.ENTRY:
                raise ConflictError(
                    "EVENT_ID_WORKFLOW_CONFLICT",
                    "event_id đã được dùng cho một workflow cổng khác",
                )
            return self._output(existing)

        try:
            snapshot_refs = await self._store_snapshots(payload)
        except SmartGateError as exc:
            return await self._failed(
                payload,
                [],
                [exc.code],
                message="Không thể lưu bằng chứng Gate In; hệ thống từ chối mở cổng",
            )
        except Exception as exc:
            logger.exception(
                "Lưu bằng chứng Gate In phát sinh lỗi ngoài dự kiến cho event %s",
                payload.event_id,
                exc_info=exc,
            )
            return await self._failed(
                payload,
                [],
                ["EVIDENCE_STORE_UNEXPECTED_ERROR"],
                message="Không thể lưu bằng chứng Gate In; hệ thống từ chối mở cổng",
            )
        try:
            plate_observation, face_observation = await asyncio.gather(
                self.lpr.recognize(payload.plate_image),
                self.face.extract(payload.face_image),
            )
        except SmartGateError as exc:
            return await self._failed(
                payload,
                snapshot_refs,
                [exc.code],
                message=exc.message,
            )
        except Exception as exc:
            logger.exception(
                "Pipeline AI Gate In phát sinh lỗi ngoài dự kiến cho event %s",
                payload.event_id,
                exc_info=exc,
            )
            return await self._failed(
                payload,
                snapshot_refs,
                ["AI_PIPELINE_UNEXPECTED_ERROR"],
                message="Pipeline AI Gate In gặp lỗi; hệ thống từ chối mở cổng",
            )

        plate_match = self.plate_matcher.match(
            plate_observation.text, await self.vehicles.list_active()
        )
        driver, face_similarity = self.face_matcher.best_match(
            face_observation, await self.drivers.list_active()
        )
        reason_codes: list[str] = []
        if plate_match.vehicle is None:
            reason_codes.append("VEHICLE_NOT_MATCHED")
        if plate_observation.confidence < self.settings.plate_confidence_threshold:
            reason_codes.append("PLATE_LOW_CONFIDENCE")
        if driver is None:
            reason_codes.append("FACE_NOT_MATCHED")
        if self.settings.require_liveness and not face_observation.is_live:
            reason_codes.append("FACE_SPOOF")
        if face_observation.detector_confidence < self.settings.face_detector_threshold:
            reason_codes.append("FACE_LOW_CONFIDENCE")
        if driver is not None and plate_match.vehicle is not None:
            authorized = await self.authorizations.is_authorized(
                driver.id, plate_match.vehicle.id, datetime.now(UTC)
            )
            if not authorized:
                reason_codes.append("DRIVER_VEHICLE_NOT_AUTHORIZED")

        verification_status = (
            VerificationStatus.FAILED if reason_codes else VerificationStatus.PASSED
        )
        verification_score = min(plate_match.score, face_similarity) if not reason_codes else 0.0
        gate_log = GateLog(
            event_id=payload.event_id,
            direction=Direction.ENTRY,
            verification_status=verification_status,
            observed_plate=plate_observation.text,
            plate_score=plate_match.score,
            plate_match_type=plate_match.match_type,
            face_similarity=face_similarity,
            verification_score=verification_score,
            reason_codes=reason_codes or ["ALL_CHECKS_PASSED"],
            driver_id=driver.id if driver else None,
            vehicle_id=plate_match.vehicle.id if plate_match.vehicle else None,
            snapshot_refs=snapshot_refs,
            model_versions={
                "lpr": plate_observation.model_version,
                "face": face_observation.model_version,
            },
            threshold_version=self.settings.threshold_version,
            occurred_at=datetime.now(UTC),
        )
        stored = await self.gate_logs.add(gate_log)
        alert_id = None
        if verification_status == VerificationStatus.FAILED:
            alert = await self.alerts.create(
                event_id=payload.event_id,
                alert_type="ENTRY_MISMATCH",
                severity=AlertSeverity.HIGH,
                message="Xác minh Gate In thất bại",
                data={
                    "gate_log_id": str(stored.id),
                    "observed_plate": stored.observed_plate,
                    "reason_codes": stored.reason_codes,
                },
            )
            alert_id = alert.id
            return self._output(stored, alert_id=alert_id)

        permit_granted = await self.barrier.open(stored, payload.gate_id)
        stored = await self.gate_logs.get_by_event_id(payload.event_id) or stored
        return self._output(stored, permit_granted=permit_granted)

    async def _store_snapshots(self, payload: GateVerificationInput) -> list[str]:
        return list(
            await asyncio.gather(
                self.evidence.store(
                    payload.plate_image,
                    category="gate-entry-plate",
                    correlation_id=payload.event_id,
                    content_type="image/jpeg",
                    extension="jpg",
                ),
                self.evidence.store(
                    payload.face_image,
                    category="gate-entry-face",
                    correlation_id=payload.event_id,
                    content_type="image/jpeg",
                    extension="jpg",
                ),
            )
        )

    async def _failed(
        self,
        payload: GateVerificationInput,
        snapshot_refs: list[str],
        reason_codes: list[str],
        *,
        message: str,
    ) -> VerificationOutput:
        gate_log = await self.gate_logs.add(
            GateLog(
                event_id=payload.event_id,
                direction=Direction.ENTRY,
                verification_status=VerificationStatus.FAILED,
                observed_plate="",
                plate_score=0,
                plate_match_type=PlateMatchType.NONE,
                face_similarity=0,
                verification_score=0,
                reason_codes=reason_codes,
                snapshot_refs=snapshot_refs,
                threshold_version=self.settings.threshold_version,
                occurred_at=datetime.now(UTC),
            )
        )
        alert = await self.alerts.create(
            event_id=payload.event_id,
            alert_type="ENTRY_PROCESSING_FAILED",
            severity=AlertSeverity.HIGH,
            message=message,
            data={"gate_log_id": str(gate_log.id), "reason_codes": reason_codes},
        )
        return self._output(gate_log, alert_id=alert.id)

    @staticmethod
    def _output(
        gate_log: GateLog,
        *,
        permit_granted: bool | None = None,
        alert_id=None,
    ) -> VerificationOutput:
        return VerificationOutput(
            gate_log_id=gate_log.id,
            event_id=gate_log.event_id,
            verification_status=gate_log.verification_status,
            permit_granted=(
                gate_log.barrier_status == BarrierStatus.OPENED
                if permit_granted is None
                else permit_granted
            ),
            driver_id=gate_log.driver_id,
            vehicle_id=gate_log.vehicle_id,
            order_id=gate_log.order_id,
            observed_plate=gate_log.observed_plate,
            plate_score=gate_log.plate_score,
            face_similarity=gate_log.face_similarity,
            verification_score=gate_log.verification_score,
            reason_codes=gate_log.reason_codes,
            barrier_status=gate_log.barrier_status,
            alert_id=alert_id,
        )
