from __future__ import annotations

import argparse
import inspect
import json
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from fastapi.routing import APIRoute, APIWebSocketRoute

from smart_gate.config import Settings
from smart_gate.main import create_app

TARGET = Path("docs/contracts/runtime-inventory.json")
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}


def _routes(routes: list[Any]) -> Iterator[APIRoute | APIWebSocketRoute]:
    """Hỗ trợ router trực tiếp và lazy included router của FastAPI mới."""
    for route in routes:
        if isinstance(route, (APIRoute, APIWebSocketRoute)):
            yield route
        elif original := getattr(route, "original_router", None):
            yield from _routes(original.routes)


def _authorization(dependant: Any) -> dict[str, Any]:
    roles: set[str] = set()
    scopes: set[str] = set()
    session = False
    csrf = False

    def visit(node: Any) -> None:
        nonlocal session, csrf
        call = node.call
        name = getattr(call, "__name__", "")
        if name in {"current_user", "csrf_user"}:
            session = True
            csrf |= name == "csrf_user"
        if inspect.isfunction(call):
            values = inspect.getclosurevars(call).nonlocals
            roles.update(str(role) for role in values.get("roles", ()))
            scope = values.get("scope")
            if scope:
                scopes.add(scope)
                # require_device_or_roles tự kiểm session/CSRF trong closure.
                if "roles" in values:
                    session = True
                    csrf = True
        for dependency in node.dependencies:
            visit(dependency)

    visit(dependant)
    return {
        "operator_auth": "session_cookie" if session else None,
        "operator_roles": sorted(roles),
        "operator_csrf_required": csrf,
        "device_scopes_any": sorted(scopes),
        "public": not session and not scopes,
    }


def build_inventory() -> dict[str, Any]:
    """Lấy contract thực tế, không chạy lifespan hoặc thay thế database bằng mock."""
    app = create_app(Settings(_env_file=None, APP_ENV="test"))
    schema = app.openapi()
    operations = []
    websockets = []
    for route in _routes(app.routes):
        if isinstance(route, APIWebSocketRoute):
            # Router hiện kiểm quyền inline, không khai báo Depends cho handshake.
            websockets.append(
                {
                    "path": route.path,
                    "endpoint": route.name,
                    "operator_auth": "session_cookie",
                    "operator_roles": ["ADMIN", "SECURITY"],
                    "policy_source": "presentation/routers/security.py:alerts_websocket",
                    "revalidation": "before_each_send_and_idle_1s",
                    "resync": "/api/v1/security/alerts?after_sequence=<sequence>&limit=<limit>",
                    "retention_gap_protocol": "not_implemented",
                }
            )
            continue
        if not route.include_in_schema:
            continue
        authorization = _authorization(route.dependant)
        for method in sorted(route.methods or ()):
            operation = schema["paths"][route.path][method.lower()]
            body = operation.get("requestBody", {})
            operations.append(
                {
                    "method": method,
                    "path": route.path,
                    "operation_id": operation["operationId"],
                    "authorization": authorization,
                    "query_parameters": [
                        parameter
                        for parameter in operation.get("parameters", [])
                        if parameter.get("in") == "query"
                    ],
                    "request_content_types": sorted(body.get("content", {})),
                    "responses": operation["responses"],
                    "status": "implemented",
                }
            )
    actual = {(item["method"].lower(), item["path"]) for item in operations}
    declared = {
        (method, path)
        for path, item in schema["paths"].items()
        for method in item
        if method in HTTP_METHODS
    }
    if actual != declared:
        raise ValueError("Router inventory không khớp runtime OpenAPI")
    return {
        "schema_version": "1.0.0",
        "source": "create_app(Settings(APP_ENV=test)).openapi + router dependency tree",
        "http_operation_count": len(operations),
        "websocket_count": len(websockets),
        "operations": sorted(operations, key=lambda item: (item["path"], item["method"])),
        "websockets": websockets,
        "limitations": [
            "Profile mặc định chưa bật JWT; auth v2 có feature flag riêng. RBAC CRUD/analytics/reports/pedestrian chưa triển khai.",
            "OpenAPI hiện chưa khai báo đủ custom error envelopes/security schemes.",
            "List trả array không có total/cursor trừ query đã liệt kê; không suy tổng.",
            "WS v1 revalidate trước send/idle; M1 vẫn phải bổ sung ticket v2/gap protocol.",
        ],
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Xuất inventory API và quyền runtime")
    parser.add_argument("--output", type=Path, default=TARGET)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    inventory = build_inventory()
    if args.check:
        if not args.output.is_file() or json.loads(args.output.read_text("utf-8")) != inventory:
            parser.exit(1, "Runtime inventory drift; xuất lại và review quyền/contract.\n")
        print("Runtime API inventory không drift")
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Đã xuất {len(inventory['operations'])} HTTP + {len(inventory['websockets'])} WS")


if __name__ == "__main__":
    main()
