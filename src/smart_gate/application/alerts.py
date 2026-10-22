from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from smart_gate.domain.entities import SecurityAlert
from smart_gate.domain.enums import AlertSeverity
from smart_gate.domain.ports import AlertRepository, RealtimePublisher, SequenceRepository


class AlertService:
    def __init__(
        self,
        alerts: AlertRepository,
        sequences: SequenceRepository,
        publisher: RealtimePublisher,
    ) -> None:
        self.alerts = alerts
        self.sequences = sequences
        self.publisher = publisher

    async def create(
        self,
        *,
        event_id: str,
        alert_type: str,
        severity: AlertSeverity,
        message: str,
        data: dict[str, Any],
    ) -> SecurityAlert:
        alert = SecurityAlert(
            event_id=event_id,
            sequence=await self.sequences.next("security-alerts"),
            alert_type=alert_type,
            severity=severity,
            message=message,
            data=data,
            occurred_at=datetime.now(UTC),
        )
        stored = await self.alerts.add(alert)
        await self.publisher.publish(
            {
                "event_id": stored.event_id,
                "sequence": stored.sequence,
                "event_type": "SECURITY_ALERT",
                "severity": stored.severity,
                "occurred_at": stored.occurred_at.isoformat() if stored.occurred_at else None,
                "data": {
                    "alert_id": str(stored.id),
                    "alert_type": stored.alert_type,
                    "message": stored.message,
                    **stored.data,
                },
            }
        )
        return stored
