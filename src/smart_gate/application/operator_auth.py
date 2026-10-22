from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import timedelta
from uuid import UUID, uuid4

from smart_gate.domain.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    SmartGateError,
)
from smart_gate.domain.operator_identity import (
    AccessClaims,
    OperatorPrincipal,
    OperatorRole,
    OperatorUser,
    RefreshRecord,
    RefreshState,
    RevocationEvent,
    SecurityAudit,
    TokenFamily,
    WsTicket,
    build_principal,
)
from smart_gate.domain.operator_ports import (
    AtomicIdentityWork,
    IdentityClock,
    IdentityRateLimiter,
    IdentitySecrets,
    OperatorAudit,
    OperatorRoles,
    OperatorSessions,
    OperatorTickets,
    OperatorTokenGateway,
    OperatorUsers,
)
from smart_gate.domain.permission_catalog import WS_PERMISSIONS
from smart_gate.domain.ports import PasswordHashGateway

LEGACY_SESSION_ID = UUID("00000000-0000-0000-0000-000000000001")


@dataclass(frozen=True, slots=True)
class AuthPolicy:
    access_seconds: int = 300
    idle_seconds: int = 86400
    absolute_seconds: int = 604800
    refresh_grace_seconds: int = 5
    ticket_seconds: int = 30

    def __post_init__(self) -> None:
        if not (0 < self.access_seconds <= self.idle_seconds <= self.absolute_seconds):
            raise ValueError("Lifetime auth không hợp lệ")
        if not (0 <= self.refresh_grace_seconds <= 5 and 0 < self.ticket_seconds <= 30):
            raise ValueError("Grace/ticket vượt policy đã duyệt")


@dataclass(frozen=True, slots=True)
class IssuedIdentity:
    access_token: str = field(repr=False)
    refresh_token: str = field(repr=False)
    csrf_token: str = field(repr=False)
    expires_in: int
    family: TokenFamily
    principal: OperatorPrincipal


