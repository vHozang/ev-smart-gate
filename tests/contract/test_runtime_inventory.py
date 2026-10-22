from __future__ import annotations

import json
from pathlib import Path

from scripts.export_api_inventory import build_inventory
from smart_gate.config import Settings
from smart_gate.main import create_app


def test_runtime_contract_snapshots_have_no_drift() -> None:
    schema = create_app(Settings(_env_file=None, APP_ENV="test")).openapi()
    assert json.loads(Path("docs/openapi.json").read_text("utf-8")) == schema
    assert json.loads(Path("docs/contracts/runtime-inventory.json").read_text("utf-8")) == (
        build_inventory()
    )


def test_baseline_permissions_and_device_scope_remain_explicit() -> None:
    inventory = build_inventory()
    operations = {(item["method"], item["path"]): item for item in inventory["operations"]}
    assert inventory["http_operation_count"] == 44
    assert inventory["websocket_count"] == 1
    cards = operations["POST", "/api/v1/employee-cards"]["authorization"]
    assert cards["operator_roles"] == ["ADMIN"]
    assert cards["operator_csrf_required"] is True
    gate = operations["POST", "/api/v1/gates/exit/verifications"]["authorization"]
    assert gate["operator_roles"] == ["ADMIN", "SECURITY"]
    assert gate["device_scopes_any"] == ["gate:exit"]
    assert operations["GET", "/health/ready"]["authorization"]["public"] is True
    assert operations["GET", "/api/v1/auth/me"]["authorization"]["public"] is False
    assert all(item["status"] == "implemented" for item in operations.values())


def test_default_profile_hides_opt_in_and_unimplemented_contracts() -> None:
    paths = {item["path"] for item in build_inventory()["operations"]}
    assert not any(path.startswith("/api/v2/auth") for path in paths)
    assert "/api/v1/assistant/reports" not in paths
    assert "/api/v1/analytics/dashboard" not in paths
    assert "/api/v1/pedestrian-gates/entry/verifications" not in paths
