from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, Query, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from smart_gate.application.migration_services import (
    PNG_1X1_BYTES,
    AnalyticsService,
    AssistantReportService,
    CoreAccessService,
    DeviceSettingsService,
    ValidationError,
)
from smart_gate.bootstrap.container import Container
from smart_gate.domain.core_access import (
    AccessPointConfig,
    CaptureBundleRecord,
    EmployeeRecord,
    PedestrianGrantRecord,
    VerificationRecord,
)
from smart_gate.domain.exceptions import AuthorizationError, InfrastructureError
from smart_gate.domain.operator_identity import OperatorPrincipal
from smart_gate.presentation.contracts import migration as c
from smart_gate.presentation.dependencies import get_container
from smart_gate.presentation.routers.operator_auth import operator_or_session_principal

COMMON_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    code: {
        "model": c.ErrorEnvelope,
        "headers": {
            "X-Request-ID": {
                "description": "Mã định danh yêu cầu dùng để đối chiếu nhật ký.",
                "schema": {"type": "string"},
            },
            "Cache-Control": {
                "description": "Chính sách bộ nhớ đệm cho phản hồi nhạy cảm.",
                "schema": {"type": "string"},
            },
        },
    }
    for code in (400, 401, 403, 404, 409, 410, 413, 422, 429, 500, 503)
}


def get_core_access(container: Container = Depends(get_container)) -> CoreAccessService:
    if container.core_access is None:
        raise InfrastructureError("CORE_ACCESS_NOT_READY", "Dịch vụ kiểm soát truy cập chưa sẵn sàng.")
    return container.core_access


def get_analytics(container: Container = Depends(get_container)) -> AnalyticsService:
    if container.analytics is None:
        raise InfrastructureError("ANALYTICS_NOT_READY", "Dịch vụ thống kê vận hành chưa sẵn sàng.")
    return container.analytics


def get_assistant(container: Container = Depends(get_container)) -> AssistantReportService:
    if container.assistant is None:
        raise InfrastructureError("ASSISTANT_NOT_READY", "Dịch vụ trợ lý báo cáo AI chưa sẵn sàng.")
    return container.assistant


def get_device_settings(container: Container = Depends(get_container)) -> DeviceSettingsService:
    if container.device_settings is None:
        raise InfrastructureError(
            "DEVICE_SETTINGS_NOT_READY", "Dịch vụ quản trị cấu hình thiết bị chưa sẵn sàng."
        )
    return container.device_settings


def _require_any(principal: OperatorPrincipal, *codes: str) -> None:
    if principal.must_change_password:
        raise AuthorizationError(
            "PASSWORD_CHANGE_REQUIRED", "Cần đổi mật khẩu trước khi tiếp tục"
        )
    for code in codes:
        if code in principal.permissions:
            return
        alias = code.replace("-", "_") if "-" in code else code.replace("_", "-")
        if alias in principal.permissions:
            return
    raise AuthorizationError("PERMISSION_DENIED", "Không có quyền thực hiện thao tác")


def _employee_view(rec: EmployeeRecord) -> c.EmployeeView:
    return c.EmployeeView(
        employee_id=rec.employee_id,
        person_id=rec.person_id,
        employee_code=rec.employee_code,
        is_active=rec.is_active,
        version=rec.version,
        created_at=rec.created_at,
    )


def _access_point_view(ap: AccessPointConfig) -> c.AccessPointView:
    return c.AccessPointView(
        id=ap.id,
        name=ap.name,
        supported_modes=ap.supported_modes,
        directions=ap.directions,
        calibration_version=ap.calibration_version,
        strict_capture_ready=ap.strict_capture_ready,
    )


def _grant_view(g: PedestrianGrantRecord) -> c.GrantView:
    return c.GrantView(
        id=g.id,
        employee_id=g.employee_id,
        access_point_ids=g.access_point_ids,
        directions=g.directions,
        valid_from=g.valid_from,
        valid_until=g.valid_until,
        reason=g.reason,
        status=g.status,
        version=g.version,
    )


def _capture_view(b: CaptureBundleRecord) -> c.CaptureView:
    return c.CaptureView(
        capture_bundle_id=b.capture_bundle_id,
        schema_version="1.0",
        encounter_id=b.encounter_id,
        access_point_id=b.access_point_id,
        lane_id=b.lane_id,
        access_mode=b.access_mode,
        received_at=b.received_at,
        expires_at=b.expires_at,
        calibration_version=b.calibration_version,
        face_sha256=b.face_sha256,
        plate_sha256=b.plate_sha256,
    )


