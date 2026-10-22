from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import timedelta
from uuid import uuid4

import pytest

from smart_gate.application.operator_admin import OperatorAdminService
from smart_gate.domain.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    SmartGateError,
)
from smart_gate.domain.identity_queries import AuditFilters, UserFilters
from smart_gate.domain.operator_identity import OperatorRole, OperatorUser
from smart_gate.domain.permission_catalog import system_role_id
from smart_gate.infrastructure.security.identity_cursor import SignedIdentityCursor
from tests.unit.test_operator_auth import PASSWORD
from tests.unit.test_operator_auth import world as world

pytestmark = pytest.mark.asyncio


@pytest.fixture
def setup(world):
    db, _, clock, service, _ = world
    for key, role in db.state.roles.items():
        db.state.roles[key] = replace(role, created_at=clock.now())
    auth = service()
    admin = OperatorAdminService(
        auth.users,
        auth.roles,
        auth.sessions,
        auth.audit,
        auth.work,
        auth,
        auth.passwords,
        clock,
        SignedIdentityCursor(b"synthetic-unit-cursor-key-32bytes"),
    )
    return world, auth, admin


async def root(setup):
    return (await setup[1].login("operator", PASSWORD, "client")).principal


async def delegate(setup, permissions):
    world, auth, _ = setup
    db, _, clock, _, _ = world
    role = OperatorRole(
        uuid4(),
        "CUSTOM_" + uuid4().hex[:8].upper(),
        "Custom",
        frozenset(permissions),
        created_at=clock.now(),
    )
    db.state.roles[role.id] = role
    user = OperatorUser(
        uuid4(),
        "user-" + uuid4().hex[:8],
        auth.passwords.hash(PASSWORD),
        role.id,
        True,
        clock.now(),
    )
    db.state.users[user.id] = user
    return user, (await auth.login(user.username, PASSWORD, "client")).principal


async def test_create_read_update_profile_and_version_conflict(setup):
    actor = await root(setup)
    admin = setup[2]
    user = await admin.create_user(
        actor,
        "  OPERATOR-TWO ",
        "temporary-password",
        system_role_id("SECURITY"),
        "Nhân viên",
        "request",
    )
    assert user.username == "operator-two" and user.must_change_password
    assert (await admin.read_user(actor, user.id)).id == user.id
    updated = await admin.update_profile(actor, user.id, user.version, None, None, True, "request")
    assert updated.display_name is None and updated.role_id == user.role_id
    with pytest.raises(ConflictError):
        await admin.update_profile(
            actor, user.id, user.version, "stale-name", None, False, "request"
        )
    assert (await admin.read_user(actor, user.id)).username == "operator-two"
    with pytest.raises(ConflictError):
        await admin.create_user(
            actor, "OPERATOR-TWO", "temporary-password", system_role_id("SECURITY"), None, "req"
        )


async def test_delegate_cannot_create_admin_or_manage_admin_target(setup):
    _, actor = await delegate(
        setup, {"users:create", "users:assign-role", "roles:read", "users:reset-password"}
    )
    admin = setup[2]
    with pytest.raises(AuthorizationError):
        await admin.create_user(
            actor, "forged-admin", "temporary-password", system_role_id("ADMIN"), None, "req"
        )
    original = setup[0][1]
    with pytest.raises(AuthorizationError):
        await admin.reset_password(
            actor, original.id, "temporary-password", original.version, "valid reason", "req"
        )
    assert not any(user.username == "forged-admin" for user in setup[0][0].state.users.values())
    assert any(audit.outcome == "DENIED" for audit in setup[0][0].state.audits)


async def test_last_admin_disable_and_assign_role_are_rejected(setup):
    actor = await root(setup)
    user = setup[0][1]
    admin = setup[2]
    with pytest.raises(ConflictError) as error:
        await admin.set_status(actor, user.id, False, user.version, "valid reason", "req")
    assert error.value.code == "LAST_ADMIN_PROTECTED"
    with pytest.raises(ConflictError):
        await admin.assign_role(
            actor, user.id, system_role_id("SECURITY"), user.version, "valid reason", "req"
        )
    assert setup[0][0].state.users[user.id].is_active


async def test_two_admin_self_demotions_keep_one_admin(setup):
    actor = await root(setup)
    world, auth, admin = setup
    db, user, clock, _, _ = world
    second = OperatorUser(
        uuid4(),
        "second-admin",
        auth.passwords.hash(PASSWORD),
        system_role_id("ADMIN"),
        True,
        clock.now(),
    )
    db.state.users[second.id] = second
    other = (await auth.login(second.username, PASSWORD, "client")).principal
    results = await asyncio.gather(
        admin.assign_role(actor, user.id, system_role_id("SECURITY"), 1, "valid reason", "req"),
        admin.assign_role(other, second.id, system_role_id("SECURITY"), 1, "valid reason", "req"),
        return_exceptions=True,
    )
    assert sum(not isinstance(x, Exception) for x in results) == 1
    assert sum(isinstance(x, ConflictError) for x in results) == 1
    assert (
        sum(u.role_id == system_role_id("ADMIN") and u.is_active for u in db.state.users.values())
        == 1
    )


async def test_reset_password_revoke_and_restricted_principal_without_secret_audit(setup):
    actor = await root(setup)
    world, auth, admin = setup
    target, principal = await delegate(setup, {"gate-logs:read"})
    changed = await admin.reset_password(
        actor, target.id, "temporary-password-new", target.version, "valid reason", "req"
    )
    assert changed.must_change_password
    with pytest.raises(AuthenticationError):
        await auth.revalidate(principal)
    signed = await auth.login(target.username, "temporary-password-new", "client")
    assert signed.principal.must_change_password and not signed.principal.permissions
    assert "temporary-password-new" not in repr(world[0].state.audits)
    assert not any(
        {
            "password",
            "password_hash",
            "temporary_password",
            "refresh_token",
            "token_hash",
            "csrf_hash",
        }
        & set(audit.changes)
        for audit in world[0].state.audits
    )


