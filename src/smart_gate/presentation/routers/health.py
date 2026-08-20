from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status

from smart_gate.bootstrap.container import Container
from smart_gate.presentation.dependencies import get_container

router = APIRouter(tags=["Sức khỏe hệ thống"])


@router.get("/health/live")
async def liveness() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness(
    response: Response,
    container: Container = Depends(get_container),
) -> dict[str, str]:
    if not await container.database.ping():
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_ready"}
    return {"status": "ready"}