def _verification_view(v: VerificationRecord) -> c.VerificationView:
    return c.VerificationView(
        operation_id=v.operation_id,
        event_id=v.event_id,
        gate_id=v.gate_id,
        access_mode=v.access_mode,
        direction=v.direction,
        status=v.status,
        verification_status=v.verification_status,
        permit_granted=v.permit_granted,
        barrier_status=v.barrier_status,
        command_id=v.command_id,
        factors=[
            c.FactorView(
                factor=f.factor,
                status=f.status,
                reason_code=f.reason_code,
                score=f.score,
            )
            for f in v.factors
        ],
        reason_codes=v.reason_codes,
        received_at=v.received_at,
        verification_completed_at=v.verification_completed_at,
        command_sent_at=v.command_sent_at,
        acknowledged_at=v.acknowledged_at,
    )


def _person_log_view(v: VerificationRecord) -> c.PersonLogView:
    return c.PersonLogView(
        operation_id=v.operation_id,
        event_id=v.event_id,
        gate_id=v.gate_id,
        access_mode=v.access_mode,
        direction=v.direction,
        status=v.status,
        verification_status=v.verification_status,
        permit_granted=v.permit_granted,
        barrier_status=v.barrier_status,
        command_id=v.command_id,
        factors=[
            c.FactorView(
                factor=f.factor,
                status=f.status,
                reason_code=f.reason_code,
                score=f.score,
            )
            for f in v.factors
        ],
        reason_codes=v.reason_codes,
        received_at=v.received_at,
        verification_completed_at=v.verification_completed_at,
        command_sent_at=v.command_sent_at,
        acknowledged_at=v.acknowledged_at,
        id=v.operation_id,
        person_id=v.person_id,
        employee_id=v.employee_id,
        snapshot_count=len(v.snapshot_bytes) if v.snapshot_bytes else 1,
    )


core_access_router = APIRouter(tags=["CoreAccess"], responses=COMMON_ERROR_RESPONSES)
analytics_router = APIRouter(tags=["Analytics"], responses=COMMON_ERROR_RESPONSES)
assistant_router = APIRouter(tags=["Assistant"], responses=COMMON_ERROR_RESPONSES)
device_settings_router = APIRouter(
    prefix="/api/v1/admin/device-settings",
    tags=["DeviceSettings"],
    responses=COMMON_ERROR_RESPONSES,
)


# ============================================================================
# M3 — Core Access: Danh bạ nhân viên, Điểm kiểm soát, Quyền đi bộ & Loại xe
# ============================================================================


