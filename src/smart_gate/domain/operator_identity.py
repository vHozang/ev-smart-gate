from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from uuid import UUID, uuid4

from smart_gate.domain.exceptions import AuthenticationError, AuthorizationError, ConflictError
from smart_gate.domain.permission_catalog import (
    ADMIN_CORE_PERMISSIONS,
    PERMISSION_DEPENDENCIES,
    PROTECTED_PERMISSIONS,
    WS_PERMISSIONS,
)


@dataclass(frozen=True, slots=True)
class OperatorRole:
    id: UUID
    code: str
    name: str
    permissions: frozenset[str]
    is_system: bool = False
    is_active: bool = True
    version: int = 1
    description: str | None = None
    created_at: datetime | None = None

    def validate_permissions(self, permissions: frozenset[str]) -> None:
        if permissions - PERMISSION_DEPENDENCIES.keys():
            raise ConflictError("PERMISSION_UNKNOWN", "Tập quyền chứa code chưa được công bố")
        if not (self.is_system and self.code == "ADMIN") and permissions & PROTECTED_PERMISSIONS:
            raise AuthorizationError(
                "PROTECTED_PERMISSION", "Không cấp quyền bảo vệ cho custom role"
            )
        for code in permissions:
            if not set(PERMISSION_DEPENDENCIES[code]) <= permissions:
                raise ConflictError("PERMISSION_DEPENDENCY", "Tập quyền thiếu dependency bắt buộc")
        if self.is_system and self.code == "ADMIN" and not permissions >= ADMIN_CORE_PERMISSIONS:
            raise ConflictError(
                "ADMIN_ROLE_PROTECTED", "Không xóa quyền quản trị cốt lõi của ADMIN"
            )


@dataclass(frozen=True, slots=True)
class OperatorUser:
    id: UUID
    username: str
    password_hash: str = field(repr=False)
    role_id: UUID
    is_active: bool
    created_at: datetime
    display_name: str | None = None
    must_change_password: bool = False
    version: int = 1
    authz_version: int = 1
    session_version: int = 1


@dataclass(frozen=True, slots=True)
class OperatorPrincipal:
    id: UUID
    username: str
    role_id: UUID
    role_code: str
    permissions: frozenset[str]
    authz_version: int
    must_change_password: bool
    session_id: UUID
    session_version: int
    role_version: int

    def require(self, *permissions: str, restricted_allowed: bool = False) -> None:
        if self.must_change_password and not restricted_allowed:
            raise AuthorizationError(
                "PASSWORD_CHANGE_REQUIRED", "Cần đổi mật khẩu trước khi tiếp tục"
            )
        if not set(permissions) <= self.permissions:
            raise AuthorizationError("PERMISSION_DENIED", "Không có quyền thực hiện thao tác")


@dataclass(frozen=True, slots=True)
class TokenFamily:
    id: UUID
    user_id: UUID
    session_version: int
    current_refresh_hash: str = field(repr=False)
    csrf_hash: str = field(repr=False)
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    idle_expires_at: datetime
    revoked_at: datetime | None = None
    version: int = 1

    def require_active(self, now: datetime) -> None:
        if self.revoked_at is not None:
            raise AuthenticationError("SESSION_REVOKED", "Phiên đã bị thu hồi")
        if now >= self.expires_at or now >= self.idle_expires_at:
            raise AuthenticationError("SESSION_EXPIRED", "Phiên đã hết hạn")


class RefreshState(StrEnum):
    CURRENT = "CURRENT"
    CONCURRENT = "CONCURRENT"
    REUSED = "REUSED"


@dataclass(frozen=True, slots=True)
class RefreshRecord:
    token_hash: str = field(repr=False)
    family_id: UUID
    issued_at: datetime
    expires_at: datetime
    consumed_at: datetime | None = None

    def state(self, now: datetime, grace: timedelta) -> RefreshState:
        if now >= self.expires_at:
            raise AuthenticationError("REFRESH_EXPIRED", "Refresh credential đã hết hạn")
        if self.consumed_at is None:
            return RefreshState.CURRENT
        # Clock đi lùi không mở rộng grace; clock policy phải được adapter bảo đảm.
        if timedelta(0) <= now - self.consumed_at <= grace:
            return RefreshState.CONCURRENT
        return RefreshState.REUSED