class OperatorAuthService:
    """Điều phối auth; chỉ trả credentials sau transaction đã commit.

    Không đăng ký runtime route trước bootstrap/readiness. Không có process-local cache
    quyền hoặc credential; mọi read/revoke đi qua ports bền vững và transaction snapshot.
    """

    def __init__(
        self,
        users: OperatorUsers,
        roles: OperatorRoles,
        sessions: OperatorSessions,
        tickets: OperatorTickets,
        audit: OperatorAudit,
        work: AtomicIdentityWork,
        passwords: PasswordHashGateway,
        secrets: IdentitySecrets,
        tokens: OperatorTokenGateway,
        clock: IdentityClock,
        limiter: IdentityRateLimiter,
        policy: AuthPolicy = AuthPolicy(),
    ) -> None:
        self.users, self.roles, self.sessions = users, roles, sessions
        self.tickets, self.audit, self.work = tickets, audit, work
        self.passwords, self.secrets, self.tokens = passwords, secrets, tokens
        self.clock, self.limiter, self.policy = clock, limiter, policy
        self._dummy_hash = passwords.hash(secrets.generate())

    async def _resolve(
        self, session_id: UUID
    ) -> tuple[OperatorPrincipal, TokenFamily, OperatorUser, OperatorRole]:
        family = await self.sessions.get_family(session_id)
        if family is None:
            raise AuthenticationError("SESSION_INVALID", "Không tìm thấy phiên hợp lệ")
        user = await self.users.get(family.user_id)
        role = await self.roles.get(user.role_id) if user else None
        if user is None or role is None:
            raise AuthenticationError("USER_INACTIVE", "Tài khoản hoặc role không còn hoạt động")
        return build_principal(user, role, family, self.clock.now()), family, user, role

    @staticmethod
    def _same_identity(current: OperatorPrincipal, expected: OperatorPrincipal) -> None:
        if (
            current.id,
            current.session_id,
            current.session_version,
            current.authz_version,
            current.role_version,
        ) != (
            expected.id,
            expected.session_id,
            expected.session_version,
            expected.authz_version,
            expected.role_version,
        ):
            raise AuthenticationError("AUTHORIZATION_CHANGED", "Phiên hoặc quyền đã thay đổi")

    async def _resolve_actor(
        self, expected: OperatorPrincipal
    ) -> tuple[OperatorPrincipal, TokenFamily, OperatorUser, OperatorRole]:
        if expected.session_id == LEGACY_SESSION_ID:
            now = self.clock.now()
            user = await self.users.get(expected.id)
            if user is None:
                role = await self.roles.get(expected.role_id)
                if role is not None and not role.is_active:
                    raise AuthenticationError(
                        "USER_INACTIVE", "Tài khoản hoặc role không còn hoạt động"
                    )
                family = TokenFamily(
                    LEGACY_SESSION_ID,
                    expected.id,
                    expected.session_version,
                    "legacy-refresh",
                    "legacy-csrf",
                    now,
                    now,
                    now + timedelta(seconds=self.policy.absolute_seconds),
                    now + timedelta(seconds=self.policy.idle_seconds),
                )
                dummy_user = OperatorUser(
                    expected.id,
                    expected.username,
                    self._dummy_hash,
                    expected.role_id,
                    True,
                    now,
                    must_change_password=expected.must_change_password,
                    version=1,
                    authz_version=expected.authz_version,
                    session_version=expected.session_version,
                )
                dummy_role = role or OperatorRole(
                    expected.role_id,
                    expected.role_code,
                    expected.role_code,
                    expected.permissions,
                    True,
                    True,
                    version=expected.role_version,
                    created_at=now,
                )
                return expected, family, dummy_user, dummy_role
            role = await self.roles.get(user.role_id)
            if role is None:
                raise AuthenticationError(
                    "USER_INACTIVE", "Tài khoản hoặc role không còn hoạt động"
                )
            family = TokenFamily(
                LEGACY_SESSION_ID,
                user.id,
                user.session_version,
                "legacy-refresh",
                "legacy-csrf",
                now,
                now,
                now + timedelta(seconds=self.policy.absolute_seconds),
                now + timedelta(seconds=self.policy.idle_seconds),
            )
            principal = build_principal(user, role, family, now)
            self._same_identity(principal, expected)
            return principal, family, user, role
        principal, family, user, role = await self._resolve(expected.session_id)
        self._same_identity(principal, expected)
        return principal, family, user, role

    async def current_in_work(self, expected: OperatorPrincipal) -> OperatorPrincipal:
        """Resolver cho application callback đang ở cùng transaction, không mở UoW lồng."""
        principal, _, _, _ = await self._resolve_actor(expected)
        return principal

    async def revalidate(self, expected: OperatorPrincipal) -> OperatorPrincipal:
        async def operation() -> OperatorPrincipal:
            principal, _, _, _ = await self._resolve_actor(expected)
            return principal

        return await self.work.run(operation)

    async def authenticate(self, token: str) -> OperatorPrincipal:
        claims = self.tokens.verify(token, self.clock.now())

        async def operation() -> OperatorPrincipal:
            principal, _, _, _ = await self._resolve(claims.session_id)
            if (
                principal.id,
                principal.session_version,
                principal.authz_version,
                principal.role_version,
            ) != (
                claims.user_id,
                claims.session_version,
                claims.authz_version,
                claims.role_version,
            ):
                raise AuthenticationError("AUTHORIZATION_CHANGED", "Phiên hoặc quyền đã thay đổi")
            return principal

        return await self.work.run(operation)

    async def _issue(self, user: OperatorUser, role: OperatorRole) -> IssuedIdentity:
        now = self.clock.now()
        refresh, csrf = self.secrets.generate(), self.secrets.generate()
        absolute = now + timedelta(seconds=self.policy.absolute_seconds)
        family = TokenFamily(
            uuid4(),
            user.id,
            user.session_version,
            self.secrets.digest(refresh),
            self.secrets.digest(csrf),
            now,
            now,
            absolute,
            min(absolute, now + timedelta(seconds=self.policy.idle_seconds)),
        )
        await self.sessions.add_family(
            family, RefreshRecord(family.current_refresh_hash, family.id, now, absolute)
        )
        principal = build_principal(user, role, family, now)
        return self._access(principal, family, refresh, csrf)

    def _access(
        self, principal: OperatorPrincipal, family: TokenFamily, refresh: str, csrf: str
    ) -> IssuedIdentity:
        now = self.clock.now()
        expiry = min(
            now + timedelta(seconds=self.policy.access_seconds),
            family.idle_expires_at,
            family.expires_at,
        )
        if int((expiry - now).total_seconds()) <= 0:
            raise AuthenticationError("SESSION_EXPIRED", "Phiên đã hết hạn")
        claims = AccessClaims(
            principal.id,
            family.id,
            uuid4(),
            now,
            now,
            expiry,
            principal.session_version,
            principal.authz_version,
            principal.role_version,
        )
        return IssuedIdentity(
            self.tokens.issue(claims),
            refresh,
            csrf,
            int((expiry - now).total_seconds()),
            family,
            principal,
        )

    async def login(self, username: str, password: str, client_key: str) -> IssuedIdentity:
        username = username.strip().lower()
        await self.limiter.consume(
            "login-client", self.secrets.digest(client_key), self.clock.now()
        )
        await self.limiter.consume("login-account", self.secrets.digest(username), self.clock.now())

        async def operation() -> IssuedIdentity:
            user = await self.users.by_username(username)
            verified = self.passwords.verify(
                user.password_hash if user else self._dummy_hash, password
            )
            if user is None or not user.is_active or not verified:
                raise AuthenticationError(
                    "INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng"
                )
            role = await self.roles.get(user.role_id)
            if role is None or not role.is_active:
                raise AuthenticationError(
                    "INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng"
                )
            return await self._issue(user, role)

        return await self.work.run(operation)

    def _csrf(self, family: TokenFamily, csrf_cookie: str | None, csrf_header: str | None) -> None:
        if not csrf_cookie or not csrf_header:
            raise AuthorizationError("CSRF_REQUIRED", "Thiếu CSRF token")
        if not (
            self.secrets.matches(csrf_cookie, family.csrf_hash)
            and self.secrets.matches(csrf_header, family.csrf_hash)
        ):
            raise AuthorizationError("CSRF_INVALID", "CSRF token không hợp lệ")

    async def refresh(
        self,
        credential: str | None,
        csrf_cookie: str | None,
        csrf_header: str | None,
        client_key: str,
    ) -> IssuedIdentity:
        if not credential:
            raise AuthenticationError("REFRESH_REQUIRED", "Cần refresh cookie")
        await self.limiter.consume(
            "refresh-client", self.secrets.digest(client_key), self.clock.now()
        )

        async def operation() -> IssuedIdentity | SmartGateError:
            record = await self.sessions.get_refresh(self.secrets.digest(credential))
            if record is None:
                raise AuthenticationError("REFRESH_INVALID", "Refresh credential không hợp lệ")
            family = await self.sessions.get_family(record.family_id)
            if family is None:
                raise AuthenticationError("REFRESH_INVALID", "Refresh credential không hợp lệ")
            self._csrf(family, csrf_cookie, csrf_header)
            family.require_active(self.clock.now())
            state = record.state(
                self.clock.now(), timedelta(seconds=self.policy.refresh_grace_seconds)
            )
            if state == RefreshState.CONCURRENT:
                return ConflictError(
                    "REFRESH_IN_PROGRESS", "Phiên đang refresh; chờ đồng bộ cookie"
                )
            if state == RefreshState.REUSED:
                await self.sessions.revoke_family(family.id, self.clock.now())
                await self.audit.publish_revoke(
                    RevocationEvent(family.user_id, self.clock.now(), family.id)
                )
                # Trả lỗi sau commit; raise trong transaction sẽ rollback chính lần revoke.
                return AuthenticationError(
                    "REFRESH_REUSE_DETECTED", "Phát hiện reuse; phiên đã bị thu hồi"
                )
            principal, family, _, _ = await self._resolve(family.id)
            if record.token_hash != family.current_refresh_hash:
                raise AuthenticationError("REFRESH_INVALID", "Refresh state không nhất quán")
            next_secret, now = self.secrets.generate(), self.clock.now()
            updated = replace(
                family,
                current_refresh_hash=self.secrets.digest(next_secret),
                last_seen_at=now,
                version=family.version + 1,
                idle_expires_at=min(
                    family.expires_at, now + timedelta(seconds=self.policy.idle_seconds)
                ),
            )
            replacement = RefreshRecord(
                updated.current_refresh_hash, family.id, now, family.expires_at
            )
            await self.sessions.rotate(
                updated, replace(record, consumed_at=now), replacement, family.version
            )
            return self._access(principal, updated, next_secret, csrf_header or "")

        result = await self.work.run(operation)
        if isinstance(result, SmartGateError):
            raise result
        return result

    async def logout(
        self,
        *,
        principal: OperatorPrincipal | None = None,
        credential: str | None = None,
        csrf_cookie: str | None = None,
        csrf_header: str | None = None,
    ) -> None:
        async def operation() -> None:
            if principal is not None:
                current, family, _, _ = await self._resolve(principal.session_id)
                self._same_identity(current, principal)
            elif credential:
                record = await self.sessions.get_refresh(self.secrets.digest(credential))
                family_or_none = (
                    await self.sessions.get_family(record.family_id) if record else None
                )
                if family_or_none is None:
                    raise AuthenticationError("REFRESH_INVALID", "Refresh credential không hợp lệ")
                family = family_or_none
                self._csrf(family, csrf_cookie, csrf_header)
            else:
                raise AuthenticationError("SESSION_REQUIRED", "Cần phiên để logout")
            await self.sessions.revoke_family(family.id, self.clock.now())
            await self.audit.publish_revoke(
                RevocationEvent(family.user_id, self.clock.now(), family.id)
            )

        await self.work.run(operation)

    async def change_password(
        self, actor: OperatorPrincipal, current_password: str, new_password: str, request_id: str
    ) -> IssuedIdentity:
        if not 12 <= len(new_password) <= 128:
            raise SmartGateError(
                "PASSWORD_POLICY", "Mật khẩu phải dài 12-128 ký tự", status_code=422
            )

        async def operation() -> IssuedIdentity:
            _, _, user, role = await self._resolve_actor(actor)
            if not self.passwords.verify(user.password_hash, current_password):
                raise AuthenticationError("INVALID_CREDENTIALS", "Mật khẩu hiện tại không đúng")
            if self.passwords.verify(user.password_hash, new_password):
                raise SmartGateError(
                    "PASSWORD_UNCHANGED", "Mật khẩu mới phải khác mật khẩu cũ", status_code=422
                )
            updated = replace(
                user,
                password_hash=self.passwords.hash(new_password),
                must_change_password=False,
                session_version=user.session_version + 1,
                authz_version=user.authz_version + 1,
                version=user.version + 1,
            )
            await self.users.save(updated, user.version)
            await self.sessions.revoke_user(user.id, self.clock.now())
            await self.audit.publish_revoke(RevocationEvent(user.id, self.clock.now()))
            await self.audit.append(
                SecurityAudit(
                    user.id,
                    "auth.change-password",
                    "user",
                    str(user.id),
                    self.clock.now(),
                    request_id,
                    "SUCCEEDED",
                    {"must_change_password": False, "version": updated.version},
                )
            )
            return await self._issue(updated, role)

        return await self.work.run(operation)

    async def issue_ticket(self, actor: OperatorPrincipal, channel: str) -> tuple[str, WsTicket]:
        if channel not in WS_PERMISSIONS:
            raise AuthorizationError("WS_CHANNEL_DENIED", "Kênh realtime không được hỗ trợ")
        await self.limiter.consume(
            "ws-ticket", self.secrets.digest(str(actor.session_id)), self.clock.now()
        )

        async def operation() -> tuple[str, WsTicket]:
            principal, family, _, _ = await self._resolve_actor(actor)
            principal.require(WS_PERMISSIONS[channel])
            secret = self.secrets.generate()
            ticket = WsTicket(
                self.secrets.digest(secret),
                principal.id,
                family.id,
                channel,
                principal.authz_version,
                principal.session_version,
                principal.role_version,
                min(
                    self.clock.now() + timedelta(seconds=self.policy.ticket_seconds),
                    family.expires_at,
                    family.idle_expires_at,
                ),
            )
            await self.tickets.add(ticket)
            return secret, ticket

        return await self.work.run(operation)

    async def consume_ticket(self, credential: str, channel: str) -> OperatorPrincipal:
        async def operation() -> OperatorPrincipal:
            ticket = await self.tickets.get(self.secrets.digest(credential))
            if ticket is None:
                raise AuthenticationError("WS_TICKET_INVALID", "Ticket không hợp lệ")
            ticket.require_valid(channel, self.clock.now())
            if ticket.session_id == LEGACY_SESSION_ID:
                now = self.clock.now()
                user = await self.users.get(ticket.user_id)
                role = await self.roles.get(user.role_id) if user else None
                if user is None or role is None:
                    raise AuthenticationError(
                        "USER_INACTIVE", "Tài khoản hoặc role không còn hoạt động"
                    )
                family = TokenFamily(
                    LEGACY_SESSION_ID,
                    user.id,
                    user.session_version,
                    "legacy-refresh",
                    "legacy-csrf",
                    now,
                    now,
                    now + timedelta(seconds=self.policy.absolute_seconds),
                    now + timedelta(seconds=self.policy.idle_seconds),
                )
                principal = build_principal(user, role, family, now)
            else:
                principal, _, _, _ = await self._resolve(ticket.session_id)
            if (
                principal.id,
                principal.authz_version,
                principal.session_version,
                principal.role_version,
            ) != (
                ticket.user_id,
                ticket.authz_version,
                ticket.session_version,
                ticket.role_version,
            ):
                raise AuthenticationError(
                    "WS_TICKET_INVALID", "Quyền hoặc phiên của ticket đã thay đổi"
                )
            principal.require(WS_PERMISSIONS[channel])
            await self.tickets.consume(ticket.token_hash, self.clock.now())
            return principal

        return await self.work.run(operation)
