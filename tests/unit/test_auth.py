from __future__ import annotations

from datetime import datetime
from uuid import UUID

import pytest

from smart_gate.application.auth import AuthService
from smart_gate.application.dto import LoginInput
from smart_gate.config import Settings
from smart_gate.domain.entities import AuthSession, DeviceCredential, User
from smart_gate.domain.exceptions import AuthorizationError
from smart_gate.infrastructure.security.crypto import PasswordService, SecretHasher


class UserRepositoryMemory:
    def __init__(self) -> None:
        self.items: dict[UUID, User] = {}

    async def add(self, user: User) -> User:
        self.items[user.id] = user
        return user

    async def get(self, user_id: UUID) -> User | None:
        return self.items.get(user_id)

    async def get_by_username(self, username: str) -> User | None:
        return next((item for item in self.items.values() if item.username == username), None)


class SessionRepositoryMemory:
    def __init__(self) -> None:
        self.items: dict[str, AuthSession] = {}

    async def add(self, session: AuthSession) -> AuthSession:
        self.items[session.token_hash] = session
        return session

    async def get_by_token_hash(self, token_hash: str, at: datetime) -> AuthSession | None:
        session = self.items.get(token_hash)
        return session if session is not None and session.expires_at > at else None

    async def delete_by_token_hash(self, token_hash: str) -> bool:
        return self.items.pop(token_hash, None) is not None


class DeviceRepositoryMemory:
    def __init__(self) -> None:
        self.items: dict[str, DeviceCredential] = {}

    async def add(self, credential: DeviceCredential) -> DeviceCredential:
        self.items[credential.key_hash] = credential
        return credential

    async def get_by_key_hash(self, key_hash: str) -> DeviceCredential | None:
        return self.items.get(key_hash)

    async def upsert(self, credential: DeviceCredential) -> DeviceCredential:
        self.items = {
            key: value for key, value in self.items.items() if value.name != credential.name
        }
        self.items[credential.key_hash] = credential
        return credential


@pytest.mark.asyncio
async def test_session_csrf_and_device_scope() -> None:
    settings = Settings(
        _env_file=None,
        APP_ENV="test",
        ADMIN_USERNAME="admin",
        ADMIN_PASSWORD="valid-admin-password",
        SESSION_SECRET="unit-test-session-secret-that-is-long",
        DEVICE_API_KEY="unit-test-device-key",
    )
    service = AuthService(
        settings,
        UserRepositoryMemory(),
        SessionRepositoryMemory(),
        DeviceRepositoryMemory(),
        PasswordService(),
        SecretHasher(settings.session_secret),
    )
    await service.seed_defaults()

    tokens = await service.login(LoginInput(username="admin", password="valid-admin-password"))
    user = await service.authenticate_session(tokens.session_token)
    await service.validate_csrf(tokens.session_token, tokens.csrf_token)
    credential = await service.authorize_device(settings.device_api_key, "gate:entry")

    assert user.username == "admin"
    assert "gate:entry" in credential.scopes
    with pytest.raises(AuthorizationError) as error:
        await service.authorize_device(settings.device_api_key, "admin:users")
    assert error.value.code == "DEVICE_SCOPE_DENIED"