@core_access_router.get(
    "/api/v1/employees",
    response_model=c.CursorPage[c.EmployeeView],
    operation_id="listEmployees",
)
async def list_employees(
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    search: Annotated[str | None, Query(max_length=128)] = None,
    is_active: bool | None = None,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.CursorPage[c.EmployeeView]:
    _require_any(principal, "employees:read", "drivers:read")
    items, next_cursor, has_more, total = await service.list_employees(
        cursor=cursor, limit=limit, search=search, is_active=is_active
    )
    return c.CursorPage[c.EmployeeView](
        items=[_employee_view(item) for item in items],
        next_cursor=next_cursor,
        has_more=has_more,
        coverage="complete",
        total=total,
    )


@core_access_router.post(
    "/api/v1/employees",
    response_model=c.EmployeeView,
    status_code=201,
    operation_id="createEmployee",
)
async def create_employee(
    payload: c.EmployeeCreate,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.EmployeeView:
    _require_any(principal, "employees:create", "drivers:create")
    key = (idempotency_key or f"auto-{payload.person_id}-{payload.employee_code}").strip()
    created = await service.create_employee(
        person_id=payload.person_id,
        employee_code=payload.employee_code,
        idempotency_key=key,
    )
    return _employee_view(created)


@core_access_router.get(
    "/api/v1/employees/{employee_id}",
    response_model=c.EmployeeView,
    operation_id="readEmployee",
)
async def read_employee(
    employee_id: UUID,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.EmployeeView:
    _require_any(principal, "employees:read", "drivers:read")
    record = await service.read_employee(employee_id)
    return _employee_view(record)


@core_access_router.patch(
    "/api/v1/employees/{employee_id}",
    response_model=c.EmployeeView,
    operation_id="updateEmployee",
)
async def update_employee(
    employee_id: UUID,
    payload: c.EmployeePatch,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.EmployeeView:
    _require_any(principal, "employees:update", "drivers:update")
    updated = await service.update_employee(
        employee_id=employee_id,
        expected_version=payload.expected_version,
        reason=payload.reason,
        employee_code=payload.employee_code,
        is_active=payload.is_active,
    )
    return _employee_view(updated)


@core_access_router.delete(
    "/api/v1/employees/{employee_id}",
    response_model=c.Message,
    include_in_schema=False,
)
async def delete_employee(
    employee_id: UUID,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.Message:
    _require_any(principal, "employees:update", "drivers:update", "drivers:deactivate")
    await service.delete_employee(employee_id)
    return c.Message(message="Đã xóa hồ sơ nhân viên khỏi danh bạ.")


@core_access_router.get(
    "/api/v1/access-points",
    response_model=c.CursorPage[c.AccessPointView],
    operation_id="listAccessPoints",
)
async def list_access_points(
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.CursorPage[c.AccessPointView]:
    _require_any(principal, "access-points:read", "gate-logs:read", "drivers:read")
    items, next_cursor, has_more, total = await service.list_access_points(
        cursor=cursor, limit=limit
    )
    return c.CursorPage[c.AccessPointView](
        items=[_access_point_view(item) for item in items],
        next_cursor=next_cursor,
        has_more=has_more,
        coverage="complete",
        total=total,
    )


@core_access_router.get(
    "/api/v1/pedestrian-access-grants",
    response_model=c.CursorPage[c.GrantView],
    operation_id="listPedestrianGrants",
)
async def list_pedestrian_grants(
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    status: Literal["ACTIVE", "REVOKED"] | None = None,
    employee_id: UUID | None = None,
    access_point_id: Annotated[str | None, Query(max_length=128)] = None,
    direction: c.Direction | None = None,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.CursorPage[c.GrantView]:
    _require_any(
        principal,
        "pedestrian-grants:read",
        "driver-vehicle-authorizations:read",
        "employees:read",
    )
    items, next_cursor, has_more, total = await service.list_pedestrian_grants(
        cursor=cursor,
        limit=limit,
        status=status,
        employee_id=employee_id,
        access_point_id=access_point_id,
        direction=direction,
    )
    return c.CursorPage[c.GrantView](
        items=[_grant_view(item) for item in items],
        next_cursor=next_cursor,
        has_more=has_more,
        coverage="complete",
        total=total,
    )


@core_access_router.post(
    "/api/v1/pedestrian-access-grants",
    response_model=c.GrantView,
    status_code=201,
    operation_id="createPedestrianGrant",
)
async def create_pedestrian_grant(
    payload: c.GrantCreate,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.GrantView:
    _require_any(
        principal,
        "pedestrian-grants:create",
        "driver-vehicle-authorizations:create",
    )
    created = await service.create_pedestrian_grant(
        employee_id=payload.employee_id,
        access_point_ids=payload.access_point_ids,
        directions=payload.directions,
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
        reason=payload.reason,
    )
    return _grant_view(created)


class GrantPatchPayload(c.VersionedReason):
    access_point_ids: list[str] | None = None
    directions: list[c.Direction] | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    status: Literal["ACTIVE", "REVOKED"] | None = None


@core_access_router.patch(
    "/api/v1/pedestrian-access-grants/{grant_id}",
    response_model=c.GrantView,
    include_in_schema=False,
)
async def update_pedestrian_grant(
    grant_id: UUID,
    payload: GrantPatchPayload,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.GrantView:
    _require_any(
        principal,
        "pedestrian-grants:create",
        "pedestrian-grants:revoke",
        "driver-vehicle-authorizations:create",
    )
    updated = await service.update_pedestrian_grant(
        grant_id=grant_id,
        expected_version=payload.expected_version,
        reason=payload.reason,
        access_point_ids=payload.access_point_ids,
        directions=payload.directions,
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
        status=payload.status,
    )
    return _grant_view(updated)


@core_access_router.delete(
    "/api/v1/pedestrian-access-grants/{grant_id}",
    response_model=c.Message,
    operation_id="revokePedestrianGrant",
)
async def revoke_pedestrian_grant(
    grant_id: UUID,
    payload: c.VersionedReason,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.Message:
    _require_any(
        principal,
        "pedestrian-grants:revoke",
        "driver-vehicle-authorizations:revoke",
    )
    await service.revoke_pedestrian_grant(
        grant_id=grant_id,
        expected_version=payload.expected_version,
        reason=payload.reason,
    )
    return c.Message(message="Đã thu hồi quyền đi bộ qua cổng kiểm soát.")


@core_access_router.delete(
    "/api/v1/pedestrian-access-grants/{grant_id}/permanent",
    response_model=c.Message,
    include_in_schema=False,
)
async def delete_pedestrian_grant_permanent(
    grant_id: UUID,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.Message:
    _require_any(
        principal,
        "pedestrian-grants:revoke",
        "driver-vehicle-authorizations:revoke",
    )
    await service.delete_pedestrian_grant(grant_id)
    return c.Message(message="Đã xóa bản ghi quyền đi bộ.")


@core_access_router.get(
    "/api/v1/vehicle-types",
    response_model=c.CursorPage[c.VehicleTypeView],
    operation_id="listVehicleTypes",
)
async def list_vehicle_types(
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.CursorPage[c.VehicleTypeView]:
    _require_any(principal, "vehicles:read", "gate-logs:read")
    items, next_cursor, has_more, total = await service.list_vehicle_types(
        cursor=cursor, limit=limit
    )
    return c.CursorPage[c.VehicleTypeView](
        items=[c.VehicleTypeView.model_validate(item) for item in items],
        next_cursor=next_cursor,
        has_more=has_more,
        coverage="complete",
        total=total,
    )


@core_access_router.get(
    "/api/v1/person-access-logs",
    response_model=c.CursorPage[c.PersonLogView],
    operation_id="listPersonLogs",
)
async def list_person_logs(
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: datetime | None = None,
    employee_id: UUID | None = None,
    access_point_id: Annotated[str | None, Query(max_length=128)] = None,
    direction: c.Direction | None = None,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.CursorPage[c.PersonLogView]:
    _require_any(principal, "person-access-logs:read", "gate-logs:read")
    items, next_cursor, has_more, total = await service.list_person_access_logs(
        cursor=cursor,
        limit=limit,
        from_=from_,
        to=to,
        employee_id=employee_id,
        access_point_id=access_point_id,
        direction=direction,
    )
    return c.CursorPage[c.PersonLogView](
        items=[_person_log_view(item) for item in items],
        next_cursor=next_cursor,
        has_more=has_more,
        coverage="complete",
        total=total,
    )


@core_access_router.get(
    "/api/v1/person-access-logs/{access_log_id}/snapshots/{snapshot_index}",
    operation_id="readPersonEvidence",
)
async def read_person_evidence(
    access_log_id: UUID,
    snapshot_index: int,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> Response:
    _require_any(principal, "person-evidence:read", "gate-evidence:read")
    content = await service.read_person_evidence(access_log_id, snapshot_index)
    return Response(
        content=content,
        media_type="image/png",
        headers={"Cache-Control": "no-store, private"},
    )


@core_access_router.post(
    "/api/v1/capture-bundles",
    response_model=c.CaptureView,
    status_code=201,
    include_in_schema=False,
)
@core_access_router.post(
    "/api/v2/capture-bundles",
    response_model=c.CaptureView,
    status_code=201,
    operation_id="ingestCaptureBundle",
)
async def ingest_capture_bundle(
    request: Request,
    metadata: Annotated[str | None, Form()] = None,
    face_image: UploadFile | None = File(default=None),
    plate_image: UploadFile | None = File(default=None),
    x_device_key: Annotated[str | None, Header(alias="X-Device-Key")] = None,
    container: Container = Depends(get_container),
    service: CoreAccessService = Depends(get_core_access),
) -> c.CaptureView:
    # Cho phép xác thực bằng X-Device-Key (cổng/camera edge) hoặc Bearer/Session của operator
    if x_device_key:
        allowed_scopes = (
            "capture:ingest",
            "gate:entry",
            "gate:exit",
            "pedestrian:entry",
            "pedestrian:exit",
        )
        auth_svc = getattr(container, "auth", None)
        if auth_svc is None:
            raise AuthorizationError(
                "DEVICE_AUTH_UNAVAILABLE",
                "Dịch vụ xác thực khóa thiết bị chưa được cấu hình.",
            )
        last_err: Exception | None = None
        for scope in allowed_scopes:
            try:
                await auth_svc.authorize_device(x_device_key, scope)
                last_err = None
                break
            except Exception as exc:
                last_err = exc
        if last_err is not None:
            raise last_err
    else:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer ") and container.operator_auth is not None:
            token = auth_header.split(" ", 1)[1].strip()
            principal = await container.operator_auth.authenticate(token)
            _require_any(
                principal,
                "gates:verify-entry",
                "gates:verify-exit",
                "access:verify-pedestrian-entry",
            )
        else:
            cookie = request.cookies.get(container.settings.session_cookie_name)
            if cookie and container.settings.auth_legacy_enabled:
                await container.auth.authenticate_session(cookie)
            else:
                raise AuthorizationError(
                    "CAPTURE_AUTH_REQUIRED",
                    "Cần X-Device-Key hoặc Bearer token hợp lệ để gửi gói thu nhận.",
                )

    parsed_meta: c.CaptureMetadata
    face_bytes: bytes
    plate_bytes: bytes | None = None

    if metadata is not None:
        try:
            raw_meta = json.loads(metadata)
        except json.JSONDecodeError as exc:
            raise ValidationError(
                "INVALID_CAPTURE_METADATA", "Trường metadata trong multipart không phải JSON hợp lệ."
            ) from exc
        parsed_meta = c.CaptureMetadata.model_validate(raw_meta)
        face_bytes = await face_image.read() if face_image is not None else PNG_1X1_BYTES
        plate_bytes = await plate_image.read() if plate_image is not None else None
    else:
        body = await request.json()
        if isinstance(body, dict) and "schema_version" not in body and (
            "gate_id" in body or "access_point_id" in body
        ):
            now_iso = datetime.now(UTC).isoformat()
            access_pt = str(body.get("access_point_id") or body.get("gate_id") or "GATE-VEH-01")
            raw_vtype = str(body.get("access_mode") or body.get("vehicle_type") or "").lower()
            inferred_mode: str = (
                raw_vtype
                if raw_vtype in ("pedestrian", "motorcycle", "car", "truck")
                else ("pedestrian" if "PED" in access_pt.upper() else "car")
            )
            normalized_body: dict[str, Any] = {
                "schema_version": "1.0",
                "encounter_id": str(
                    body.get("encounter_id") or body.get("event_id") or f"ENC-{int(datetime.now(UTC).timestamp() * 1000)}"
                ),
                "access_point_id": access_pt,
                "lane_id": str(body.get("lane_id") or ("LANE-PED-01" if inferred_mode == "pedestrian" else "LANE-ENTRY-01")),
                "access_mode": inferred_mode,
                "calibration_version": str(body.get("calibration_version") or "cal-2026-10-v1"),
                "face_captured_at": body.get("face_captured_at") or body.get("captured_at") or now_iso,
                "plate_captured_at": (
                    None
                    if inferred_mode == "pedestrian"
                    else (body.get("plate_captured_at") or body.get("captured_at") or now_iso)
                ),
                "rfid_captured_at": body.get("rfid_captured_at") or body.get("captured_at") or now_iso,
                "card_uid": str(body.get("card_uid") or "RFID-SAMPLE-0001"),
            }
            parsed_meta = c.CaptureMetadata.model_validate(normalized_body)
        else:
            parsed_meta = c.CaptureMetadata.model_validate(body)
        face_bytes = PNG_1X1_BYTES
        plate_bytes = PNG_1X1_BYTES if parsed_meta.access_mode != "pedestrian" else None

    saved = await service.ingest_capture_bundle(
        schema_version=parsed_meta.schema_version,
        encounter_id=parsed_meta.encounter_id,
        access_point_id=parsed_meta.access_point_id,
        lane_id=parsed_meta.lane_id,
        access_mode=parsed_meta.access_mode,
        calibration_version=parsed_meta.calibration_version,
        face_captured_at=parsed_meta.face_captured_at,
        plate_captured_at=parsed_meta.plate_captured_at,
        rfid_captured_at=parsed_meta.rfid_captured_at,
        card_uid=parsed_meta.card_uid.get_secret_value(),
        face_bytes=face_bytes,
        plate_bytes=plate_bytes,
    )
    return _capture_view(saved)


@core_access_router.get(
    "/api/v2/access-events/{event_id}",
    response_model=c.VerificationView,
    operation_id="reconcileAccessEvent",
)
async def reconcile_access_event(
    event_id: str,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.VerificationView:
    _require_any(
        principal,
        "gate-logs:read",
        "person-access-logs:read",
        "gates:verify-entry",
        "gates:verify-exit",
    )
    record = await service.reconcile_access_event(event_id)
    return _verification_view(record)


@core_access_router.post(
    "/api/v2/gates/entry/verifications",
    response_model=c.VerificationView,
    operation_id="verifyVehicleEntry",
)
async def verify_vehicle_entry(
    payload: c.VerificationRequest,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.VerificationView:
    _require_any(principal, "gates:verify-entry")
    record = await service.verify_vehicle_gate(
        direction="ENTRY",
        event_id=payload.event_id,
        gate_id=payload.gate_id,
        capture_bundle_id=payload.capture_bundle_id,
    )
    return _verification_view(record)


@core_access_router.post(
    "/api/v2/gates/exit/verifications",
    response_model=c.VerificationView,
    operation_id="verifyVehicleExit",
)
async def verify_vehicle_exit(
    payload: c.VerificationRequest,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.VerificationView:
    _require_any(principal, "gates:verify-exit")
    record = await service.verify_vehicle_gate(
        direction="EXIT",
        event_id=payload.event_id,
        gate_id=payload.gate_id,
        capture_bundle_id=payload.capture_bundle_id,
    )
    return _verification_view(record)


@core_access_router.post(
    "/api/v1/pedestrian-gates/entry/verifications",
    response_model=c.VerificationView,
    operation_id="verifyPedestrianEntry",
)
async def verify_pedestrian_entry(
    payload: c.VerificationRequest,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.VerificationView:
    _require_any(principal, "access:verify-pedestrian-entry", "gates:verify-entry")
    record = await service.verify_pedestrian_gate(
        direction="ENTRY",
        event_id=payload.event_id,
        gate_id=payload.gate_id,
        capture_bundle_id=payload.capture_bundle_id,
    )
    return _verification_view(record)


@core_access_router.post(
    "/api/v1/pedestrian-gates/exit/verifications",
    response_model=c.VerificationView,
    operation_id="verifyPedestrianExit",
)
async def verify_pedestrian_exit(
    payload: c.VerificationRequest,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: CoreAccessService = Depends(get_core_access),
) -> c.VerificationView:
    _require_any(principal, "access:verify-pedestrian-exit", "gates:verify-exit")
    record = await service.verify_pedestrian_gate(
        direction="EXIT",
        event_id=payload.event_id,
        gate_id=payload.gate_id,
        capture_bundle_id=payload.capture_bundle_id,
    )
    return _verification_view(record)


# ============================================================================
# M4 — Operational Analytics Dashboard
# ============================================================================


@analytics_router.get(
    "/api/v1/analytics/dashboard",
    response_model=c.DashboardView,
    operation_id="readDashboard",
)
async def read_dashboard(
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: datetime | None = None,
    timezone: Literal["Asia/Bangkok", "Asia/Ho_Chi_Minh", "UTC"] = "Asia/Bangkok",
    granularity: Literal["hour", "day"] = Query(default="day"),
    access_point_id: Annotated[str | None, Query(max_length=128)] = None,
    access_mode: c.AccessMode | None = None,
    direction: c.Direction | None = None,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: AnalyticsService = Depends(get_analytics),
) -> c.DashboardView:
    _require_any(principal, "dashboard:read", "gate-logs:read")
    _ = granularity
    now = datetime.now(UTC)
    effective_to = to or now
    effective_from = from_ or (effective_to - timedelta(hours=24))
    normalized_tz: Literal["Asia/Bangkok", "UTC"] = (
        "Asia/Bangkok" if timezone == "Asia/Ho_Chi_Minh" else timezone
    )
    payload = await service.read_dashboard(
        principal,
        from_=effective_from,
        to=effective_to,
        timezone=normalized_tz,
        access_point_id=access_point_id,
        access_mode=access_mode,
        direction=direction,
    )
    return c.DashboardView.model_validate(payload)


@analytics_router.get(
    "/api/v1/analytics/metric-definitions",
    response_model=c.CursorPage[c.MetricDefinition],
    operation_id="listMetricDefinitions",
)
async def list_metric_definitions(
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: AnalyticsService = Depends(get_analytics),
) -> c.CursorPage[c.MetricDefinition]:
    _require_any(principal, "dashboard:read", "gate-logs:read")
    items, next_cursor, has_more, total = await service.list_metric_definitions(
        cursor=cursor, limit=limit
    )
    return c.CursorPage[c.MetricDefinition](
        items=[c.MetricDefinition.model_validate(item) for item in items],
        next_cursor=next_cursor,
        has_more=has_more,
        coverage="complete",
        total=total,
    )


@analytics_router.get(
    "/api/v1/analytics/overview",
    response_model=c.DashboardView,
    operation_id="readAnalyticsOverview",
)
async def read_analytics_overview(
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: datetime | None = None,
    timezone: Literal["Asia/Bangkok", "Asia/Ho_Chi_Minh", "UTC"] = "Asia/Bangkok",
    access_point_id: Annotated[str | None, Query(max_length=128)] = None,
    access_mode: c.AccessMode | None = None,
    direction: c.Direction | None = None,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: AnalyticsService = Depends(get_analytics),
) -> c.DashboardView:
    _require_any(principal, "dashboard:read", "gate-logs:read")
    now = datetime.now(UTC)
    effective_to = to or now
    effective_from = from_ or (effective_to - timedelta(hours=24))
    normalized_tz = "Asia/Bangkok" if timezone == "Asia/Ho_Chi_Minh" else timezone
    payload = await service.read_dashboard(
        principal,
        from_=effective_from,
        to=effective_to,
        timezone=normalized_tz,
        access_point_id=access_point_id,
        access_mode=access_mode,
        direction=direction,
    )
    return c.DashboardView.model_validate(payload)


@analytics_router.get(
    "/api/v1/analytics/metrics/{metric_id}/breakdown",
    response_model=dict[str, Any],
    operation_id="readMetricBreakdown",
)
async def read_metric_breakdown(
    metric_id: str,
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: datetime | None = None,
    timezone: Literal["Asia/Bangkok", "Asia/Ho_Chi_Minh", "UTC"] = "Asia/Bangkok",
    group_by: Annotated[str, Query(max_length=64)] = "decision",
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: AnalyticsService = Depends(get_analytics),
) -> dict[str, Any]:
    _require_any(principal, "dashboard:read", "gate-logs:read")
    return await service.read_metric_breakdown(
        principal,
        metric_id,
        from_=from_,
        to=to,
        timezone=timezone,
        group_by=group_by,
    )


# ============================================================================
# M5 — Self-Hosted AI Assistant & Grounded Reports
# ============================================================================


@assistant_router.post(
    "/api/v1/assistant/reports",
    response_model=c.ReportView,
    status_code=202,
    operation_id="createReport",
)
async def create_report(
    payload: c.ReportCreate,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: AssistantReportService = Depends(get_assistant),
) -> c.ReportView:
    _require_any(principal, "reports:generate", "assistant:use", "dashboard:read")
    key = (idempotency_key or f"rep-{principal.id}-{hash(payload.prompt)}").strip()
    doc = await service.create_report(
        principal,
        prompt=payload.prompt,
        period={
            "from": payload.period.from_,
            "to": payload.period.to,
            "timezone": payload.period.timezone,
        },
        filters={
            "access_point_id": payload.filters.access_point_id,
            "access_mode": payload.filters.access_mode,
            "direction": payload.filters.direction,
        },
        template=payload.template,
        idempotency_key=key,
    )
    return c.ReportView.model_validate(
        {
            k: doc[k]
            for k in (
                "report_id",
                "owner_id",
                "status",
                "created_at",
                "expires_at",
                "last_sequence",
                "result",
                "error_code",
                "artifact_available",
            )
        }
    )


@assistant_router.get(
    "/api/v1/assistant/reports",
    response_model=c.CursorPage[c.ReportView],
    operation_id="listReports",
)
async def list_reports(
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    status: Literal[
        "QUEUED",
        "RUNNING",
        "VALIDATING",
        "COMPLETED",
        "FAILED",
        "CANCEL_REQUESTED",
        "CANCELED",
    ]
    | None = None,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: AssistantReportService = Depends(get_assistant),
) -> c.CursorPage[c.ReportView]:
    _require_any(principal, "reports:read", "assistant:use", "dashboard:read")
    items, next_cursor, has_more, total = await service.list_reports(
        principal, cursor=cursor, limit=limit, status=status
    )
    views = [
        c.ReportView.model_validate(
            {
                k: doc[k]
                for k in (
                    "report_id",
                    "owner_id",
                    "status",
                    "created_at",
                    "expires_at",
                    "last_sequence",
                    "result",
                    "error_code",
                    "artifact_available",
                )
            }
        )
        for doc in items
    ]
    return c.CursorPage[c.ReportView](
        items=views,
        next_cursor=next_cursor,
        has_more=has_more,
        coverage="complete",
        total=total,
    )


@assistant_router.get(
    "/api/v1/assistant/reports/{report_id}",
    response_model=c.ReportView,
    operation_id="readReport",
)
async def read_report(
    report_id: UUID,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: AssistantReportService = Depends(get_assistant),
) -> c.ReportView:
    _require_any(principal, "reports:read", "assistant:use", "dashboard:read")
    doc = await service.read_report(principal, report_id)
    return c.ReportView.model_validate(
        {
            k: doc[k]
            for k in (
                "report_id",
                "owner_id",
                "status",
                "created_at",
                "expires_at",
                "last_sequence",
                "result",
                "error_code",
                "artifact_available",
            )
        }
    )


@assistant_router.get(
    "/api/v1/assistant/reports/{report_id}/events",
    operation_id="streamReportEvents",
)
async def stream_report_events(
    report_id: UUID,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: AssistantReportService = Depends(get_assistant),
) -> StreamingResponse:
    _require_any(principal, "reports:read", "assistant:use", "dashboard:read")
    doc = await service.read_report(principal, report_id)
    after_seq = int(last_event_id) if (last_event_id and last_event_id.isdigit()) else 0
    events = [
        evt for evt in doc.get("events", []) if int(evt.get("sequence", 0)) > after_seq
    ]

    async def _event_generator():
        for evt in events:
            validated = c.ReportEvent.model_validate(evt)
            data_json = validated.model_dump_json()
            yield f"id: {validated.sequence}\nevent: stage\ndata: {data_json}\n\n"

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )


@assistant_router.post(
    "/api/v1/assistant/reports/{report_id}/cancel",
    response_model=c.ReportView,
    status_code=202,
    operation_id="cancelReport",
)
async def cancel_report(
    report_id: UUID,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: AssistantReportService = Depends(get_assistant),
) -> c.ReportView:
    _require_any(principal, "reports:read", "assistant:use", "dashboard:read")
    doc = await service.cancel_report(principal, report_id)
    return c.ReportView.model_validate(
        {
            k: doc[k]
            for k in (
                "report_id",
                "owner_id",
                "status",
                "created_at",
                "expires_at",
                "last_sequence",
                "result",
                "error_code",
                "artifact_available",
            )
        }
    )


@assistant_router.get(
    "/api/v1/assistant/reports/{report_id}/download",
    operation_id="downloadReport",
)
async def download_report(
    report_id: UUID,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: AssistantReportService = Depends(get_assistant),
) -> Response:
    _require_any(principal, "reports:export", "reports:read", "assistant:use")
    doc = await service.read_report(principal, report_id)
    if not doc.get("artifact_available") or doc.get("result") is None:
        raise ValidationError(
            "REPORT_ARTIFACT_UNAVAILABLE",
            "Báo cáo chưa hoàn tất hoặc không có tệp kết quả để tải xuống.",
        )
    view = c.ReportView.model_validate(
        {
            k: doc[k]
            for k in (
                "report_id",
                "owner_id",
                "status",
                "created_at",
                "expires_at",
                "last_sequence",
                "result",
                "error_code",
                "artifact_available",
            )
        }
    )
    payload_bytes = view.model_dump_json(indent=2).encode("utf-8")
    return Response(
        content=payload_bytes,
        media_type="application/json",
        headers={
            "Cache-Control": "no-store, private",
            "Content-Disposition": f'attachment; filename="evsg-report-{report_id}.json"',
        },
    )


# ============================================================================
# M12 (FE-G08) — Device & Recognition Settings Admin Endpoints
# ============================================================================


class DeviceConfigCreatePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: c.Text
    access_point_ref: str | None = None
    lane_ref: str | None = None
    direction: c.Direction | None = None
    settings: dict[str, Any] = Field(default_factory=dict)
    reason: c.Reason | None = None


class DeviceConfigPatchPayload(c.VersionedReason):
    name: c.Text | None = None
    access_point_ref: str | None = None
    lane_ref: str | None = None
    direction: c.Direction | None = None
    settings: dict[str, Any] = Field(default_factory=dict)


@device_settings_router.get("/operations/{operation_id}")
async def read_device_operation(
    operation_id: UUID,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: DeviceSettingsService = Depends(get_device_settings),
) -> dict[str, Any]:
    _require_any(principal, "users:read", "audit-logs:read")
    return await service.read_operation(operation_id)


@device_settings_router.get("/audit-logs")
async def list_device_audit_logs(
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: DeviceSettingsService = Depends(get_device_settings),
) -> dict[str, Any]:
    _require_any(principal, "audit-logs:read", "users:read")
    items, next_cursor, has_more, _total = await service.list_audit_logs(
        cursor=cursor, limit=limit
    )
    return {
        "items": [c.AuditView.model_validate(item).model_dump(mode="json") for item in items],
        "next_cursor": next_cursor,
        "has_more": has_more,
        "limit": limit,
    }


@device_settings_router.get("/{group}")
async def list_device_configs(
    group: str,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: DeviceSettingsService = Depends(get_device_settings),
) -> dict[str, Any]:
    _require_any(principal, "users:read", "access-points:read")
    items, total = await service.list_configs(group)
    return {
        "items": items[:limit],
        "next_cursor": None,
        "has_more": len(items) > limit,
        "limit": limit,
        "coverage": "complete",
        "total": total,
    }


@device_settings_router.post("/{group}", status_code=201)
async def create_device_config(
    group: str,
    payload: DeviceConfigCreatePayload,
    request: Request,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: DeviceSettingsService = Depends(get_device_settings),
) -> dict[str, Any]:
    _require_any(principal, "users:manage-admin", "users:update")
    return await service.create_config(
        principal=principal,
        group=group,
        payload=payload.model_dump(),
        request_id=request.state.request_id,
    )


@device_settings_router.patch("/{group}/{config_id}")
async def update_device_config(
    group: str,
    config_id: UUID,
    payload: DeviceConfigPatchPayload,
    request: Request,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: DeviceSettingsService = Depends(get_device_settings),
) -> dict[str, Any]:
    _require_any(principal, "users:manage-admin", "users:update")
    return await service.update_config(
        principal=principal,
        group=group,
        config_id=config_id,
        expected_version=payload.expected_version,
        reason=payload.reason,
        patch=payload.model_dump(exclude_none=True),
        request_id=request.state.request_id,
    )


@device_settings_router.delete("/{group}/{config_id}", include_in_schema=False)
async def delete_device_config(
    group: str,
    config_id: UUID,
    request: Request,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: DeviceSettingsService = Depends(get_device_settings),
) -> c.Message:
    _require_any(principal, "users:manage-admin", "users:update")
    await service.delete_config(
        principal=principal,
        group=group,
        config_id=config_id,
        request_id=request.state.request_id,
    )
    return c.Message(message="Đã xóa bản ghi cấu hình thiết bị.")


@device_settings_router.post("/{group}/{config_id}/validate")
async def validate_device_config(
    group: str,
    config_id: UUID,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: DeviceSettingsService = Depends(get_device_settings),
) -> dict[str, Any]:
    _require_any(principal, "users:read", "users:update")
    return await service.validate_config(group=group, config_id=config_id)


@device_settings_router.post("/{group}/{config_id}/connectivity-test", status_code=202)
async def test_device_connectivity(
    group: str,
    config_id: UUID,
    request: Request,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: DeviceSettingsService = Depends(get_device_settings),
) -> dict[str, Any]:
    _require_any(principal, "users:manage-admin", "users:update")
    return await service.connectivity_test(
        principal=principal,
        group=group,
        config_id=config_id,
        request_id=request.state.request_id,
    )


@device_settings_router.post("/{group}/{config_id}/apply", status_code=202)
async def apply_device_config(
    group: str,
    config_id: UUID,
    payload: c.VersionedReason,
    request: Request,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: DeviceSettingsService = Depends(get_device_settings),
) -> dict[str, Any]:
    _require_any(principal, "users:manage-admin", "users:update")
    return await service.apply_config(
        principal=principal,
        group=group,
        config_id=config_id,
        expected_version=payload.expected_version,
        reason=payload.reason,
        request_id=request.state.request_id,
    )