async def test_status_reactivation_never_revives_old_session_and_revoke_all(setup):
    actor = await root(setup)
    _, auth, admin = setup
    target, principal = await delegate(setup, {"gate-logs:read"})
    assert (await admin.read_sessions(actor, target.id)).items[0].user_id == target.id
    disabled = await admin.set_status(
        actor, target.id, False, target.version, "valid reason", "req"
    )
    enabled = await admin.set_status(
        actor, target.id, True, disabled.version, "valid reason", "req"
    )
    with pytest.raises(AuthenticationError):
        await auth.revalidate(principal)
    signed = await auth.login(target.username, PASSWORD, "client")
    await admin.revoke_sessions(actor, target.id, enabled.version, "valid reason", "req")
    with pytest.raises(AuthenticationError):
        await auth.authenticate(signed.access_token)


async def test_custom_roles_create_profile_permissions_archive_and_assigned_role_guard(setup):
    actor = await root(setup)
    _, _, admin = setup
    role = await admin.create_role(actor, "READ_ONLY", "Chỉ đọc", None, "req")
    assert (await admin.read_role(actor, role.id)).code == "READ_ONLY"
    role = await admin.update_role(
        actor, role.id, role.version, "valid reason", "Tên mới", None, True, None, "req"
    )
    role = await admin.replace_permissions(
        actor, role.id, frozenset({"gate-logs:read"}), role.version, "valid reason", "req"
    )
    user = await admin.create_user(
        actor, "readonly-user", "temporary-password", role.id, None, "req"
    )
    with pytest.raises(ConflictError) as error:
        await admin.update_role(
            actor,
            role.id,
            role.version,
            "valid reason",
            None,
            None,
            False,
            None,
            "req",
            archive=True,
        )
    assert error.value.code == "ROLE_IN_USE"
    assert user.role_id == role.id
    empty = await admin.create_role(actor, "UNASSIGNED", "Unassigned", None, "req")
    archived = await admin.update_role(
        actor, empty.id, empty.version, "valid reason", None, None, False, None, "req", archive=True
    )
    assert not archived.is_active


@pytest.mark.parametrize("permissions", [{"*"}, {"reports:export"}, {"users:manage-admin"}])
async def test_permission_replace_rejects_unknown_dependency_protected_atomically(
    setup, permissions
):
    actor = await root(setup)
    admin = setup[2]
    role = await admin.create_role(actor, "CUSTOM_ROLE", "Custom", None, "req")
    with pytest.raises((ConflictError, AuthorizationError)):
        await admin.replace_permissions(
            actor, role.id, frozenset(permissions), role.version, "valid reason", "req"
        )
    assert not (await admin.read_role(actor, role.id)).permissions


async def test_role_permission_fanout_invalidates_every_member(setup):
    actor = await root(setup)
    world, auth, admin = setup
    user, first = await delegate(setup, {"gate-logs:read"})
    second = replace(user, id=uuid4(), username="another-member")
    world[0].state.users[second.id] = second
    second_principal = (await auth.login(second.username, PASSWORD, "client")).principal
    await admin.replace_permissions(actor, user.role_id, frozenset(), 1, "valid reason", "req")
    for principal in [first, second_principal]:
        with pytest.raises(AuthenticationError):
            await auth.revalidate(principal)
    assert len(world[0].state.events) == 2


async def test_sensitive_mutation_audit_failure_rolls_back_everything(setup):
    actor = await root(setup)
    world, _, admin = setup
    target, _ = await delegate(setup, {"gate-logs:read"})
    world[0].audit_unavailable = True
    with pytest.raises(RuntimeError):
        await admin.set_status(actor, target.id, False, target.version, "valid reason", "req")
    assert world[0].state.users[target.id] == target
    assert not world[0].state.events


async def test_users_roles_catalog_audit_pagination_scope_and_no_total_invention(setup):
    actor = await root(setup)
    world, _, admin = setup
    for n in range(3):
        await admin.create_user(
            actor, f"page-user-{n}", "temporary-password", system_role_id("SECURITY"), None, "req"
        )
    first = await admin.list_users(actor, UserFilters(search="page-"), None, 2)
    assert len(first.items) == 2 and first.has_more and first.next_cursor
    last = await admin.list_users(actor, UserFilters(search="page-"), first.next_cursor, 2)
    assert len(last.items) == 1 and not last.has_more
    assert not set(user.id for user in first.items) & {user.id for user in last.items}
    with pytest.raises(ConflictError):
        await admin.list_users(actor, UserFilters(search="other"), first.next_cursor, 2)
    catalog = await admin.list_permissions(actor, None, 50)
    remainder = await admin.list_permissions(actor, catalog.next_cursor, 50)
    assert len(catalog.items) + len(remainder.items) == 70
    assert not remainder.has_more
    roles = await admin.list_roles(actor, None, 1)
    assert roles.has_more and roles.next_cursor
    assert (
        await admin.list_audit(actor, AuditFilters(outcome="SUCCEEDED"), None, 2)
    ).coverage == "partial"
    assert not hasattr(first, "total")
    world[2].value += timedelta(hours=1)
    with pytest.raises(SmartGateError) as error:
        await admin.list_users(actor, UserFilters(search="page-"), first.next_cursor, 2)
    assert error.value.code == "CURSOR_INVALID"
