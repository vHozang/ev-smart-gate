from __future__ import annotations

import asyncio
import os

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Barrier Simulator")
opened_commands: set[str] = set()


class BarrierCommand(BaseModel):
    gate_id: str
    command_id: str
    command: str


@app.post("/commands")
async def command(payload: BarrierCommand) -> dict[str, str]:
    """Mô phỏng ACK idempotent và cho phép ép timeout để kiểm thử fail-closed."""

    delay = float(os.getenv("BARRIER_SIMULATOR_DELAY_SECONDS", "0.05"))
    await asyncio.sleep(delay)
    if os.getenv("BARRIER_SIMULATOR_FAIL", "false").lower() == "true":
        return {"status": "FAILED", "command_id": payload.command_id}
    opened_commands.add(payload.command_id)
    return {"status": "ACKNOWLEDGED", "command_id": payload.command_id}


@app.get("/commands/{command_id}")
async def get_command(command_id: str) -> dict[str, str]:
    status = "ACKNOWLEDGED" if command_id in opened_commands else "NOT_FOUND"
    return {"status": status, "command_id": command_id}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
