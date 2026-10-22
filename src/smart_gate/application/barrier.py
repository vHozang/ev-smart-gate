from __future__ import annotations

import logging
from datetime import UTC, datetime

from smart_gate.application.alerts import AlertService
from smart_gate.domain.entities import GateCommand, GateLog
from smart_gate.domain.enums import (
    AlertSeverity,
    BarrierStatus,
    GateCommandStatus,
)
from smart_gate.domain.ports import (
    BarrierGateway,
    GateCommandRepository,
    GateLogRepository,
)

logger = logging.getLogger(__name__)


class BarrierService:
    def __init__(
        self,
        barrier: BarrierGateway,
        commands: GateCommandRepository,
        gate_logs: GateLogRepository,
        alerts: AlertService,
    ) -> None:
        self.barrier = barrier
        self.commands = commands
        self.gate_logs = gate_logs
        self.alerts = alerts

    async def open(self, gate_log: GateLog, gate_id: str) -> bool:
        command_id = f"open:{gate_id}:{gate_log.event_id}"
        existing = await self.commands.get_by_command_id(command_id)
        if existing is not None and existing.status == GateCommandStatus.ACKNOWLEDGED:
            gate_log.barrier_status = BarrierStatus.OPENED
            await self.gate_logs.update(gate_log)
            return True

        command = existing or GateCommand(
            command_id=command_id,
            gate_log_id=gate_log.id,
            gate_id=gate_id,
            issued_at=datetime.now(UTC),
        )
        if existing is None:
            command = await self.commands.add(command)
        gate_log.barrier_status = BarrierStatus.PENDING
        await self.gate_logs.update(gate_log)

        try:
            opened = await self.barrier.open(gate_id, command_id)
        except Exception as exc:
            logger.exception(
                "Adapter barrier phát sinh lỗi ngoài dự kiến cho command %s",
                command_id,
                exc_info=exc,
            )
            opened = False
            command.error_code = "BARRIER_GATEWAY_ERROR"
        if opened:
            command.status = GateCommandStatus.ACKNOWLEDGED
            command.acknowledged_at = datetime.now(UTC)
            gate_log.barrier_status = BarrierStatus.OPENED
            gate_log.completed_at = command.acknowledged_at
        else:
            command.status = GateCommandStatus.FAILED
            command.error_code = command.error_code or "BARRIER_NO_ACK"
            gate_log.barrier_status = BarrierStatus.FAILED
            await self.alerts.create(
                event_id=gate_log.event_id,
                alert_type="GATE_FAILURE",
                severity=AlertSeverity.CRITICAL,
                message="Barrier không xác nhận lệnh mở cổng",
                data={"gate_log_id": str(gate_log.id), "gate_id": gate_id},
            )
        await self.commands.update(command)
        await self.gate_logs.update(gate_log)
        return opened
