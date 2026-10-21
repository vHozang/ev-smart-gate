from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from starlette.requests import Request

from smart_gate.application.auth import AuthService
from smart_gate.application.dto import LoginInput
from smart_gate.config import Settings
from smart_gate.domain.entities import User
from smart_gate.domain.enums import UserRole
from smart_gate.domain.exceptions import AuthenticationError, AuthorizationError
from smart_gate.domain.operator_identity import OperatorRole
from smart_gate.domain.permission_catalog import (
    APPROVED_NEW_PERMISSIONS,
    BASELINE_ROLE_PERMISSIONS,
    system_role_id,
)
from smart_gate.infrastructure.security.crypto import SecretHasher
from smart_gate.presentation.dependencies import _authorize_operation
from tests.operator_fakes import TestPasswords
from tests.unit.test_auth import (
    DeviceRepositoryMemory,
    SessionRepositoryMemory,
    UserRepositoryMemory,
)


@pytest.fixture
def context():
    settings = Settings(
        _env_file=None, APP_ENV="test", SESSION_SECRET="synthetic-unit-session-secret-long"
    )
    users, sessions, devices = (
        UserRepositoryMemory(),
        SessionRepositoryMemory(),
        DeviceRepositoryMemory(),
    )
    service = AuthService(
        settings, users, sessions, devices, TestPasswords(), SecretHasher(settings.session_secret)
    )
    user = User(
        "operator",
        TestPasswords().hash("synthetic-password"),
        UserRole.ADMIN,
        role_id=system_role_id("ADMIN"),
        session_version=2,
    )
    users.items[user.id] = user

    class Roles:
        item = OperatorRole(
            system_role_id("ADMIN"),
            "ADMIN",
            "Admin",
            BASELINE_ROLE_PERMISSIONS["ADMIN"] | APPROVED_NEW_PERMISSIONS["ADMIN"],
            True,
        )

        async def get(self, _role_id):
            return self.item

    roles = Roles()
    service.operator_roles = roles
    return service, user, roles


@pytest.mark.asyncio
async def test_legacy_login_stamps_version_and_rejects_revoked_session(context):
    service, user, _ = context
    token = await service.login(LoginInput(username="operator", password="synthetic-password"))
    assert (await service.authenticate_session(token.session_token)).permissions
    user.session_version += 1
    with pytest.raises(AuthenticationError) as error:
        await service.authenticate_session(token.session_token)
    assert error.value.code == "SESSION_REVOKED"


@pytest.mark.asyncio
async def test_custom_role_cannot_fallback_to_old_admin_enum(context):
    service, _user, roles = context
    roles.item = OperatorRole(uuid4(), "CUSTOM", "Custom", frozenset({"gate-logs:read"}))
    with pytest.raises(AuthenticationError) as error:
        await service.login(LoginInput(username="operator", password="synthetic-password"))
    assert error.value.code == "LEGACY_ROLE_UNSUPPORTED"
    assert not service.sessions.items


@pytest.mark.asyncio
async def test_migrated_user_with_missing_policy_fails_closed(context):
    service, _, _ = context
    service.operator_roles = None
    with pytest.raises(AuthenticationError):
        await service.login(LoginInput(username="operator", password="synthetic-password"))


@pytest.mark.asyncio
async def test_cutoff_and_disabled_legacy_cannot_create_new_session(context):
    service, _, _ = context
    service.settings.auth_legacy_cutoff = datetime.now(UTC) - timedelta(seconds=1)
    with pytest.raises(AuthenticationError):
        await service.login(LoginInput(username="operator", password="synthetic-password"))
    service.settings.auth_legacy_cutoff = None
    service.settings.auth_legacy_enabled = False
    with pytest.raises(AuthenticationError):
        await service.login(LoginInput(username="operator", password="synthetic-password"))
    assert not service.sessions.items


@pytest.mark.asyncio
async def test_disabling_jwt_feature_does_not_restore_enum_rights(context):
    service, _, roles = context
    roles.item = OperatorRole(
        system_role_id("ADMIN"), "ADMIN", "Admin", frozenset({"gate-logs:read"}), True
    )
    token = await service.login(LoginInput(username="operator", password="synthetic-password"))
    actor = await service.authenticate_session(token.session_token)
    assert not service.settings.operator_auth_enabled
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/employee-cards",
            "headers": [],
            "route": SimpleNamespace(path="/api/v1/employee-cards"),
        }
    )
    with pytest.raises(AuthorizationError):
        _authorize_operation(actor, (UserRole.ADMIN,), request)
    request.scope["route"] = SimpleNamespace(path="/api/v1/gate-logs")
    _authorize_operation(actor, (UserRole.ADMIN,), request)
    actor.must_change_password = True
    with pytest.raises(AuthorizationError):
        _authorize_operation(actor, (UserRole.ADMIN,), request)


@pytest.mark.asyncio
async def test_migrated_bootstrap_does_not_recreate_renamed_admin_or_devices(context):
    service, user, _ = context
    user.username = "renamed-by-admin"
    service.allow_default_seeding = False
    await service.seed_defaults()
    assert len(service.users.items) == 1
    assert not service.devices.items
