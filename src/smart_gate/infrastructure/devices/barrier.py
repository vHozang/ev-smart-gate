from __future__ import annotations

import asyncio

import httpx

from smart_gate.config import Settings


class SimulatorBarrierGateway:
    """Barrier in-memory có idempotency, phù hợp local và test end-to-end."""

    def __init__(self) -> None:
        self.opened_commands: set[str] = set()
        self.fail_next = False

    async def open(self, gate_id: str, command_id: str) -> bool:
        if command_id in self.opened_commands:
            return True
        await asyncio.sleep(0.05)
        if self.fail_next:
            self.fail_next = False
            return False
        self.opened_commands.add(command_id)
        return True


class HttpBarrierGateway:
    """Adapter HTTP tổng quát; vendor-specific mapping nằm hoàn toàn ở Infrastructure."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = httpx.AsyncClient(timeout=settings.barrier_timeout_seconds)

    async def open(self, gate_id: str, command_id: str) -> bool:
        try:
            headers = (
                {"Authorization": f"Bearer {self.settings.barrier_http_token}"}
                if self.settings.barrier_http_token
                else {}
            )
            response = await self._client.post(
                self.settings.barrier_http_url,
                json={"gate_id": gate_id, "command_id": command_id, "command": "OPEN"},
                headers=headers,
            )
            if not response.is_success:
                return False
            payload = response.json()
            return payload.get("status") == "ACKNOWLEDGED"
        except httpx.HTTPError:
            return False

    async def close(self) -> None:
        await self._client.aclose()
