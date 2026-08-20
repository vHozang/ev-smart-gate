from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import Response

from smart_gate.application.dto import GateLogOutput
from smart_gate.bootstrap.container import Container
from smart_gate.domain.entities import User
from smart_gate.domain.enums import Direction, UserRole, VerificationStatus
from smart_gate.presentation.dependencies import get_container, require_roles

router = APIRouter(prefix="/api/v1/gate-logs", tags=["Nhật ký cổng"])


@router.get("", response_model=list[GateLogOutput])
async def list_gate_logs(
    limit: int = Query(100, ge=1, le=500),
    direction: Direction | None = Query(None),
    verification_status: VerificationStatus | None = Query(None),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> list[GateLogOutput]:
    return await container.gate_log_queries.list_logs(
        limit=limit,
        direction=direction,
        verification_status=verification_status,
    )


@router.get(
    "/{gate_log_id}/snapshots/{snapshot_index}",
    response_class=Response,
    responses={200: {"content": {"image/jpeg": {}}, "description": "Ảnh bằng chứng cổng"}},
)
async def read_gate_snapshot(
    gate_log_id: UUID,
    snapshot_index: int = Path(ge=0),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> Response:
    payload = await container.gate_log_queries.read_snapshot(gate_log_id, snapshot_index)
    return Response(content=payload, media_type="image/jpeg")
