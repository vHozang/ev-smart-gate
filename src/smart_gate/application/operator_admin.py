from __future__ import annotations

import json
import re
from collections.abc import Awaitable, Callable
from dataclasses import asdict, replace
from datetime import UTC, datetime
from typing import Literal, TypeVar
from uuid import UUID, uuid4

from smart_gate.application.operator_auth import OperatorAuthService
from smart_gate.domain.exceptions import (
    AuthorizationError,
    ConflictError,
    InfrastructureError,
    NotFoundError,
    SmartGateError,
)
from smart_gate.domain.identity_queries import AuditFilters, IdentityPage, PageBoundary, UserFilters
from smart_gate.domain.operator_identity import (
    OperatorPrincipal,
    OperatorRole,
    OperatorUser,
    RevocationEvent,
    SecurityAudit,
    TokenFamily,
    require_admin_survives,
    require_grantable,
    require_manage_target,
)
from smart_gate.domain.operator_ports import (
    AtomicIdentityWork,
    IdentityClock,
    IdentityCursorGateway,
    OperatorAudit,
    OperatorRoles,
    OperatorSessions,
    OperatorUsers,
)
from smart_gate.domain.permission_catalog import (
    BASELINE_ROLE_PERMISSIONS,
    CATALOG_VERSION,
    PERMISSION_DEPENDENCIES,
    PROTECTED_PERMISSIONS,
    system_role_id,
)
from smart_gate.domain.ports import PasswordHashGateway

T = TypeVar("T")


