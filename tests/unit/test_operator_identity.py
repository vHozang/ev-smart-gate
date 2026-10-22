from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest

from smart_gate.domain.exceptions import AuthorizationError, ConflictError
from smart_gate.domain.operator_identity import (
    OperatorPrincipal,
    OperatorRole,
    SecurityAudit,
    require_admin_survives,
    require_grantable,
    require_manage_target,
)
from smart_gate.domain.permission_catalog import (
    APPROVED_NEW_PERMISSIONS,
    BASELINE_ROLE_PERMISSIONS,
    HTTP_PERMISSIONS,
    PERMISSION_DEPENDENCIES,
    system_role_id,
)


def role(code="ADMIN"):
    return OperatorRole(
        system_role_id(code),
        code,
        code,
        BASELINE_ROLE_PERMISSIONS[code] | APPROVED_NEW_PERMISSIONS[code],
        True,
    )


def principal(permissions=None):
    r = role()
    return OperatorPrincipal(
        uuid4(),
        "admin",
        r.id,
        r.code,
        r.permissions if permissions is None else frozenset(permissions),
        1,
        False,
        uuid4(),
        1,
        1,
    )


def test_domain_catalog_matches_approved_mg0_without_expanding_legacy():
    seed = json.loads(Path("docs/contracts/permission-seed.json").read_text("utf-8"))
    assert set(PERMISSION_DEPENDENCIES) == {p["code"] for p in seed["catalog"]}
    for code, permissions in seed["baseline_roles"].items():
        assert BASELINE_ROLE_PERMISSIONS[code] == frozenset(permissions)
        assert APPROVED_NEW_PERMISSIONS[code] == frozenset(
            seed["new_permission_grants_requiring_review"][code]
        )
        assert system_role_id(code) == system_role_id(code)
        role(code).validate_permissions(role(code).permissions)
    assert {key: value for key, value in HTTP_PERMISSIONS.items()} == {
        (item["method"], item["path"]): item["permission"]
        for item in seed["current_operation_bindings"]
    }
    assert "capture:ingest" not in PERMISSION_DEPENDENCIES


@pytest.mark.parametrize("permissions", [{"*"}, {"unknown:read"}, {"reports:export"}])
def test_role_rejects_unknown_wildcard_and_missing_dependency(permissions):
    with pytest.raises(ConflictError):
        OperatorRole(uuid4(), "CUSTOM", "Custom", frozenset()).validate_permissions(
            frozenset(permissions)
        )


def test_protected_permission_and_admin_core_cannot_be_removed():
    with pytest.raises(AuthorizationError):
        OperatorRole(uuid4(), "ADMIN", "Fake", frozenset()).validate_permissions(
            frozenset({"users:manage-admin"})
        )
    with pytest.raises(ConflictError):
        role().validate_permissions(frozenset())


def test_restricted_principal_denied_business_but_can_read_me():
    actor = replace(principal(), must_change_password=True)
    with pytest.raises(AuthorizationError, match="Cần đổi mật khẩu"):
        actor.require("gate-logs:read")
    actor.require(restricted_allowed=True)


def test_admin_assignment_and_target_guards_cannot_be_bypassed():
    actor = principal({"users:create", "users:assign-role", "users:reset-password"})
    with pytest.raises(AuthorizationError):
        require_grantable(actor, role())
    with pytest.raises(AuthorizationError):
        require_manage_target(actor, "users:reset-password", role())
    with pytest.raises(AuthorizationError):
        require_grantable(actor, role("SECURITY"))
    require_grantable(principal(), role("SECURITY"))


def test_last_admin_invariant_and_account_is_not_physical_grant():
    with pytest.raises(ConflictError, match="ADMIN cuối cùng"):
        require_admin_survives(role(), True, role("SECURITY"), True, 1)
    with pytest.raises(ConflictError):
        require_admin_survives(role(), True, role(), False, 1)
    require_admin_survives(role(), True, role(), False, 2)
    assert not hasattr(principal(), "physical_grants")


@pytest.mark.parametrize(
    "field", ["password", "password_hash", "token", "prompt", "card_uid", "biometric"]
)
def test_audit_rejects_sensitive_fields(field):
    with pytest.raises(ValueError):
        SecurityAudit(
            uuid4(),
            "test",
            "user",
            str(uuid4()),
            datetime.now(UTC),
            "request",
            "SUCCEEDED",
            {field: "must-not-be-stored"},
        )
