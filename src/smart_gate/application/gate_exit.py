from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

from smart_gate.application.alerts import AlertService
from smart_gate.application.barrier import BarrierService
from smart_gate.application.dto import ExitVerificationInput, VerificationOutput
from smart_gate.config import Settings
from smart_gate.domain.entities import GateLog
from smart_gate.domain.enums import (
    AlertSeverity,
    BarrierStatus,
    Direction,
    OrderStatus,
    PlateMatchType,
    VerificationStatus,
)
from smart_gate.domain.exceptions import ConflictError, SmartGateError
from smart_gate.domain.ports import (
    DriverRepository,
    EvidenceStorageGateway,
    ExitSlipGateway,
    FaceGateway,
    GateLogRepository,
    LicensePlateGateway,
    OrderRepository,
    QrReaderGateway,
    SecretHashGateway,
    UnitOfWork,
    VehicleRepository,
)
from smart_gate.domain.services import FaceMatchingService, PlateMatchingService

logger = logging.getLogger(__name__)


class VerifyExitUseCase:
    """Xác minh ba chiều giữa QR đã ký, dữ liệu live và lệnh xuất kho nội bộ."""

    def __init__(
        self,
        settings: Settings,
        drivers: DriverRepository,
        vehicles: VehicleRepository,
        orders: OrderRepository,
        gate_logs: GateLogRepository,
        evidence: EvidenceStorageGateway,
        lpr: LicensePlateGateway,
        face: FaceGateway,
        qr_reader: QrReaderGateway,
        slips: ExitSlipGateway,
        secret_hasher: SecretHashGateway,
        plate_matcher: PlateMatchingService,
        face_matcher: FaceMatchingService,
        alerts: AlertService,
        barrier: BarrierService,
        unit_of_work: UnitOfWork,
    ) -> None:
        self.settings = settings
        self.drivers = drivers
        self.vehicles = vehicles
        self.orders = orders
        self.gate_logs = gate_logs
        self.evidence = evidence
        self.lpr = lpr
        self.face = face
        self.qr_reader = qr_reader
        self.slips = slips
        self.secret_hasher = secret_hasher
        self.plate_matcher = plate_matcher
        self.face_matcher = face_matcher
        self.alerts = alerts
        self.barrier = barrier
        self.unit_of_work = unit_of_work

    async def execute(self, payload: ExitVerificationInput) -> VerificationOutput:
        existing = await self.gate_logs.get_by_event_id(payload.event_id)
        if existing is not None:
            if existing.direction != Direction.EXIT:
                raise ConflictError(
                    "EVENT_ID_WORKFLOW_CONFLICT",
                    "event_id đã được dùng cho một workflow cổng khác",
                )
            await self._recover_completed_order(existing)
            return self._output(existing)

        try:
            snapshot_refs = await self._store_snapshots(payload)
        except SmartGateError as exc:
            return await self._failed(
                payload,
                [],
                [exc.code],
                message="Không thể lưu bằng chứng Gate Out; hệ thống từ chối mở cổng",
            )
        except Exception as exc:
            logger.exception(
                "Lưu bằng chứng Gate Out phát sinh lỗi ngoài dự kiến cho event %s",
                payload.event_id,
                exc_info=exc,
            )
            return await self._failed(
                payload,
                [],
                ["EVIDENCE_STORE_UNEXPECTED_ERROR"],
                message="Không thể lưu bằng chứng Gate Out; hệ thống từ chối mở cổng",
            )

        try:
            plate_observation, face_observation, qr_result = await asyncio.gather(
                self.lpr.recognize(payload.plate_image),
                self.face.extract(payload.face_image),
                self.qr_reader.read_token(payload.slip_image),
            )
            token, ocr_hint = qr_result
            if token is None:
                reason_codes = ["QR_NOT_READABLE"]
                if ocr_hint:
                    reason_codes.append("OCR_HINT_NOT_TRUSTED")
                return await self._failed(
                    payload,
                    snapshot_refs,
                    reason_codes,
                    message="Không đọc được QR có chữ ký số trên phiếu xuất kho",
                )
            claims = await self.slips.verify(token)
        except SmartGateError as exc:
            return await self._failed(
                payload,
                snapshot_refs,
                [exc.code],
                message=exc.message,
            )
        except Exception as exc:
            logger.exception(
                "Pipeline AI/QR Gate Out phát sinh lỗi ngoài dự kiến cho event %s",
                payload.event_id,
                exc_info=exc,
            )
            return await self._failed(
                payload,
                snapshot_refs,
                ["AI_PIPELINE_UNEXPECTED_ERROR"],
                message="Pipeline AI/QR Gate Out gặp lỗi; hệ thống từ chối mở cổng",
            )

        order = await self.orders.get_by_order_id(claims.order_id)
        if order is None:
            return await self._failed(
                payload,
                snapshot_refs,
                ["ORDER_NOT_FOUND"],
                message="QR không liên kết với lệnh xuất kho nội bộ",
            )

        driver = await self.drivers.get(order.assigned_driver_id)
        vehicle = await self.vehicles.get(order.assigned_vehicle_id)
        reason_codes = self._validate_order_and_claims(order, claims, token)
        if driver is None:
            reason_codes.append("ASSIGNED_DRIVER_NOT_FOUND")
        if vehicle is None:
            reason_codes.append("ASSIGNED_VEHICLE_NOT_FOUND")

        face_similarity = 0.0
        plate_score = 0.0
        plate_match_type = PlateMatchType.NONE
        if driver is not None:
            face_matched, face_similarity = self.face_matcher.matches_driver(
                face_observation, driver
            )
            if not face_matched:
                reason_codes.append("FACE_NOT_ASSIGNED_DRIVER")
        if vehicle is not None:
            plate_match = self.plate_matcher.match(plate_observation.text, [vehicle])
            plate_score = plate_match.score
            plate_match_type = plate_match.match_type
            if plate_match.vehicle is None or plate_match.vehicle.id != order.assigned_vehicle_id:
                reason_codes.append("PLATE_NOT_ASSIGNED_VEHICLE")
        if self.settings.require_liveness and not face_observation.is_live:
            reason_codes.append("FACE_SPOOF")
        if plate_observation.confidence < self.settings.plate_confidence_threshold:
            reason_codes.append("PLATE_LOW_CONFIDENCE")
        if face_observation.detector_confidence < self.settings.face_detector_threshold:
            reason_codes.append("FACE_LOW_CONFIDENCE")

        if reason_codes:
            return await self._failed(
                payload,
                snapshot_refs,
                reason_codes,
                message="Xác minh ba chiều Gate Out thất bại",
                observed_plate=plate_observation.text,
                plate_score=plate_score,
                plate_match_type=plate_match_type,
                face_similarity=face_similarity,
                driver_id=order.assigned_driver_id,
                vehicle_id=order.assigned_vehicle_id,
                order_id=order.order_id,
                model_versions={
                    "lpr": plate_observation.model_version,
                    "face": face_observation.model_version,
                },
            )

        gate_log = GateLog(
            event_id=payload.event_id,
            direction=Direction.EXIT,
            verification_status=VerificationStatus.PASSED,
            observed_plate=plate_observation.text,
            plate_score=plate_score,
            plate_match_type=plate_match_type,
            face_similarity=face_similarity,
            verification_score=min(plate_score, face_similarity),
            reason_codes=["ALL_CHECKS_PASSED"],
            driver_id=order.assigned_driver_id,
            vehicle_id=order.assigned_vehicle_id,
            order_id=order.order_id,
            snapshot_refs=snapshot_refs,
            model_versions={
                "lpr": plate_observation.model_version,
                "face": face_observation.model_version,
                "slip": claims.kid,
            },
            threshold_version=self.settings.threshold_version,
            occurred_at=datetime.now(UTC),
        )
        async with self.unit_of_work.transaction():
            claimed_order = await self.orders.claim_exit(order.order_id, payload.event_id)
            stored = await self.gate_logs.add(gate_log) if claimed_order is not None else None
        if claimed_order is None or stored is None:
            return await self._failed(
                payload,
                snapshot_refs,
                ["SLIP_REPLAY_OR_EXIT_IN_PROGRESS"],
                message="Phiếu đang được xử lý bởi một lượt Gate Out khác hoặc đã được sử dụng",
                observed_plate=plate_observation.text,
                plate_score=plate_score,
                plate_match_type=plate_match_type,
                face_similarity=face_similarity,
                driver_id=order.assigned_driver_id,
                vehicle_id=order.assigned_vehicle_id,
                order_id=order.order_id,
            )

        opened = await self.barrier.open(stored, payload.gate_id)
        stored = await self.gate_logs.get_by_event_id(payload.event_id) or stored
        if not opened:
            await self.orders.release_exit(order.order_id, payload.event_id)
            return self._output(stored, permit_granted=False)

        completed = await self.orders.complete_exit(
            order.order_id, payload.event_id, datetime.now(UTC)
        )
        if completed is None:
            alert = await self.alerts.create(
                event_id=payload.event_id,
                alert_type="ORDER_COMPLETION_FAILED",
                severity=AlertSeverity.CRITICAL,
                message="Barrier đã ACK nhưng không thể hoàn tất lệnh xuất kho",
                data={"gate_log_id": str(stored.id), "order_id": order.order_id},
            )
            return self._output(stored, permit_granted=True, alert_id=alert.id)
        return self._output(stored, permit_granted=True)

    def _validate_order_and_claims(self, order, claims, token: str) -> list[str]:
        reason_codes: list[str] = []
        now = datetime.now(UTC)
        if order.status != OrderStatus.SLIP_ISSUED:
            reason_codes.append("ORDER_STATUS_INVALID")
        if not order.valid_from <= now < order.valid_until:
            reason_codes.append("ORDER_NOT_EFFECTIVE")
        if claims.driver_id != order.assigned_driver_id:
            reason_codes.append("SLIP_DRIVER_MISMATCH")
        if claims.vehicle_id != order.assigned_vehicle_id:
            reason_codes.append("SLIP_VEHICLE_MISMATCH")
        if claims.slip_version != order.slip_version:
            reason_codes.append("SLIP_VERSION_INVALID")
        if order.slip_jti_hash is None or not self.secret_hasher.verify(
            claims.jti, order.slip_jti_hash
        ):
            reason_codes.append("SLIP_JTI_INVALID")
        if order.slip_token_hash is None or not self.secret_hasher.verify(
            token, order.slip_token_hash
        ):
            reason_codes.append("SLIP_TOKEN_INVALID")
        return reason_codes

    async def _store_snapshots(self, payload: ExitVerificationInput) -> list[str]:
        return list(
            await asyncio.gather(
                self.evidence.store(
                    payload.plate_image,
                    category="gate-exit-plate",
                    correlation_id=payload.event_id,
                    content_type="image/jpeg",
                    extension="jpg",
                ),
                self.evidence.store(
                    payload.face_image,
                    category="gate-exit-face",
                    correlation_id=payload.event_id,
                    content_type="image/jpeg",
                    extension="jpg",
                ),
                self.evidence.store(
                    payload.slip_image,
                    category="gate-exit-slip",
                    correlation_id=payload.event_id,
                    content_type="image/jpeg",
                    extension="jpg",
                ),
            )
        )

    async def _failed(
        self,
        payload: ExitVerificationInput,
        snapshot_refs: list[str],
        reason_codes: list[str],
        *,
        message: str,
        observed_plate: str = "",
        plate_score: float = 0.0,
        plate_match_type: PlateMatchType = PlateMatchType.NONE,
        face_similarity: float = 0.0,
        driver_id: UUID | None = None,
        vehicle_id: UUID | None = None,
        order_id: str | None = None,
        model_versions: dict[str, str] | None = None,
    ) -> VerificationOutput:
        gate_log = await self.gate_logs.add(
            GateLog(
                event_id=payload.event_id,
                direction=Direction.EXIT,
                verification_status=VerificationStatus.FAILED,
                observed_plate=observed_plate,
                plate_score=plate_score,
                plate_match_type=plate_match_type,
                face_similarity=face_similarity,
                verification_score=0.0,
                reason_codes=reason_codes,
                driver_id=driver_id,
                vehicle_id=vehicle_id,
                order_id=order_id,
                snapshot_refs=snapshot_refs,
                model_versions=model_versions or {},
                threshold_version=self.settings.threshold_version,
                occurred_at=datetime.now(UTC),
            )
        )
        alert = await self.alerts.create(
            event_id=payload.event_id,
            alert_type="EXIT_VERIFICATION_FAILED",
            severity=AlertSeverity.CRITICAL,
            message=message,
            data={
                "gate_log_id": str(gate_log.id),
                "order_id": order_id,
                "observed_plate": observed_plate,
                "reason_codes": reason_codes,
            },
        )
        return self._output(gate_log, permit_granted=False, alert_id=alert.id)

    async def _recover_completed_order(self, gate_log: GateLog) -> None:
        if (
            gate_log.direction == Direction.EXIT
            and gate_log.verification_status == VerificationStatus.PASSED
            and gate_log.barrier_status == BarrierStatus.OPENED
            and gate_log.order_id is not None
        ):
            await self.orders.complete_exit(
                gate_log.order_id, gate_log.event_id, gate_log.completed_at or datetime.now(UTC)
            )

    @staticmethod
    def _output(
        gate_log: GateLog,
        *,
        permit_granted: bool | None = None,
        alert_id: UUID | None = None,
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
