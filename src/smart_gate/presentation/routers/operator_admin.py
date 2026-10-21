from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import AwareDatetime, Field

from smart_gate.application.operator_admin import OperatorAdminService
from smart_gate.bootstrap.container import Container
from smart_gate.domain.exceptions import InfrastructureError
from smart_gate.domain.identity_queries import AuditFilters, UserFilters
from smart_gate.domain.operator_identity import OperatorPrincipal, OperatorRole, OperatorUser
from smart_gate.presentation.contracts import migration as c
from smart_gate.presentation.dependencies import get_container
from smart_gate.presentation.routers.operator_auth import operator_principal

router = APIRouter(
    prefix="/api/v1/admin",
    tags=["Users và RBAC"],
    responses={
        code: {"model": c.ErrorEnvelope} for code in (400, 401, 403, 404, 409, 422, 429, 500, 503)
    },
)


class PageParams(c.ContractModel):
    cursor: str | None = Field(None, max_length=2048)
    limit: int = Field(50, ge=1, le=200)


class UserParams(PageParams):
    search: str | None = Field(None, min_length=1, max_length=128)
    role_id: UUID | None = None
    is_active: bool | None = None


class AuditParams(PageParams):
    from_: AwareDatetime | None = Field(None, alias="from")
    to: AwareDatetime | None = None
    actor_id: UUID | None = None
    action: str | None = Field(None, max_length=128)
    target_type: str | None = Field(None, max_length=128)
    target_id: str | None = Field(None, max_length=128)
    outcome: Literal["SUCCEEDED", "DENIED", "FAILED"] | None = None


def get_admin(container: Container = Depends(get_container)) -> OperatorAdminService:
    if container.operator_admin is None:
        raise InfrastructureError("ADMIN_NOT_READY", "Users/RBAC chưa sẵn sàng")
    return container.operator_admin


def _policy(*permissions: str) -> dict:
    return {"x-required-permissions-all": list(permissions)}


async def _users(
    admin: OperatorAdminService, records: tuple[OperatorUser, ...] | list[OperatorUser]
) -> list[c.AdminUserView]:
    codes = await admin.role_codes(tuple({user.role_id for user in records}))
    return [
        c.AdminUserView(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            role_id=user.role_id,
            role_code=codes[user.role_id],
            is_active=user.is_active,
            must_change_password=user.must_change_password,
            version=user.version,
            created_at=user.created_at,
        )
        for user in records
    ]


async def _roles(
    admin: OperatorAdminService, records: tuple[OperatorRole, ...] | list[OperatorRole]
) -> list[c.RoleView]:
    counts = await admin.role_member_counts(tuple(role.id for role in records))
    return [
        c.RoleView(
            id=role.id,
            code=role.code,
            name=role.name,
            description=role.description,
            is_system=role.is_system,
            is_active=role.is_active,
            permission_codes=sorted(role.permissions),
            assigned_user_count=counts[role.id],
            version=role.version,
        )
        for role in records
    ]


