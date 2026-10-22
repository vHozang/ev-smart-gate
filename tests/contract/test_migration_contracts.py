from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.openapi.models import OpenAPI
from pydantic import ValidationError

from scripts.export_migration_contracts import build_contract
from smart_gate.config import Settings
from smart_gate.main import create_app
from smart_gate.presentation.contracts import migration as c


def test_target_contract_is_valid_and_separate_from_runtime() -> None:
    target = build_contract()
    OpenAPI.model_validate(target)
    assert target["x-contract-status"] == "review-required"
    assert json.loads(Path("docs/contracts/migration.openapi.json").read_text("utf-8")) == target
    paths = create_app(Settings(_env_file=None, APP_ENV="test")).openapi()["paths"]
    assert not set(target["paths"]).intersection(paths)
    assert "/api/v1/auth/login" in paths
    assert "/api/v2/auth/login" in target["paths"]


def test_all_target_references_resolve_and_operations_are_planned() -> None:
    target = build_contract()

    def walk(value: object) -> None:
        if isinstance(value, dict):
            if "$ref" in value:
                ref = value["$ref"]
                assert ref.startswith("#/")
                node = target
                for segment in ref[2:].split("/"):
                    node = node[segment.replace("~1", "/").replace("~0", "~")]
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(target)
    operations = [operation for path in target["paths"].values() for operation in path.values()]
    assert len(operations) == 49
    assert all(op["x-implementation-status"] == "planned" for op in operations)
    assert len({op["operationId"] for op in operations}) == len(operations)
    assert not any(path.startswith("/api/v1/warehouse") for path in target["paths"])


@pytest.mark.parametrize(
    "field", ["role_id", "password", "is_active", "permissions", "authz_version"]
)
def test_profile_contract_rejects_mass_assignment(field: str) -> None:
    with pytest.raises(ValidationError):
        c.UserProfilePatch.model_validate({"expected_version": 1, field: "unauthorized"})


def test_contract_rejects_unsafe_permission_codes_and_missing_version() -> None:
    with pytest.raises(ValidationError):
        c.PermissionReplace(expected_version=1, reason="test reason", permission_codes=["*"])
    with pytest.raises(ValidationError):
        c.UserRoleChange.model_validate({"role_id": str(uuid4()), "reason": "test reason"})


def test_pedestrian_contract_does_not_require_plate_and_forbids_forged_device() -> None:
    now = datetime.now(UTC)
    data = {
        "schema_version": "1.0",
        "encounter_id": "test-encounter",
        "access_point_id": "gate-a",
        "lane_id": "walk-a",
        "access_mode": "pedestrian",
        "calibration_version": "test-v1",
        "face_captured_at": now,
        "rfid_captured_at": now,
        "card_uid": "unit-test-card",
    }
    assert c.CaptureMetadata.model_validate(data).plate_captured_at is None
    with pytest.raises(ValidationError):
        c.CaptureMetadata.model_validate({**data, "device_id": "forged-device"})
    with pytest.raises(ValidationError):
        c.CaptureMetadata.model_validate({**data, "access_mode": "motorcycle"})
    with pytest.raises(ValidationError):
        c.VerificationRequest.model_validate(
            {
                "event_id": "test-event",
                "gate_id": "gate-a",
                "capture_bundle_id": str(uuid4()),
                "card_uid": "different-card",
            }
        )


def test_period_grant_and_filters_require_valid_typed_data() -> None:
    now = datetime.now(UTC)
    with pytest.raises(ValidationError):
        c.Period.model_validate({"from": now, "to": now - timedelta(seconds=1)})
    with pytest.raises(ValidationError):
        c.Period.model_validate({"from": "2026-10-20T00:00:00", "to": "2026-10-21T00:00:00"})
    with pytest.raises(ValidationError):
        c.AnalyticsFilters.model_validate({"$where": "arbitrary database expression"})
    with pytest.raises(ValidationError):
        c.GrantCreate(
            employee_id=uuid4(),
            access_point_ids=["gate-a"],
            directions=["ENTRY"],
            valid_from=now,
            valid_until=now,
            reason="test grant",
        )


def test_response_schemas_do_not_expose_refresh_credentials_or_biometrics() -> None:
    for model in (
        c.AdminUserView,
        c.EffectivePrincipal,
        c.SessionView,
        c.EmployeeView,
        c.CaptureView,
    ):
        properties = model.model_json_schema()["properties"]
        assert not {
            "password",
            "password_hash",
            "refresh_token",
            "face_embedding",
            "card_uid",
        }.intersection(properties)
    assert "refresh_token" not in c.AccessTokenResponse.model_fields
    target = build_contract()
    assert target["paths"]["/api/v2/auth/refresh"]["post"]["security"] == [
        {"RefreshCookie": [], "AuthCsrf": []}
    ]
