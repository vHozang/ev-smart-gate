from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from smart_gate.application.dto import AuthTokens, LoginInput, UserOutput
from smart_gate.config import Settings
from smart_gate.domain.entities import AuthSession, DeviceCredential, User
from smart_gate.domain.enums import UserRole
from smart_gate.domain.exceptions import AuthenticationError, AuthorizationError
from smart_gate.domain.operator_ports import OperatorRoles
from smart_gate.domain.ports import (
    AuthSessionRepository,
    DeviceCredentialRepository,
    PasswordHashGateway,
    SecretHashGateway,
    UserRepository,
)


class AuthService:
    """Xác thực operator bằng session và edge device bằng API key đã băm."""

    def __init__(
        self,
        settings: Settings,
        users: UserRepository,
        sessions: AuthSessionRepository,
        devices: DeviceCredentialRepository,
        password_hasher: PasswordHashGateway,
        secret_hasher: SecretHashGateway,
    ) -> None:
        self.settings = settings
        self.operator_roles: OperatorRoles | None = None
        self.allow_default_seeding = True
        self.users = users
        self.sessions = sessions
        self.devices = devices
        self.password_hasher = password_hasher
        self.secret_hasher = secret_hasher

    async def seed_defaults(self) -> None:
        if not self.allow_default_seeding:
            return
        username = self.settings.admin_username.strip().lower()
        if await self.users.get_by_username(username) is None:
            await self.users.add(
                User(
                    username=username,
                    password_hash=self.password_hasher.hash(self.settings.admin_password),
                    role=UserRole.ADMIN,
                    created_at=datetime.now(UTC),
                )
            )
        key_hash = self.secret_hasher.hash(self.settings.device_api_key)
        await self.devices.upsert(
            DeviceCredential(
                name="default-edge-agent",
                key_hash=key_hash,
                scopes=["gate:entry", "gate:exit", "dock:capture"],
                created_at=datetime.now(UTC),
            )
        )

    async def login(self, payload: LoginInput) -> AuthTokens:
        self._legacy_available()
        user = await self.users.get_by_username(payload.username.strip().lower())
        if (
            user is None
            or not user.is_active
            or not self.password_hasher.verify(user.password_hash, payload.password)
        ):
            raise AuthenticationError(
                "INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng"
            )
        user = await self._operator_policy(user)
        session_token = secrets.token_urlsafe(32)
        csrf_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(seconds=self.settings.session_ttl_seconds)
        await self.sessions.add(
            AuthSession(
                user_id=user.id,
                token_hash=self.secret_hasher.hash(session_token),
                csrf_hash=self.secret_hasher.hash(csrf_token),
                expires_at=expires_at,
                created_at=datetime.now(UTC),
                session_version=user.session_version,
            )
        )
        return AuthTokens(
            session_token=session_token,
            csrf_token=csrf_token,
            expires_at=expires_at,
        )

    async def authenticate_session(self, session_token: str | None) -> User:
        self._legacy_available()
        if not session_token:
            raise AuthenticationError("SESSION_REQUIRED", "Phiên đăng nhập là bắt buộc")
        session = await self.sessions.get_by_token_hash(
            self.secret_hasher.hash(session_token), datetime.now(UTC)
        )
        if session is None:
            raise AuthenticationError(
                "SESSION_INVALID", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn"
            )
        user = await self.users.get(session.user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("USER_INACTIVE", "Tài khoản không còn hoạt động")
        if session.session_version != user.session_version:
            raise AuthenticationError("SESSION_REVOKED", "Phiên đã bị thu hồi")
        return await self._operator_policy(user)

    def _legacy_available(self) -> None:
        if not self.settings.auth_legacy_enabled or (
            self.settings.auth_legacy_cutoff is not None
            and datetime.now(UTC) >= self.settings.auth_legacy_cutoff
        ):
            raise AuthenticationError(
                "LEGACY_AUTH_DISABLED", "Auth session cũ đã hết thời gian tương thích"
            )

    async def _operator_policy(self, user: User) -> User:
        if user.role_id is None:
            return user
        if self.operator_roles is None:
            raise AuthenticationError(
                "ROLE_POLICY_UNAVAILABLE", "Không xác minh được quyền hiện hành"
            )
        role = await self.operator_roles.get(user.role_id)
        if role is None or not role.is_active:
            raise AuthenticationError("ROLE_INACTIVE", "Role không còn hoạt động")
        if not role.is_system or role.code not in {"ADMIN", "WAREHOUSE", "SECURITY"}:
            raise AuthenticationError("LEGACY_ROLE_UNSUPPORTED", "Custom role cần client JWT v2")
        user.role = UserRole(role.code)
        user.permissions = frozenset() if user.must_change_password else role.permissions
        return user

    async def validate_csrf(self, session_token: str | None, csrf_token: str | None) -> None:
        if not session_token or not csrf_token:
            raise AuthorizationError("CSRF_REQUIRED", "Thiếu CSRF token")
        session = await self.sessions.get_by_token_hash(
            self.secret_hasher.hash(session_token), datetime.now(UTC)
        )
        if session is None or not self.secret_hasher.verify(csrf_token, session.csrf_hash):
            raise AuthorizationError("CSRF_INVALID", "CSRF token không hợp lệ")

    async def logout(self, session_token: str | None) -> None:
        if session_token:
            await self.sessions.delete_by_token_hash(self.secret_hasher.hash(session_token))

    async def authorize_device(self, api_key: str | None, required_scope: str) -> DeviceCredential:
        if not api_key:
            raise AuthenticationError("DEVICE_KEY_REQUIRED", "X-Device-Key là bắt buộc")
        credential = await self.devices.get_by_key_hash(self.secret_hasher.hash(api_key))
        if credential is None or not credential.is_active:
            raise AuthenticationError("DEVICE_KEY_INVALID", "Khóa thiết bị không hợp lệ")
        if required_scope not in credential.scopes:
            raise AuthorizationError(
                "DEVICE_SCOPE_DENIED", "Thiết bị không có scope cho workflow này"
            )
        return credential

    @staticmethod
    def user_output(user: User) -> UserOutput:
        return UserOutput(id=user.id, username=user.username, role=user.role)
