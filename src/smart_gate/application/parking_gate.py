from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from smart_gate.application.alerts import AlertService
from smart_gate.application.barrier import BarrierService
from smart_gate.application.dto import ParkingGateVerificationInput, VerificationOutput
from smart_gate.config import Settings
from smart_gate.domain.entities import GateLog
from smart_gate.domain.enums import (
    AlertSeverity,
    BarrierStatus,
    CardStatus,
    Direction,
    PlateMatchType,
    RecordStatus,
    VerificationStatus,
)
from smart_gate.domain.exceptions import ConflictError, SmartGateError
from smart_gate.domain.ports import (
    AuthorizationRepository,
    DriverRepository,
    EmployeeCardRepository,
    EvidenceStorageGateway,
    FaceGateway,
    GateLogRepository,
    LicensePlateGateway,
    VehicleRepository,
)
from smart_gate.domain.services import FaceMatchingService, PlateMatchingService, normalize_card_uid

logger = logging.getLogger(__name__)


class VerifyParkingGateUseCase:
    def __init__(
        self,
        settings: Settings,
        cards: EmployeeCardRepository,
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
        self.cards = cards
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

    async def execute(self, payload: ParkingGateVerificationInput) -> VerificationOutput:
        # 1. Idempotency check
        existing = await self.gate_logs.get_by_event_id(payload.event_id)
        if existing is not None:
            if existing.direction != payload.direction:
                raise ConflictError(
                    "EVENT_ID_WORKFLOW_CONFLICT",
                    "event_id đã được dùng cho hướng cổng khác",
                )
            return await self._output(existing)

        # 2. Card validation (before any AI/evidence)
        normalized_uid = normalize_card_uid(payload.card_uid)
        if len(normalized_uid) < 4:
            return await self._failed(payload, ["CARD_UID_INVALID"])

        card = await self.cards.get_by_uid(normalized_uid)
        if card is None:
            return await self._failed(payload, ["CARD_NOT_FOUND"])

        if card.status != CardStatus.ACTIVE:
            return await self._failed(
                payload,
                ["CARD_NOT_ACTIVE"],
                card_id=card.id,
                card_status=card.status,
            )

        # 3. Owner resolution
        driver = await self.drivers.get(card.driver_id)
        if driver is None:
            return await self._failed(
                payload,
                ["CARD_OWNER_NOT_FOUND"],
                card_id=card.id,
                card_status=card.status,
                card_verified=True,
            )

        if driver.status != RecordStatus.ACTIVE:
            return await self._failed(
                payload,
                ["CARD_OWNER_INACTIVE"],
                card_id=card.id,
                card_status=card.status,
                card_verified=True,
                driver_id=driver.id,
                driver_name=driver.full_name,
            )

        # 4. Evidence storage (concurrent)
        try:
            snapshot_refs = await self._store_snapshots(payload)
        except SmartGateError as exc:
            return await self._failed(
                payload,
                [exc.code],
                card_id=card.id,
                card_status=card.status,
                card_verified=True,
                driver_id=driver.id,
                driver_name=driver.full_name,
                is_processing_error=True,
                message=exc.message,
            )
        except Exception as exc:
            logger.exception(
                "Lưu bằng chứng bãi xe phát sinh lỗi ngoài dự kiến cho event %s",
                payload.event_id,
                exc_info=exc,
            )
            return await self._failed(
                payload,
                ["EVIDENCE_STORE_UNEXPECTED_ERROR"],
                card_id=card.id,
                card_status=card.status,
                card_verified=True,
                driver_id=driver.id,
                driver_name=driver.full_name,
                is_processing_error=True,
                message="Không thể lưu bằng chứng cổng; hệ thống từ chối mở cổng",
            )

        # 5. Parallel AI (LPR + face extraction)
        try:
            plate_observation, face_observation = await asyncio.gather(
                self.lpr.recognize(payload.plate_image),
                self.face.extract(payload.face_image),
            )
        except SmartGateError as exc:
            return await self._failed(
                payload,
                [exc.code],
                card_id=card.id,
                card_status=card.status,
                card_verified=True,
                driver_id=driver.id,
                driver_name=driver.full_name,
                snapshot_refs=snapshot_refs,
                is_processing_error=True,
                message=exc.message,
            )
        except Exception as exc:
            logger.exception(
                "Pipeline AI bãi xe phát sinh lỗi ngoài dự kiến cho event %s",
                payload.event_id,
                exc_info=exc,
            )
            return await self._failed(
                payload,
                ["AI_PIPELINE_UNEXPECTED_ERROR"],
                card_id=card.id,
                card_status=card.status,
                card_verified=True,
                driver_id=driver.id,
                driver_name=driver.full_name,
                snapshot_refs=snapshot_refs,
                is_processing_error=True,
                message="Pipeline AI gặp lỗi; hệ thống từ chối mở cổng",
            )

        # 6. Factor evaluation (deterministic order)
        reason_codes: list[str] = []

        # Plate
        active_vehicles = await self.vehicles.list_active()
        plate_match = self.plate_matcher.match(plate_observation.text, active_vehicles)
        plate_matched = plate_match.vehicle is not None
        plate_confidence_ok = (
            plate_observation.confidence >= self.settings.plate_confidence_threshold
        )
        if not plate_matched:
            reason_codes.append("VEHICLE_NOT_MATCHED")
        if not plate_confidence_ok:
            reason_codes.append("PLATE_LOW_CONFIDENCE")
        plate_verified = plate_matched and plate_confidence_ok

        # Face quality & liveness
        face_quality_ok = True
        if self.settings.require_liveness and not face_observation.is_live:
            reason_codes.append("FACE_SPOOF")
            face_quality_ok = False
        if face_observation.detector_confidence < self.settings.face_detector_threshold:
            reason_codes.append("FACE_LOW_CONFIDENCE")
            face_quality_ok = False

        # Face owner match
        face_matches, face_similarity = self.face_matcher.matches_driver(face_observation, driver)
        if not face_matches:
            reason_codes.append("FACE_NOT_CARD_OWNER")
        face_verified = face_quality_ok and face_matches

        # Driver-vehicle authorization
        authorization_verified = False
        now = datetime.now(UTC)
        if plate_match.vehicle is not None:
            authorized = await self.authorizations.is_authorized(
                driver.id, plate_match.vehicle.id, now
            )
            if authorized:
                authorization_verified = True
            else:
                reason_codes.append("DRIVER_VEHICLE_NOT_AUTHORIZED")

        verification_status = (
            VerificationStatus.FAILED if reason_codes else VerificationStatus.PASSED
        )
        verification_score = (
            min(plate_match.score, face_similarity) if not reason_codes else 0.0
        )
        vehicle_type = plate_match.vehicle.vehicle_type if plate_match.vehicle else None

        gate_log = GateLog(
            event_id=payload.event_id,
            direction=payload.direction,
            verification_status=verification_status,
            observed_plate=plate_observation.text,
            plate_score=plate_match.score,
            plate_match_type=plate_match.match_type,
            face_similarity=face_similarity,
            verification_score=verification_score,
            reason_codes=reason_codes or ["ALL_CHECKS_PASSED"],
            driver_id=driver.id,
            vehicle_id=plate_match.vehicle.id if plate_match.vehicle else None,
            snapshot_refs=snapshot_refs,
            model_versions={
                "lpr": plate_observation.model_version,
                "face": face_observation.model_version,
            },
            threshold_version=self.settings.threshold_version,
            occurred_at=now,
            card_id=card.id,
            card_status=card.status,
            card_verified=True,
            face_verified=face_verified,
            plate_verified=plate_verified,
            authorization_verified=authorization_verified,
            vehicle_type=vehicle_type,
        )

        # 7. Store GateLog & handle concurrent duplicate race
        stored = await self.gate_logs.add(gate_log)
        if stored.id != gate_log.id:
            return await self._output(stored)

        # 8. Alert handling on failure
        if verification_status == VerificationStatus.FAILED:
            alert = await self.alerts.create(
                event_id=payload.event_id,
                alert_type=(
                    "ENTRY_MISMATCH"
                    if payload.direction == Direction.ENTRY
                    else "EXIT_MISMATCH"
                ),
                severity=AlertSeverity.HIGH,
                message=(
                    "Xác minh Gate In thất bại"
                    if payload.direction == Direction.ENTRY
                    else "Xác minh Gate Out thất bại"
                ),
                data={
                    "gate_log_id": str(stored.id),
                    "observed_plate": stored.observed_plate,
                    "reason_codes": stored.reason_codes,
                    "card_id": str(stored.card_id),
                },
            )
            return await self._output(
                stored,
                permit_granted=False,
                alert_id=alert.id,
                driver_name=driver.full_name,
            )

        # 9. Success path: Barrier
        permit_granted = await self.barrier.open(stored, payload.gate_id)
        stored = await self.gate_logs.get_by_event_id(payload.event_id) or stored
        return await self._output(
            stored,
            permit_granted=permit_granted,
            driver_name=driver.full_name,
        )

    async def _store_snapshots(
        self, payload: ParkingGateVerificationInput
    ) -> list[str]:
        prefix = "gate-entry" if payload.direction == Direction.ENTRY else "gate-exit"
        return list(
            await asyncio.gather(
                self.evidence.store(
                    payload.plate_image,
                    category=f"{prefix}-plate",
                    correlation_id=payload.event_id,
                    content_type="image/jpeg",
                    extension="jpg",
                ),
                self.evidence.store(
                    payload.face_image,
                    category=f"{prefix}-face",
                    correlation_id=payload.event_id,
                    content_type="image/jpeg",
                    extension="jpg",
                ),
            )
        )

    async def _failed(
        self,
        payload: ParkingGateVerificationInput,
        reason_codes: list[str],
        *,
        card_id: UUID | None = None,
        card_status: CardStatus | None = None,
        card_verified: bool = False,
        driver_id: UUID | None = None,
        driver_name: str | None = None,
        snapshot_refs: list[str] | None = None,
        is_processing_error: bool = False,
        message: str | None = None,
    ) -> VerificationOutput:
        gate_log = GateLog(
            event_id=payload.event_id,
            direction=payload.direction,
            verification_status=VerificationStatus.FAILED,
            observed_plate="",
            plate_score=0.0,
            plate_match_type=PlateMatchType.NONE,
            face_similarity=0.0,
            verification_score=0.0,
            reason_codes=reason_codes,
            driver_id=driver_id,
            snapshot_refs=snapshot_refs or [],
            threshold_version=self.settings.threshold_version,
            occurred_at=datetime.now(UTC),
            card_id=card_id,
            card_status=card_status,
            card_verified=card_verified,
            face_verified=False,
            plate_verified=False,
            authorization_verified=False,
        )
        stored = await self.gate_logs.add(gate_log)
        if stored.id != gate_log.id:
            return await self._output(stored)

        alert_type = (
            (
                "ENTRY_PROCESSING_FAILED"
                if payload.direction == Direction.ENTRY
                else "EXIT_PROCESSING_FAILED"
            )
            if is_processing_error
            else (
                "ENTRY_MISMATCH"
                if payload.direction == Direction.ENTRY
                else "EXIT_MISMATCH"
            )
        )
        alert_msg = message or (
            (
                "Lỗi xử lý xác minh cổng vào"
                if payload.direction == Direction.ENTRY
                else "Lỗi xử lý xác minh cổng ra"
            )
            if is_processing_error
            else (
                "Xác minh Gate In thất bại"
                if payload.direction == Direction.ENTRY
                else "Xác minh Gate Out thất bại"
            )
        )
        alert_data: dict[str, Any] = {
            "gate_log_id": str(stored.id),
            "reason_codes": stored.reason_codes,
        }
        if stored.observed_plate:
            alert_data["observed_plate"] = stored.observed_plate
        if stored.card_id is not None:
            alert_data["card_id"] = str(stored.card_id)

        alert = await self.alerts.create(
            event_id=payload.event_id,
            alert_type=alert_type,
            severity=AlertSeverity.HIGH,
            message=alert_msg,
            data=alert_data,
        )
        return await self._output(
            stored,
            permit_granted=False,
            alert_id=alert.id,
            driver_name=driver_name,
        )

    async def _output(
        self,
        gate_log: GateLog,
        *,
        permit_granted: bool | None = None,
        alert_id: UUID | None = None,
        driver_name: str | None = None,
    ) -> VerificationOutput:
        if driver_name is None and gate_log.driver_id is not None:
            driver = await self.drivers.get(gate_log.driver_id)
            if driver is not None:
                driver_name = driver.full_name

        return VerificationOutput(
            gate_log_id=gate_log.id,
            event_id=gate_log.event_id,
            direction=gate_log.direction,
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
            card_id=gate_log.card_id,
            card_status=gate_log.card_status,
            card_verified=gate_log.card_verified,
            face_verified=gate_log.face_verified,
            plate_verified=gate_log.plate_verified,
            authorization_verified=gate_log.authorization_verified,
            driver_name=driver_name,
            vehicle_type=gate_log.vehicle_type,
        )
