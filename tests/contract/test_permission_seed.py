from __future__ import annotations

import json
from pathlib import Path

from scripts.export_permission_seed import build_seed


def test_seed_snapshot_has_no_drift_or_implicit_legacy_privilege_expansion() -> None:
    seed = build_seed()
    assert json.loads(Path("docs/contracts/permission-seed.json").read_text("utf-8")) == seed
    legacy = set(seed["legacy_permissions"])
    for role, baseline in seed["baseline_roles"].items():
        assert set(seed["target_roles_after_review"][role]) & legacy == set(baseline)
    assert "employee-cards:issue" not in seed["baseline_roles"]["SECURITY"]
    assert "gates:verify-entry" not in seed["baseline_roles"]["WAREHOUSE"]
    assert "gate-logs:read" in seed["baseline_roles"]["WAREHOUSE"]


def test_protected_permissions_dependencies_and_domain_restrictions() -> None:
    seed = build_seed()
    catalog = {item["code"]: item for item in seed["catalog"]}
    for entry in catalog.values():
        assert "*" not in entry["code"]
        assert all(code in catalog for code in entry["dependencies"])
    protected = {code for code, entry in catalog.items() if entry["protected"]}
    assert protected == {"users:assign-admin", "users:manage-admin"}
    assert protected.issubset(seed["target_roles_after_review"]["ADMIN"])
    assert not protected.intersection(seed["target_roles_after_review"]["SECURITY"])
    assert not protected.intersection(seed["target_roles_after_review"]["WAREHOUSE"])
    assert "analytics:read-people" not in seed["target_roles_after_review"]["WAREHOUSE"]
    assert "capture:ingest" not in catalog
    assert seed["status"] == "review-required-not-applied"
