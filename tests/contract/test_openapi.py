from __future__ import annotations

from smart_gate.config import Settings
from smart_gate.main import create_app


def test_openapi_exposes_required_contracts() -> None:
    app = create_app(Settings(_env_file=None, APP_ENV="test"))
    schema = app.openapi()
    paths = schema["paths"]

    assert "/api/v1/gates/entry/verifications" in paths
    assert "/api/v1/gates/exit/verifications" in paths
    assert "/api/v1/warehouse/orders/{order_id}/exit-slip" in paths
    assert "/api/v1/security/alerts" in paths
    assert "/api/v1/gate-logs" in paths
    assert "/api/v1/warehouse/dock-sessions" in paths
    assert "/api/v1/warehouse/dock-sessions/{inspection_id}" in paths
    assert (
        paths["/api/v1/warehouse/orders"]["post"]["responses"]["201"]["content"][
            "application/json"
        ]["schema"]["$ref"]
        == "#/components/schemas/OrderOutput"
    )
    assert (
        paths["/api/v1/warehouse/orders/{order_id}/dock-sessions"]["post"]["responses"]["201"][
            "content"
        ]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/DockOutput"
    )
    assert (
        paths["/api/v1/warehouse/orders/{order_id}/exit-slip"]["post"]["responses"]["200"][
            "content"
        ]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/SlipOutput"
    )

    # Employee card routes
    assert "/api/v1/employee-cards" in paths
    assert "/api/v1/employee-cards/{card_id}" in paths
    assert "/api/v1/employee-cards/{card_id}/block" in paths
    assert "/api/v1/employee-cards/{card_id}/report-lost" in paths
    assert "/api/v1/employee-cards/{card_id}/replace" in paths

    # Multipart verification contracts
    def _resolve_schema(ref_dict: dict) -> dict:
        ref = ref_dict.get("$ref")
        if not ref:
            return ref_dict
        key = ref.removeprefix("#/components/schemas/")
        return schema["components"]["schemas"][key]

    entry_schema = _resolve_schema(
        paths["/api/v1/gates/entry/verifications"]["post"]["requestBody"]["content"][
            "multipart/form-data"
        ]["schema"]
    )
    assert set(entry_schema["required"]) == {
        "event_id",
        "gate_id",
        "card_uid",
        "plate_image",
        "face_image",
    }

    exit_schema = _resolve_schema(
        paths["/api/v1/gates/exit/verifications"]["post"]["requestBody"]["content"][
            "multipart/form-data"
        ]["schema"]
    )
    assert set(exit_schema["required"]) == {
        "event_id",
        "gate_id",
        "card_uid",
        "plate_image",
        "face_image",
    }
    assert "slip_image" not in exit_schema.get("properties", {})
    assert "slip_image" not in exit_schema.get("required", [])

    # Card response schema privacy check
    card_schema = schema["components"]["schemas"]["EmployeeCardResponse"]
    assert "card_uid_masked" in card_schema["properties"]
    assert "card_uid" not in card_schema["properties"]
    assert "card_uid_normalized" not in card_schema["properties"]


def test_operator_console_routes_are_mounted() -> None:
    app = create_app(Settings(_env_file=None, APP_ENV="test"))
    paths = {getattr(route, "path", "") for route in app.routes}

    assert "/" in paths
    assert "/assets" in paths
