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


def test_operator_console_routes_are_mounted() -> None:
    app = create_app(Settings(_env_file=None, APP_ENV="test"))
    paths = {getattr(route, "path", "") for route in app.routes}

    assert "/" in paths
    assert "/assets" in paths
