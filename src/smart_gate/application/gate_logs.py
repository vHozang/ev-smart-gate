from __future__ import annotations

from uuid import UUID

from smart_gate.application.dto import GateLogOutput
from smart_gate.domain.entities import GateLog
from smart_gate.domain.enums import Direction, VerificationStatus
from smart_gate.domain.exceptions import NotFoundError
from smart_gate.domain.ports import EvidenceStorageGateway, GateLogRepository


class GateLogQueryService:
    """Cung cấp truy vấn nhật ký và bằng chứng cổng cho giao diện vận hành."""

    def __init__(
        self,
        gate_logs: GateLogRepository,
        evidence: EvidenceStorageGateway,
    ) -> None:
        self.gate_logs = gate_logs
        self.evidence = evidence

    async def list_logs(
        self,
        *,
        limit: int,
        direction: Direction | None = None,
        verification_status: VerificationStatus | None = None,
    ) -> list[GateLogOutput]:
        logs = await self.gate_logs.list_recent(limit, direction, verification_status)
        return [self.output(item) for item in logs]

    async def read_snapshot(self, gate_log_id: UUID, snapshot_index: int) -> bytes:
        gate_log = await self.gate_logs.get(gate_log_id)
        if gate_log is None:
            raise NotFoundError("GATE_LOG_NOT_FOUND", "Không tìm thấy nhật ký cổng")
        if snapshot_index < 0 or snapshot_index >= len(gate_log.snapshot_refs):
            raise NotFoundError("GATE_SNAPSHOT_NOT_FOUND", "Không tìm thấy ảnh chụp cổng")
        return await self.evidence.read(gate_log.snapshot_refs[snapshot_index])

    @staticmethod
    def output(gate_log: GateLog) -> GateLogOutput:
        return GateLogOutput(
            id=gate_log.id,
            event_id=gate_log.event_id,
            direction=gate_log.direction,
            verification_status=gate_log.verification_status,
            observed_plate=gate_log.observed_plate,
            plate_score=gate_log.plate_score,
            plate_match_type=gate_log.plate_match_type,
            face_similarity=gate_log.face_similarity,
            verification_score=gate_log.verification_score,
            reason_codes=gate_log.reason_codes,
            driver_id=gate_log.driver_id,
            vehicle_id=gate_log.vehicle_id,
            order_id=gate_log.order_id,
            snapshot_count=len(gate_log.snapshot_refs),
            barrier_status=gate_log.barrier_status,
            model_versions=gate_log.model_versions,
            threshold_version=gate_log.threshold_version,
            occurred_at=gate_log.occurred_at,
            completed_at=gate_log.completed_at,
            card_id=gate_log.card_id,
            card_status=gate_log.card_status,
            card_verified=gate_log.card_verified,
            face_verified=gate_log.face_verified,
            plate_verified=gate_log.plate_verified,
            authorization_verified=gate_log.authorization_verified,
            vehicle_type=gate_log.vehicle_type,
        )