class OperatorAdminService:
    """Use cases quản trị; permissions/target/version/audit nằm trong cùng transaction."""

    def __init__(
        self,
        users: OperatorUsers,
        roles: OperatorRoles,
        sessions: OperatorSessions,
        audit: OperatorAudit,
        work: AtomicIdentityWork,
        auth: OperatorAuthService,
        passwords: PasswordHashGateway,
        clock: IdentityClock,
        cursors: IdentityCursorGateway,
    ) -> None:
        self.users, self.roles, self.sessions, self.audit, self.work = (
            users,
            roles,
            sessions,
            audit,
            work,
        )
        self.auth, self.passwords, self.clock, self.cursors = auth, passwords, clock, cursors

    async def _user(self, user_id: UUID) -> OperatorUser:
        user = await self.users.get(user_id)
        if user is None:
            raise NotFoundError("USER_NOT_FOUND", "Không tìm thấy tài khoản")
        return user

    async def _role(self, role_id: UUID) -> OperatorRole:
        role = await self.roles.get(role_id)
        if role is None:
            raise NotFoundError("ROLE_NOT_FOUND", "Không tìm thấy role")
        return role

    @staticmethod
    def _expected(version: int, expected: int, kind: str) -> None:
        if version != expected:
            raise ConflictError(f"{kind}_VERSION_CONFLICT", "Dữ liệu đã đổi; tải lại trước khi lưu")

    @staticmethod
    def _reason(reason: str) -> None:
        if not 3 <= len(reason.strip()) <= 500:
            raise SmartGateError("REASON_REQUIRED", "Cần lý do dài 3-500 ký tự", status_code=422)

    @staticmethod
    def _username(username: str) -> str:
        username = username.strip().lower()
        if not re.fullmatch(r"[a-z0-9._-]{3,64}", username):
            raise SmartGateError(
                "USERNAME_INVALID", "Tên đăng nhập không đúng định dạng", status_code=422
            )
        return username

    @staticmethod
    def _password(password: str) -> None:
        if not 12 <= len(password) <= 128:
            raise SmartGateError(
                "PASSWORD_POLICY", "Mật khẩu phải dài 12-128 ký tự", status_code=422
            )

    async def _mutate(
        self,
        actor: OperatorPrincipal,
        action: str,
        target_type: str,
        target_id: UUID,
        request_id: str,
        operation: Callable[[OperatorPrincipal], Awaitable[tuple[T, dict]]],
    ) -> T:
        async def transaction() -> T:
            current = await self.auth.current_in_work(actor)
            await self.users.lock_admin_invariant()
            result, changes = await operation(current)
            await self.audit.append(
                SecurityAudit(
                    current.id,
                    action,
                    target_type,
                    str(target_id),
                    self.clock.now(),
                    request_id,
                    "SUCCEEDED",
                    changes,
                )
            )
            return result

        try:
            return await self.work.run(transaction)
        except (AuthorizationError, ConflictError, NotFoundError):

            async def denied() -> None:
                await self.audit.append(
                    SecurityAudit(
                        actor.id,
                        action,
                        target_type,
                        str(target_id),
                        self.clock.now(),
                        request_id,
                        "DENIED",
                        {},
                    )
                )

            await self.work.run(denied)
            raise

    async def _invalidate(self, user: OperatorUser) -> None:
        await self.sessions.revoke_user(user.id, self.clock.now())
        await self.audit.publish_revoke(RevocationEvent(user.id, self.clock.now()))

    async def read_user(self, actor: OperatorPrincipal, user_id: UUID) -> OperatorUser:
        async def operation():
            (await self.auth.current_in_work(actor)).require("users:read")
            return await self._user(user_id)

        return await self.work.run(operation)

    async def create_user(
        self,
        actor: OperatorPrincipal,
        username: str,
        password: str,
        role_id: UUID,
        display_name: str | None,
        request_id: str,
    ) -> OperatorUser:
        username = self._username(username)
        self._password(password)
        target_id = uuid4()

        async def operation(current):
            current.require("users:create")
            role = await self._role(role_id)
            require_grantable(current, role)
            if await self.users.by_username(username):
                raise ConflictError("USERNAME_EXISTS", "Tên đăng nhập đã tồn tại")
            user = OperatorUser(
                target_id,
                username,
                self.passwords.hash(password),
                role.id,
                True,
                self.clock.now(),
                display_name=display_name,
                must_change_password=True,
            )
            await self.users.add(user)
            return user, {"role_id": str(role.id), "must_change_password": True}

        return await self._mutate(actor, "users.create", "user", target_id, request_id, operation)

    async def update_profile(
        self,
        actor: OperatorPrincipal,
        user_id: UUID,
        expected_version: int,
        username: str | None,
        display_name: str | None,
        display_name_provided: bool,
        request_id: str,
    ) -> OperatorUser:
        async def operation(current):
            user = await self._user(user_id)
            require_manage_target(current, "users:update", await self._role(user.role_id))
            self._expected(user.version, expected_version, "USER")
            next_username = self._username(username) if username is not None else user.username
            other = await self.users.by_username(next_username)
            if other is not None and other.id != user.id:
                raise ConflictError("USERNAME_EXISTS", "Tên đăng nhập đã tồn tại")
            updated = replace(
                user,
                username=next_username,
                display_name=display_name if display_name_provided else user.display_name,
                version=user.version + 1,
            )
            await self.users.save(updated, user.version)
            return updated, {"fields": "username,display_name", "version": updated.version}

        return await self._mutate(actor, "users.update", "user", user_id, request_id, operation)

    async def set_status(
        self,
        actor: OperatorPrincipal,
        user_id: UUID,
        is_active: bool,
        expected_version: int,
        reason: str,
        request_id: str,
    ) -> OperatorUser:
        self._reason(reason)

        async def operation(current):
            user = await self._user(user_id)
            role = await self._role(user.role_id)
            require_manage_target(current, "users:set-status", role)
            self._expected(user.version, expected_version, "USER")
            count = await self.users.count_role(system_role_id("ADMIN"), active_only=True)
            require_admin_survives(role, user.is_active, role, is_active, count)
            updated = replace(
                user,
                is_active=is_active,
                version=user.version + 1,
                session_version=user.session_version + 1,
                authz_version=user.authz_version + 1,
            )
            await self.users.save(updated, user.version)
            await self._invalidate(updated)
            return updated, {"is_active": is_active, "version": updated.version}

        return await self._mutate(actor, "users.set-status", "user", user_id, request_id, operation)

    async def assign_role(
        self,
        actor: OperatorPrincipal,
        user_id: UUID,
        role_id: UUID,
        expected_version: int,
        reason: str,
        request_id: str,
    ) -> OperatorUser:
        self._reason(reason)

        async def operation(current):
            user = await self._user(user_id)
            previous, role = await self._role(user.role_id), await self._role(role_id)
            require_manage_target(current, "users:assign-role", previous)
            require_grantable(current, role)
            self._expected(user.version, expected_version, "USER")
            count = await self.users.count_role(system_role_id("ADMIN"), active_only=True)
            require_admin_survives(previous, user.is_active, role, user.is_active, count)
            updated = replace(
                user,
                role_id=role.id,
                version=user.version + 1,
                authz_version=user.authz_version + 1,
                session_version=user.session_version + 1,
            )
            await self.users.save(updated, user.version)
            await self._invalidate(updated)
            return updated, {
                "role_id": str(role.id),
                "previous_role_id": str(previous.id),
                "version": updated.version,
            }

        return await self._mutate(
            actor, "users.assign-role", "user", user_id, request_id, operation
        )

    async def reset_password(
        self,
        actor: OperatorPrincipal,
        user_id: UUID,
        password: str,
        expected_version: int,
        reason: str,
        request_id: str,
    ) -> OperatorUser:
        self._reason(reason)
        self._password(password)

        async def operation(current):
            user = await self._user(user_id)
            require_manage_target(current, "users:reset-password", await self._role(user.role_id))
            self._expected(user.version, expected_version, "USER")
            updated = replace(
                user,
                password_hash=self.passwords.hash(password),
                must_change_password=True,
                version=user.version + 1,
                authz_version=user.authz_version + 1,
                session_version=user.session_version + 1,
            )
            await self.users.save(updated, user.version)
            await self._invalidate(updated)
            return updated, {"must_change_password": True, "version": updated.version}

        return await self._mutate(
            actor, "users.reset-password", "user", user_id, request_id, operation
        )

    async def read_sessions(
        self, actor: OperatorPrincipal, user_id: UUID, cursor: str | None = None, limit: int = 50
    ) -> IdentityPage[TokenFamily]:
        async def operation():
            current = await self.auth.current_in_work(actor)
            user = await self._user(user_id)
            require_manage_target(current, "users:read-sessions", await self._role(user.role_id))
            scope, before = self._page_start(
                current, "user.sessions", {"user_id": str(user_id)}, cursor, limit
            )
            rows = await self.sessions.list_user(user.id, before, limit + 1)
            return self._page(
                rows,
                scope,
                limit,
                lambda family: PageBoundary(family.created_at, family.id),
                "partial",
            )

        return await self.work.run(operation)

    async def role_member_counts(self, role_ids: tuple[UUID, ...]) -> dict[UUID, int]:
        """Metadata cho các role đã được use case cho phép đọc, không phải endpoint độc lập."""
        return await self.work.run(lambda: self.users.count_role_members(role_ids))

    async def revoke_sessions(
        self,
        actor: OperatorPrincipal,
        user_id: UUID,
        expected_version: int,
        reason: str,
        request_id: str,
    ) -> None:
        self._reason(reason)

        async def operation(current):
            user = await self._user(user_id)
            require_manage_target(current, "users:revoke-sessions", await self._role(user.role_id))
            self._expected(user.version, expected_version, "USER")
            updated = replace(
                user,
                version=user.version + 1,
                authz_version=user.authz_version + 1,
                session_version=user.session_version + 1,
            )
            await self.users.save(updated, user.version)
            await self._invalidate(updated)
            return None, {"version": updated.version}

        await self._mutate(actor, "users.revoke-sessions", "user", user_id, request_id, operation)

    async def role_codes(self, role_ids: tuple[UUID, ...]) -> dict[UUID, str]:
        """Ánh xạ cho DTO của users đã được use case cho phép đọc; code role bất biến."""

        async def operation():
            roles = await self.roles.get_many(role_ids)
            if set(roles) != set(role_ids):
                raise InfrastructureError(
                    "ROLE_POLICY_UNAVAILABLE", "Không xác minh được role của user"
                )
            return {key: role.code for key, role in roles.items()}

        return await self.work.run(operation)

    async def create_role(
        self,
        actor: OperatorPrincipal,
        code: str,
        name: str,
        description: str | None,
        request_id: str,
    ) -> OperatorRole:
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,63}", code) or code in BASELINE_ROLE_PERMISSIONS:
            raise SmartGateError(
                "ROLE_CODE_INVALID",
                "Code role không hợp lệ hoặc đã dành cho hệ thống",
                status_code=422,
            )
        role_id = uuid4()

        async def operation(current):
            current.require("roles:create")
            if await self.roles.by_code(code):
                raise ConflictError("ROLE_EXISTS", "Code role đã tồn tại")
            role = OperatorRole(
                role_id,
                code,
                name,
                frozenset(),
                description=description,
                created_at=self.clock.now(),
            )
            await self.roles.add(role)
            return role, {"fields": "code,name,description", "version": role.version}

        return await self._mutate(actor, "roles.create", "role", role_id, request_id, operation)

    async def read_role(self, actor: OperatorPrincipal, role_id: UUID) -> OperatorRole:
        async def operation():
            (await self.auth.current_in_work(actor)).require("roles:read")
            return await self._role(role_id)

        return await self.work.run(operation)

    async def update_role(
        self,
        actor: OperatorPrincipal,
        role_id: UUID,
        expected_version: int,
        reason: str,
        name: str | None,
        description: str | None,
        description_provided: bool,
        is_active: bool | None,
        request_id: str,
        *,
        archive: bool = False,
    ) -> OperatorRole:
        self._reason(reason)

        async def operation(current):
            current.require("roles:delete" if archive else "roles:update")
            role = await self._role(role_id)
            if role.is_system and role.code == "ADMIN":
                current.require("users:manage-admin")
            self._expected(role.version, expected_version, "ROLE")
            if archive or is_active is False:
                if role.is_system:
                    raise ConflictError(
                        "SYSTEM_ROLE_PROTECTED", "Không archive hoặc deactivate system role"
                    )
                if await self.users.count_role(role.id):
                    raise ConflictError("ROLE_IN_USE", "Role vẫn còn được gán cho user")
            updated = replace(
                role,
                name=name if name is not None else role.name,
                description=description if description_provided else role.description,
                is_active=False if archive else role.is_active if is_active is None else is_active,
                version=role.version + 1,
            )
            await self.roles.save(updated, role.version)
            return updated, {
                "fields": "name,description,is_active",
                "is_active": updated.is_active,
                "version": updated.version,
            }

        return await self._mutate(
            actor,
            "roles.archive" if archive else "roles.update",
            "role",
            role_id,
            request_id,
            operation,
        )

    async def replace_permissions(
        self,
        actor: OperatorPrincipal,
        role_id: UUID,
        permissions: frozenset[str],
        expected_version: int,
        reason: str,
        request_id: str,
    ) -> OperatorRole:
        self._reason(reason)

        async def operation(current):
            current.require("roles:assign-permissions", "permissions:read")
            role = await self._role(role_id)
            if role.is_system and role.code == "ADMIN":
                current.require("users:manage-admin")
            self._expected(role.version, expected_version, "ROLE")
            role.validate_permissions(permissions)
            if not permissions <= current.permissions:
                raise AuthorizationError(
                    "PERMISSION_NOT_GRANTABLE", "Không cấp quyền vượt tập grantable của actor"
                )
            updated = replace(role, permissions=permissions, version=role.version + 1)
            await self.roles.save(updated, role.version)
            for user_id in await self.users.bump_role_members(role.id):
                await self.sessions.revoke_user(user_id, self.clock.now())
                await self.audit.publish_revoke(RevocationEvent(user_id, self.clock.now()))
            return updated, {
                "permission_codes": ",".join(sorted(permissions)),
                "previous_permission_codes": ",".join(sorted(role.permissions)),
                "version": updated.version,
            }

        return await self._mutate(
            actor, "roles.replace-permissions", "role", role_id, request_id, operation
        )

    def _page_start(
        self, actor: OperatorPrincipal, module: str, filters: dict, cursor: str | None, limit: int
    ):
        if not 1 <= limit <= 200:
            raise SmartGateError("LIMIT_INVALID", "Limit phải từ 1 đến 200", status_code=422)
        scope = json.dumps(
            {
                "user": str(actor.id),
                "role": str(actor.role_id),
                "av": actor.authz_version,
                "rv": actor.role_version,
                "module": module,
                "filters": filters,
                "limit": limit,
            },
            sort_keys=True,
            default=str,
        )
        return scope, self.cursors.decode(cursor, scope, self.clock.now()) if cursor else None

    def _page(
        self,
        items: list[T],
        scope: str,
        limit: int,
        boundary: Callable[[T], PageBoundary],
        coverage: Literal["complete", "partial"] = "complete",
    ) -> IdentityPage[T]:
        has_more = len(items) > limit
        selected = items[:limit]
        cursor = (
            self.cursors.encode(boundary(selected[-1]), scope, self.clock.now())
            if has_more
            else None
        )
        return IdentityPage(tuple(selected), cursor, has_more, coverage)

    async def list_users(
        self, actor: OperatorPrincipal, filters: UserFilters, cursor: str | None, limit: int
    ) -> IdentityPage[OperatorUser]:
        async def operation():
            current = await self.auth.current_in_work(actor)
            current.require("users:read")
            scope, before = self._page_start(current, "users", asdict(filters), cursor, limit)
            rows = await self.users.list_users(filters, before, limit + 1)
            return self._page(
                rows, scope, limit, lambda user: PageBoundary(user.created_at, user.id)
            )

        return await self.work.run(operation)

    async def list_roles(
        self, actor: OperatorPrincipal, cursor: str | None, limit: int
    ) -> IdentityPage[OperatorRole]:
        async def operation():
            current = await self.auth.current_in_work(actor)
            current.require("roles:read")
            scope, before = self._page_start(current, "roles", {}, cursor, limit)

            def boundary(role: OperatorRole) -> PageBoundary:
                if role.created_at is None:
                    raise InfrastructureError(
                        "ROLE_MIGRATION_REQUIRED", "Role thiếu thời điểm tạo để phân trang"
                    )
                return PageBoundary(role.created_at, role.id)

            return self._page(
                await self.roles.list_roles(before, limit + 1), scope, limit, boundary
            )

        return await self.work.run(operation)

    async def list_audit(
        self, actor: OperatorPrincipal, filters: AuditFilters, cursor: str | None, limit: int
    ) -> IdentityPage[SecurityAudit]:
        async def operation():
            current = await self.auth.current_in_work(actor)
            current.require("audit-logs:read")
            if filters.from_ and filters.to and filters.from_ >= filters.to:
                raise SmartGateError("PERIOD_INVALID", "Kỳ audit không hợp lệ", status_code=422)
            scope, before = self._page_start(current, "audit", asdict(filters), cursor, limit)
            rows = await self.audit.list_events(filters, before, limit + 1)
            return self._page(
                rows, scope, limit, lambda item: PageBoundary(item.occurred_at, item.id), "partial"
            )

        return await self.work.run(operation)

    async def list_permissions(
        self, actor: OperatorPrincipal, cursor: str | None, limit: int
    ) -> IdentityPage[dict]:
        async def operation():
            current = await self.auth.current_in_work(actor)
            current.require("permissions:read")
            scope, before = self._page_start(
                current, "permissions", {"catalog": CATALOG_VERSION}, cursor, limit
            )
            codes = sorted(PERMISSION_DEPENDENCIES)
            start = before.id.int if before else 0
            if start > len(codes):
                raise SmartGateError(
                    "CURSOR_INVALID", "Cursor catalog không hợp lệ", status_code=400
                )
            rows = [
                {
                    "code": code,
                    "group": code.split(":")[0],
                    "description": f"Quyền {code}",
                    "dependencies": list(PERMISSION_DEPENDENCIES[code]),
                    "protected": code in PROTECTED_PERMISSIONS,
                }
                for code in codes[start : start + limit]
            ]
            has_more = start + len(rows) < len(codes)
            next_cursor = (
                self.cursors.encode(
                    PageBoundary(datetime(1970, 1, 1, tzinfo=UTC), UUID(int=start + len(rows))),
                    scope,
                    self.clock.now(),
                )
                if has_more
                else None
            )
            return IdentityPage(tuple(rows), next_cursor, has_more)

        return await self.work.run(operation)
