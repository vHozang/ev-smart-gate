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
    cookie = websocket.cookies.get(container.settings.session_cookie_name)

    async def check_access() -> None:
        user = await container.auth.authenticate_session(cookie)
        if user.must_change_password:
            raise AuthorizationError("PASSWORD_CHANGE_REQUIRED", "Cần đổi mật khẩu")
        if user.permissions is not None:
            if "alerts:read" not in user.permissions:
                raise AuthorizationError("PERMISSION_DENIED", "Không có quyền xem cảnh báo")
        elif user.role not in {UserRole.ADMIN, UserRole.SECURITY}:
            raise AuthorizationError("ROLE_DENIED", "Vai trò không được xem cảnh báo")

    origin = websocket.headers.get("Origin")
    if origin is not None and origin != container.settings.app_public_origin.rstrip("/"):
        await websocket.close(code=4403)
        return
    try:
        await check_access()
    except (AuthenticationError, AuthorizationError):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    try:
        async with container.realtime.subscription() as queue:
            receive_task = asyncio.create_task(websocket.receive_text())
            event_task = asyncio.create_task(queue.get())
            try:
                while True:
                    done, _ = await asyncio.wait(
                        {receive_task, event_task}, timeout=1, return_when=asyncio.FIRST_COMPLETED
                    )
                    # Durable read trước mỗi send và tối đa một giây khi idle, trên mọi worker.
                    await check_access()
                    if event_task in done:
                        await websocket.send_json(event_task.result())
                        event_task = asyncio.create_task(queue.get())
                    if receive_task in done:
                        raw = receive_task.result()
                        if len(raw) > 65536:
                            await websocket.close(code=1009)
                            return
                        message = json.loads(raw)
                        if not isinstance(message, dict):
                            await websocket.close(code=1003)
                            return
                        if message.get("type") == "ping":
                            await websocket.send_json({"type": "pong"})
                        receive_task = asyncio.create_task(websocket.receive_text())
            finally:
                for task in (receive_task, event_task):
                    task.cancel()
                await asyncio.gather(receive_task, event_task, return_exceptions=True)
    except WebSocketDisconnect:
        return
    except AuthenticationError:
        await websocket.close(code=4401)
    except AuthorizationError:
        await websocket.close(code=4403)
    except json.JSONDecodeError:
        await websocket.close(code=1003)
    except Exception:
        # Lỗi storage/policy không được tiếp tục phát dữ liệu; không log cookie hoặc payload.
        await websocket.close(code=1011)
