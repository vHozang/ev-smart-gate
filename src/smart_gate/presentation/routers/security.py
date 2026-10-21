from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import APIRouter, Depends, Query, Response, WebSocket, WebSocketDisconnect

from smart_gate.bootstrap.container import Container
from smart_gate.domain.entities import User
from smart_gate.domain.enums import UserRole
from smart_gate.domain.exceptions import (
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    SmartGateError,
)
from smart_gate.domain.operator_identity import OperatorPrincipal
from smart_gate.presentation.contracts import migration as c
from smart_gate.presentation.dependencies import get_container, require_roles
from smart_gate.presentation.routers.operator_auth import operator_or_session_principal
from smart_gate.presentation.schemas import AlertResponse, AlertStatusRequest

router = APIRouter(prefix="/api/v1/security", tags=["An ninh"])
ws_router = APIRouter(tags=["An ninh thời gian thực"])
v2_router = APIRouter(
    prefix="/api/v2/security",
    tags=["An ninh v2"],
    responses={
        code: {
            "model": c.ErrorEnvelope,
            "headers": {
                "X-Request-ID": {"schema": {"type": "string"}},
                "Cache-Control": {"schema": {"type": "string", "const": "no-store"}},
            },
        }
        for code in (400, 401, 403, 404, 409, 410, 422, 429, 500, 503)
    },
)
v2_ws_router = APIRouter(tags=["An ninh thời gian thực v2"])

ALERT_EPOCH = "alerts-epoch-v1"


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


@v2_router.get(
    "/alerts",
    response_model=c.AlertBatch,
    operation_id="resyncAlertsV2",
    openapi_extra={
        "security": [{"OperatorJWT": []}],
        "x-required-permissions-all": ["alerts:read"],
    },
)
async def resync_alerts_v2(
    response: Response,
    after_sequence: int = Query(0, ge=0),
    watermark: int | None = Query(None, ge=0),
    epoch: str | None = Query(None, max_length=128),
    limit: int = Query(50, ge=1, le=200),
    actor: OperatorPrincipal = Depends(operator_or_session_principal),
    container: Container = Depends(get_container),
) -> c.AlertBatch:
    response.headers["Cache-Control"] = "no-store"
    actor.require("alerts:read")
    if epoch is not None and epoch != ALERT_EPOCH:
        raise SmartGateError(
            "ALERT_HISTORY_GAP",
            "Epoch cảnh báo đã thay đổi, cần tải lại từ đầu",
            status_code=410,
        )
    all_earliest = await container.alerts_repository.list_after(0, 1)
    oldest_seq = all_earliest[0].sequence if all_earliest else 1
    retained_from = (
        all_earliest[0].occurred_at
        if all_earliest and all_earliest[0].occurred_at is not None
        else datetime.now(UTC)
    )
    if after_sequence > 0 and all_earliest and oldest_seq > after_sequence + 1:
        raise SmartGateError(
            "ALERT_HISTORY_GAP",
            "Khoảng sequence yêu cầu đã bị cắt theo chính sách lưu trữ",
            status_code=410,
        )
    raw_items = await container.alerts_repository.list_after(after_sequence, limit + 1)
    has_more = len(raw_items) > limit
    sliced = raw_items[:limit]
    if watermark is not None:
        sliced = [item for item in sliced if item.sequence <= watermark]
    now = datetime.now(UTC)
    deltas = [
        c.AlertDelta(
            schema_version="1.0",
            type="alert.upsert",
            delivery_id=uuid5(NAMESPACE_URL, f"ev-smart-gate/alert-delta/{item.id}/{item.sequence}"),
            epoch=ALERT_EPOCH,
            sequence=max(1, item.sequence),
            occurred_at=item.occurred_at or now,
            alert=c.AlertView(
                id=item.id,
                event_id=item.event_id,
                sequence=max(1, item.sequence),
                alert_type=getattr(item.alert_type, "value", str(item.alert_type)),
                severity=getattr(item.severity, "value", str(item.severity)),
                status=getattr(item.status, "value", str(item.status)),
                message=item.message,
                data=item.data,
                occurred_at=item.occurred_at,
                resolved_at=item.resolved_at,
            ),
        )
        for item in sliced
    ]
    next_seq = max((d.sequence for d in deltas), default=after_sequence)
    current_watermark = watermark if watermark is not None else next_seq
    return c.AlertBatch(
        items=deltas,
        epoch=ALERT_EPOCH,
        oldest_sequence=max(1, oldest_seq),
        watermark=current_watermark,
        next_after_sequence=next_seq,
        has_more=has_more,
        coverage="complete",
        retained_from=retained_from,
    )


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


@v2_ws_router.websocket("/ws/v2/security/alerts")
async def alerts_websocket_v2(websocket: WebSocket) -> None:
    """Kênh WebSocket v2 dùng one-time ticket và đối chiếu quyền durable xuyên worker."""

    container: Container = websocket.app.state.container
    if container.operator_auth is None:
        await websocket.close(code=4401)
        return
    origin = websocket.headers.get("Origin")
    expected = container.settings.app_public_origin.rstrip("/")
    allowed = {expected}
    if container.settings.app_env == "local":
        allowed.update(item.rstrip("/") for item in container.settings.cors_origin_list)
    if origin is not None and origin.rstrip("/") not in allowed:
        await websocket.close(code=4403)
        return
    ticket = websocket.query_params.get("ticket", "")
    try:
        principal = await container.operator_auth.consume_ticket(ticket, "security.alerts")
    except AuthenticationError:
        await websocket.close(code=4401)
        return
    except AuthorizationError:
        await websocket.close(code=4403)
        return

    async def revalidate_access() -> None:
        if container.operator_auth is None:
            raise AuthenticationError("AUTH_NOT_READY", "Operator auth chưa sẵn sàng")
        refreshed = await container.operator_auth.revalidate(principal)
        refreshed.require("alerts:read")

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
                    if receive_task in done and receive_task.exception() is not None:
                        receive_task.result()
                    await revalidate_access()
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
        await websocket.close(code=1011)