@dataclass(frozen=True, slots=True)
class AccessClaims:
    user_id: UUID
    session_id: UUID
    jti: UUID
    issued_at: datetime
    not_before: datetime
    expires_at: datetime
    session_version: int
    authz_version: int
    role_version: int


@dataclass(frozen=True, slots=True)
class WsTicket:
    token_hash: str = field(repr=False)
    user_id: UUID
    session_id: UUID
    channel: str
    authz_version: int
    session_version: int
    role_version: int
    expires_at: datetime
    consumed_at: datetime | None = None

    def require_valid(self, channel: str, now: datetime) -> None:
        if self.consumed_at is not None or now >= self.expires_at or channel != self.channel:
            raise AuthenticationError("WS_TICKET_INVALID", "Ticket không hợp lệ hoặc đã sử dụng")
        if channel not in WS_PERMISSIONS:
            raise AuthorizationError("WS_CHANNEL_DENIED", "Kênh realtime không được hỗ trợ")


@dataclass(frozen=True, slots=True)
class SecurityAudit:
    actor_id: UUID | None
    action: str
    target_type: str
    target_id: str
    occurred_at: datetime
    request_id: str
    outcome: str
    changes: dict[str, str | int | bool | None]
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        allowed = {
            "fields",
            "role_id",
            "previous_role_id",
            "is_active",
            "must_change_password",
            "permission_codes",
            "previous_permission_codes",
            "version",
            "session_count",
        }
        if set(self.changes) - allowed:
            raise ValueError("Audit chỉ nhận các trường diff đã allowlist")
        if self.outcome not in {"SUCCEEDED", "DENIED", "FAILED"}:
            raise ValueError("Audit outcome không hợp lệ")


@dataclass(frozen=True, slots=True)
class RevocationEvent:
    user_id: UUID
    occurred_at: datetime
    session_id: UUID | None = None
    id: UUID = field(default_factory=uuid4)


def build_principal(
    user: OperatorUser, role: OperatorRole, family: TokenFamily, now: datetime
) -> OperatorPrincipal:
    family.require_active(now)
    if not user.is_active or not role.is_active or user.role_id != role.id:
        raise AuthenticationError("USER_INACTIVE", "Tài khoản hoặc role không còn hoạt động")
    if family.user_id != user.id or family.session_version != user.session_version:
        raise AuthenticationError("SESSION_REVOKED", "Phiên không còn hiệu lực")
    return OperatorPrincipal(
        user.id,
        user.username,
        role.id,
        role.code,
        frozenset() if user.must_change_password else role.permissions,
        user.authz_version,
        user.must_change_password,
        family.id,
        user.session_version,
        role.version,
    )


def require_manage_target(actor: OperatorPrincipal, action: str, target_role: OperatorRole) -> None:
    actor.require(action)
    if target_role.is_system and target_role.code == "ADMIN":
        actor.require("users:manage-admin")


def require_grantable(actor: OperatorPrincipal, role: OperatorRole) -> None:
    actor.require("users:assign-role")
    if not role.is_active:
        raise ConflictError("ROLE_INACTIVE", "Role không còn hoạt động")
    if role.is_system and role.code == "ADMIN":
        actor.require("users:assign-admin")
    if not role.permissions <= actor.permissions:
        raise AuthorizationError("ROLE_NOT_GRANTABLE", "Không cấp role vượt quyền của actor")


def require_admin_survives(
    target_role: OperatorRole,
    target_active: bool,
    next_role: OperatorRole,
    next_active: bool,
    active_admins: int,
) -> None:
    loses_admin = (
        target_role.is_system
        and target_role.code == "ADMIN"
        and target_active
        and not (next_role.is_system and next_role.code == "ADMIN" and next_active)
    )
    if loses_admin and active_admins <= 1:
        raise ConflictError("LAST_ADMIN_PROTECTED", "Không thể vô hiệu ADMIN cuối cùng")