@router.get(
    "/users",
    response_model=c.CursorPage[c.AdminUserView],
    operation_id="listUsers",
    openapi_extra=_policy("users:read"),
)
async def list_users(
    params: Annotated[UserParams, Query()],
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.CursorPage[c.AdminUserView]:
    page = await admin.list_users(
        actor,
        UserFilters(params.search, params.role_id, params.is_active),
        params.cursor,
        params.limit,
    )
    return c.CursorPage[c.AdminUserView](
        items=await _users(admin, page.items),
        next_cursor=page.next_cursor,
        has_more=page.has_more,
        coverage=page.coverage,
        total=None,
    )


@router.post(
    "/users",
    response_model=c.AdminUserView,
    status_code=201,
    operation_id="createUser",
    openapi_extra=_policy("users:create", "users:assign-role"),
)
async def create_user(
    payload: c.UserCreate,
    request: Request,
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.AdminUserView:
    result = await admin.create_user(
        actor,
        payload.username,
        payload.password.get_secret_value(),
        payload.role_id,
        payload.display_name,
        request.state.request_id,
    )
    return (await _users(admin, [result]))[0]


@router.get(
    "/users/{user_id}",
    response_model=c.AdminUserView,
    operation_id="readUser",
    openapi_extra=_policy("users:read"),
)
async def read_user(
    user_id: UUID,
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.AdminUserView:
    return (await _users(admin, [await admin.read_user(actor, user_id)]))[0]


@router.patch(
    "/users/{user_id}",
    response_model=c.AdminUserView,
    operation_id="updateUserProfile",
    openapi_extra=_policy("users:update"),
)
async def update_profile(
    user_id: UUID,
    payload: c.UserProfilePatch,
    request: Request,
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.AdminUserView:
    result = await admin.update_profile(
        actor,
        user_id,
        payload.expected_version,
        payload.username,
        payload.display_name,
        "display_name" in payload.model_fields_set,
        request.state.request_id,
    )
    return (await _users(admin, [result]))[0]


@router.patch(
    "/users/{user_id}/status",
    response_model=c.AdminUserView,
    operation_id="setUserStatus",
    openapi_extra=_policy("users:set-status"),
)
async def set_status(
    user_id: UUID,
    payload: c.UserStatusChange,
    request: Request,
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.AdminUserView:
    result = await admin.set_status(
        actor,
        user_id,
        payload.is_active,
        payload.expected_version,
        payload.reason,
        request.state.request_id,
    )
    return (await _users(admin, [result]))[0]


@router.put(
    "/users/{user_id}/role",
    response_model=c.AdminUserView,
    operation_id="assignUserRole",
    openapi_extra=_policy("users:assign-role"),
)
async def assign_role(
    user_id: UUID,
    payload: c.UserRoleChange,
    request: Request,
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.AdminUserView:
    result = await admin.assign_role(
        actor,
        user_id,
        payload.role_id,
        payload.expected_version,
        payload.reason,
        request.state.request_id,
    )
    return (await _users(admin, [result]))[0]


@router.post(
    "/users/{user_id}/password-reset",
    response_model=c.AdminUserView,
    operation_id="resetUserPassword",
    openapi_extra=_policy("users:reset-password"),
)
async def reset_password(
    user_id: UUID,
    payload: c.PasswordReset,
    request: Request,
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.AdminUserView:
    result = await admin.reset_password(
        actor,
        user_id,
        payload.temporary_password.get_secret_value(),
        payload.expected_version,
        payload.reason,
        request.state.request_id,
    )
    return (await _users(admin, [result]))[0]


@router.get(
    "/users/{user_id}/sessions",
    response_model=c.CursorPage[c.SessionView],
    operation_id="listUserSessions",
    openapi_extra=_policy("users:read-sessions"),
)
async def sessions(
    user_id: UUID,
    params: Annotated[PageParams, Query()],
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.CursorPage[c.SessionView]:
    page = await admin.read_sessions(actor, user_id, params.cursor, params.limit)
    items = [
        c.SessionView(
            id=item.id,
            created_at=item.created_at,
            last_seen_at=item.last_seen_at,
            expires_at=min(item.expires_at, item.idle_expires_at),
            revoked_at=item.revoked_at,
        )
        for item in page.items
    ]
    return c.CursorPage[c.SessionView](
        items=items,
        next_cursor=page.next_cursor,
        has_more=page.has_more,
        coverage=page.coverage,
        total=None,
    )


@router.post(
    "/users/{user_id}/sessions/revoke",
    response_model=c.Message,
    operation_id="revokeUserSessions",
    openapi_extra=_policy("users:revoke-sessions"),
)
async def revoke_sessions(
    user_id: UUID,
    payload: c.VersionedReason,
    request: Request,
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.Message:
    await admin.revoke_sessions(
        actor, user_id, payload.expected_version, payload.reason, request.state.request_id
    )
    return c.Message(message="Đã thu hồi các phiên của tài khoản")


@router.get(
    "/roles",
    response_model=c.CursorPage[c.RoleView],
    operation_id="listRoles",
    openapi_extra=_policy("roles:read"),
)
async def list_roles(
    params: Annotated[PageParams, Query()],
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.CursorPage[c.RoleView]:
    page = await admin.list_roles(actor, params.cursor, params.limit)
    return c.CursorPage[c.RoleView](
        items=await _roles(admin, page.items),
        next_cursor=page.next_cursor,
        has_more=page.has_more,
        coverage=page.coverage,
        total=None,
    )


@router.post(
    "/roles",
    response_model=c.RoleView,
    status_code=201,
    operation_id="createRole",
    openapi_extra=_policy("roles:create"),
)
async def create_role(
    payload: c.RoleCreate,
    request: Request,
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.RoleView:
    role = await admin.create_role(
        actor, payload.code, payload.name, payload.description, request.state.request_id
    )
    return (await _roles(admin, [role]))[0]


@router.get(
    "/roles/{role_id}",
    response_model=c.RoleView,
    operation_id="readRole",
    openapi_extra=_policy("roles:read"),
)
async def read_role(
    role_id: UUID,
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.RoleView:
    return (await _roles(admin, [await admin.read_role(actor, role_id)]))[0]


@router.patch(
    "/roles/{role_id}",
    response_model=c.RoleView,
    operation_id="updateRole",
    openapi_extra=_policy("roles:update"),
)
async def update_role(
    role_id: UUID,
    payload: c.RolePatch,
    request: Request,
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.RoleView:
    role = await admin.update_role(
        actor,
        role_id,
        payload.expected_version,
        payload.reason,
        payload.name,
        payload.description,
        "description" in payload.model_fields_set,
        payload.is_active,
        request.state.request_id,
    )
    return (await _roles(admin, [role]))[0]


@router.delete(
    "/roles/{role_id}",
    response_model=c.Message,
    operation_id="archiveRole",
    openapi_extra=_policy("roles:delete"),
)
async def archive_role(
    role_id: UUID,
    payload: c.VersionedReason,
    request: Request,
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.Message:
    await admin.update_role(
        actor,
        role_id,
        payload.expected_version,
        payload.reason,
        None,
        None,
        False,
        None,
        request.state.request_id,
        archive=True,
    )
    return c.Message(message="Đã lưu trữ role")


@router.put(
    "/roles/{role_id}/permissions",
    response_model=c.RoleView,
    operation_id="replaceRolePermissions",
    openapi_extra=_policy("roles:assign-permissions"),
)
async def replace_permissions(
    role_id: UUID,
    payload: c.PermissionReplace,
    request: Request,
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.RoleView:
    role = await admin.replace_permissions(
        actor,
        role_id,
        frozenset(payload.permission_codes),
        payload.expected_version,
        payload.reason,
        request.state.request_id,
    )
    return (await _roles(admin, [role]))[0]


@router.get(
    "/permissions",
    response_model=c.CursorPage[c.PermissionView],
    operation_id="listPermissions",
    openapi_extra=_policy("permissions:read"),
)
async def list_permissions(
    params: Annotated[PageParams, Query()],
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.CursorPage[c.PermissionView]:
    page = await admin.list_permissions(actor, params.cursor, params.limit)
    return c.CursorPage[c.PermissionView](
        items=[c.PermissionView.model_validate(item) for item in page.items],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
        coverage=page.coverage,
        total=None,
    )


@router.get(
    "/audit-logs",
    response_model=c.CursorPage[c.AuditView],
    operation_id="listAuditLogs",
    openapi_extra=_policy("audit-logs:read"),
)
async def list_audit(
    params: Annotated[AuditParams, Query()],
    actor: OperatorPrincipal = Depends(operator_principal),
    admin: OperatorAdminService = Depends(get_admin),
) -> c.CursorPage[c.AuditView]:
    page = await admin.list_audit(
        actor,
        AuditFilters(
            params.from_,
            params.to,
            params.actor_id,
            params.action,
            params.target_type,
            params.target_id,
            params.outcome,
        ),
        params.cursor,
        params.limit,
    )
    items = [
        c.AuditView(
            id=item.id,
            actor_id=item.actor_id,
            action=item.action,
            target_type=item.target_type,
            target_id=item.target_id,
            occurred_at=item.occurred_at,
            request_id=item.request_id,
            outcome=item.outcome,
            redacted_changes=dict(item.changes),
        )
        for item in page.items
    ]
    return c.CursorPage[c.AuditView](
        items=items,
        next_cursor=page.next_cursor,
        has_more=page.has_more,
        coverage=page.coverage,
        total=None,
    )
