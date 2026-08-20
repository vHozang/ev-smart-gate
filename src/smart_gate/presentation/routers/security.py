from __future__ import annotations

import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from smart_gate.bootstrap.container import Container
from smart_gate.domain.entities import User
from smart_gate.domain.enums import UserRole
from smart_gate.domain.exceptions import AuthenticationError, AuthorizationError, NotFoundError
from smart_gate.presentation.dependencies import get_container, require_roles
from smart_gate.presentation.schemas import AlertResponse, AlertStatusRequest

router = APIRouter(prefix="/api/v1/security", tags=["An ninh"])
ws_router = APIRouter(tags=["An ninh thời gian thực"])


@router.get("/alerts", response_model=list[AlertResponse])
async def list_alerts(
    after_sequence: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> list[AlertResponse]:
    return [
        AlertResponse.model_validate(item)
        for item in await container.alerts_repository.list_after(after_sequence, limit)
    ]


@router.patch("/alerts/{alert_id}", response_model=AlertResponse)
async def update_alert(
    alert_id: UUID,
    payload: AlertStatusRequest,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.SECURITY, csrf=True)),
    container: Container = Depends(get_container),
) -> AlertResponse:
    alert = await container.alerts_repository.update_status(alert_id, payload.status)
    if alert is None:
        raise NotFoundError("ALERT_NOT_FOUND", "Không tìm thấy cảnh báo")
    return AlertResponse.model_validate(alert)


@ws_router.websocket("/ws/v1/security/alerts")
async def alerts_websocket(websocket: WebSocket) -> None:
    container: Container = websocket.app.state.container
    try:
        user = await container.auth.authenticate_session(
            websocket.cookies.get(container.settings.session_cookie_name)
        )
        if user.role not in {UserRole.ADMIN, UserRole.SECURITY}:
            raise AuthorizationError("ROLE_DENIED", "Vai trò không được xem cảnh báo")
    except (AuthenticationError, AuthorizationError):
        await websocket.close(code=4401)
        return

    await websocket.accept()
    try:
        async with container.realtime.subscription() as queue:
            while True:
                receive_task = asyncio.create_task(websocket.receive_text())
                event_task = asyncio.create_task(queue.get())
                done, pending = await asyncio.wait(
                    {receive_task, event_task}, return_when=asyncio.FIRST_COMPLETED
                )
                for task in pending:
                    task.cancel()
                if event_task in done:
                    await websocket.send_json(event_task.result())
                if receive_task in done:
                    message = json.loads(receive_task.result())
                    if message.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
    except (WebSocketDisconnect, json.JSONDecodeError):
        return
