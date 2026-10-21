from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import timedelta
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from smart_gate.application.operator_auth import OperatorAuthService
from smart_gate.domain.exceptions import AuthenticationError, AuthorizationError, ConflictError
from smart_gate.domain.operator_identity import OperatorRole, OperatorUser
from smart_gate.domain.permission_catalog import (
    APPROVED_NEW_PERMISSIONS,
    BASELINE_ROLE_PERMISSIONS,
    system_role_id,
)
from smart_gate.infrastructure.security.operator_tokens import (
    Ed25519OperatorTokens,
    OperatorSecrets,
)
from tests.operator_fakes import (
    MemoryIdentity,
    MemoryRoles,
    MemorySessions,
    MemoryTickets,
    MemoryUsers,
    TestClock,
    TestLimiter,
    TestPasswords,
)

pytestmark = pytest.mark.asyncio
PASSWORD = "synthetic-password-in-tests"


@pytest.fixture
def world():
    db = MemoryIdentity()
    users, roles, sessions, tickets = (
        MemoryUsers(db),
        MemoryRoles(db),
        MemorySessions(db),
        MemoryTickets(db),
    )
    clock, passwords = TestClock(), TestPasswords()
    key = Ed25519PrivateKey.generate()
    tokens = Ed25519OperatorTokens(
        key, {"operator-test": key.public_key()}, issuer="test-operator", kid="operator-test"
    )
    secrets = OperatorSecrets(b"isolated-test-auth-pepper-32bytes-only")
    for code in BASELINE_ROLE_PERMISSIONS:
        db.state.roles[system_role_id(code)] = OperatorRole(
            system_role_id(code),
            code,
            code,
            BASELINE_ROLE_PERMISSIONS[code] | APPROVED_NEW_PERMISSIONS[code],
            True,
        )
    user = OperatorUser(
        uuid4(), "operator", passwords.hash(PASSWORD), system_role_id("ADMIN"), True, clock.now()
    )
    db.state.users[user.id] = user

    def service():
        return OperatorAuthService(
            users,
            roles,
            sessions,
            tickets,
            db,
            db,
            passwords,
            secrets,
            tokens,
            clock,
            TestLimiter(),
        )

    return db, user, clock, service, secrets


async def login(world):
    return await world[3]().login("  OPERATOR  ", PASSWORD, "synthetic-client")


async def test_login_authentication_and_no_plaintext_in_persistence(world):
    db, user, _clock, service, _secrets = world
    issued = await login(world)
    assert issued.principal.id == user.id
    assert (
        await service().authenticate(issued.access_token)
    ).permissions == issued.principal.permissions
    persisted = repr(db.state)
    assert issued.refresh_token not in persisted and issued.csrf_token not in persisted
    assert PASSWORD not in persisted
    assert issued.refresh_token not in repr(issued)


@pytest.mark.parametrize("username,password", [("missing", PASSWORD), ("operator", "wrong")])
async def test_invalid_credentials_are_uniform(world, username, password):
    with pytest.raises(AuthenticationError) as error:
        await world[3]().login(username, password, "client")
    assert error.value.code == "INVALID_CREDENTIALS"
    assert not world[0].state.families


async def test_two_workers_refresh_only_one_cookie_rotation(world):
    issued = await login(world)
    worker_a, worker_b = world[3](), world[3]()
    results = await asyncio.gather(
        *[
            s.refresh(issued.refresh_token, issued.csrf_token, issued.csrf_token, "client")
            for s in (worker_a, worker_b)
        ],
        return_exceptions=True,
    )
    assert sum(not isinstance(result, Exception) for result in results) == 1
    conflict = next(result for result in results if isinstance(result, ConflictError))
    assert conflict.code == "REFRESH_IN_PROGRESS"
    assert len(world[0].state.families) == 1
    assert len(world[0].state.refreshes) == 2
    assert not world[0].state.families[issued.family.id].revoked_at
    winner = next(result for result in results if not isinstance(result, Exception))
    assert (await worker_b.authenticate(winner.access_token)).id == issued.principal.id


async def test_reuse_revoke_commits_before_error_and_all_workers_deny(world):
    issued = await login(world)
    newer = await world[3]().refresh(
        issued.refresh_token, issued.csrf_token, issued.csrf_token, "client"
    )
    world[2].value += timedelta(seconds=6)
    with pytest.raises(AuthenticationError) as error:
        await world[3]().refresh(
            issued.refresh_token, issued.csrf_token, issued.csrf_token, "client"
        )
    assert error.value.code == "REFRESH_REUSE_DETECTED"
    assert world[0].state.families[issued.family.id].revoked_at
    assert world[0].state.events
    with pytest.raises(AuthenticationError):
        await world[3]().authenticate(newer.access_token)


async def test_bad_csrf_cannot_rotate_or_force_reuse_logout(world):
    issued = await login(world)
    await world[3]().refresh(issued.refresh_token, issued.csrf_token, issued.csrf_token, "client")
    world[2].value += timedelta(seconds=6)
    with pytest.raises(AuthorizationError):
        await world[3]().refresh(issued.refresh_token, "bad", "bad", "client")
    assert not world[0].state.families[issued.family.id].revoked_at


async def test_lost_response_old_cookie_has_bounded_grace_then_reauth(world):
    issued = await login(world)
    await world[3]().refresh(issued.refresh_token, issued.csrf_token, issued.csrf_token, "client")
    for _ in range(2):
        with pytest.raises(ConflictError):
            await world[3]().refresh(
                issued.refresh_token, issued.csrf_token, issued.csrf_token, "client"
            )
    assert len(world[0].state.refreshes) == 2
    world[2].value += timedelta(seconds=6)
    with pytest.raises(AuthenticationError):
        await world[3]().refresh(
            issued.refresh_token, issued.csrf_token, issued.csrf_token, "client"
        )


async def test_logout_after_refresh_prevents_late_credentials_reviving(world):
    issued = await login(world)
    next_issue = await world[3]().refresh(
        issued.refresh_token, issued.csrf_token, issued.csrf_token, "client"
    )
    await world[3]().logout(principal=issued.principal)
    with pytest.raises(AuthenticationError):
        await world[3]().authenticate(next_issue.access_token)
    with pytest.raises(AuthenticationError):
        await world[3]().refresh(
            next_issue.refresh_token, next_issue.csrf_token, next_issue.csrf_token, "client"
        )


async def test_cookie_logout_checks_both_csrf_cookie_and_header(world):
    issued = await login(world)
    with pytest.raises(AuthorizationError):
        await world[3]().logout(
            credential=issued.refresh_token, csrf_cookie=issued.csrf_token, csrf_header=None
        )
    await world[3]().logout(
        credential=issued.refresh_token,
        csrf_cookie=issued.csrf_token,
        csrf_header=issued.csrf_token,
    )
    assert world[0].state.families[issued.family.id].revoked_at


async def test_idle_absolute_expiry_and_refresh_does_not_extend_absolute(world):
    issued = await login(world)
    next_issue = await world[3]().refresh(
        issued.refresh_token, issued.csrf_token, issued.csrf_token, "client"
    )
    assert next_issue.family.expires_at == issued.family.expires_at
    world[2].value += timedelta(days=1, seconds=1)
    with pytest.raises(AuthenticationError) as error:
        await world[3]().refresh(
            next_issue.refresh_token, next_issue.csrf_token, next_issue.csrf_token, "client"
        )
    assert error.value.code == "SESSION_EXPIRED"


async def test_forced_password_restricted_then_atomic_change_replaces_sessions(world):
    db, user, _, service, _ = world
    db.state.users[user.id] = replace(user, must_change_password=True)
    issued = await login(world)
    with pytest.raises(AuthorizationError):
        issued.principal.require("gate-logs:read")
    with pytest.raises(AuthorizationError):
        await service().issue_ticket(issued.principal, "security.alerts")
    changed = await service().change_password(
        issued.principal, PASSWORD, "new-synthetic-password", "req"
    )
    assert not changed.principal.must_change_password
    assert changed.family.id != issued.family.id
    with pytest.raises(AuthenticationError):
        await service().authenticate(issued.access_token)
    assert PASSWORD not in repr(db.state.audits)
    assert "new-synthetic-password" not in repr(db.state.audits)
    assert db.state.events


async def test_password_change_audit_failure_rolls_back_password_and_revoke(world):
    db, user, _, service, _ = world
    issued = await login(world)
    db.audit_unavailable = True
    with pytest.raises(RuntimeError):
        await service().change_password(issued.principal, PASSWORD, "new-synthetic-password", "req")
    assert db.state.users[user.id].password_hash == user.password_hash
    assert not db.state.families[issued.family.id].revoked_at
    assert (await service().authenticate(issued.access_token)).id == user.id


async def test_version_role_user_changes_fail_closed_on_other_worker(world):
    db, user, _, service, _ = world
    issued = await login(world)
    db.state.users[user.id] = replace(user, session_version=2, authz_version=2, version=2)
    with pytest.raises(AuthenticationError):
        await service().authenticate(issued.access_token)
    with pytest.raises(AuthenticationError):
        await service().revalidate(issued.principal)


async def test_ws_ticket_wrong_channel_replay_and_expiry(world):
    issued = await login(world)
    raw, _ticket = await world[3]().issue_ticket(issued.principal, "security.alerts")
    assert raw not in repr(world[0].state)
    with pytest.raises(AuthenticationError):
        await world[3]().consume_ticket(raw, "wrong.channel")
    principal = await world[3]().consume_ticket(raw, "security.alerts")
    assert principal.id == issued.principal.id
    with pytest.raises(AuthenticationError):
        await world[3]().consume_ticket(raw, "security.alerts")
    raw, _ = await world[3]().issue_ticket(issued.principal, "security.alerts")
    world[2].value += timedelta(seconds=30)
    with pytest.raises(AuthenticationError):
        await world[3]().consume_ticket(raw, "security.alerts")


async def test_ticket_revoke_after_issue_and_storage_error_fail_closed(world):
    issued = await login(world)
    raw, _ = await world[3]().issue_ticket(issued.principal, "security.alerts")
    await world[3]().logout(principal=issued.principal)
    with pytest.raises(AuthenticationError):
        await world[3]().consume_ticket(raw, "security.alerts")
    world[0].state.roles.clear()
    with pytest.raises(AuthenticationError):
        await world[3]().authenticate(issued.access_token)
