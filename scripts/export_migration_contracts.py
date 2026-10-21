from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from pydantic.json_schema import models_json_schema

from smart_gate.presentation.contracts import migration as c

TARGET = Path("docs/contracts/migration.openapi.json")


@dataclass(frozen=True)
class Operation:
    method: str
    path: str
    name: str
    request: type[BaseModel] | None
    response: type[BaseModel]
    permissions: tuple[str, ...] = ()
    status: int = 200
    access: str = "bearer"


def operations() -> list[Operation]:
    """API mục tiêu M0; không đăng ký vào FastAPI đang chạy."""
    auth = "/api/v2/auth"
    admin = "/api/v1/admin"
    result = [
        Operation(
            "post",
            f"{auth}/login",
            "loginV2",
            c.LoginRequest,
            c.AccessTokenResponse,
            access="public",
        ),
        Operation(
            "post", f"{auth}/refresh", "refreshV2", None, c.AccessTokenResponse, access="refresh"
        ),
        Operation("post", f"{auth}/logout", "logoutV2", None, c.Message, access="logout"),
        Operation("get", f"{auth}/me", "principalV2", None, c.EffectivePrincipal),
        Operation(
            "post",
            f"{auth}/change-password",
            "changePasswordV2",
            c.ChangePasswordRequest,
            c.AccessTokenResponse,
        ),
        Operation(
            "post",
            f"{auth}/ws-tickets",
            "createWsTicket",
            c.TicketRequest,
            c.TicketResponse,
            ("alerts:read",),
            201,
        ),
        Operation(
            "get",
            f"{admin}/users",
            "listUsers",
            None,
            c.CursorPage[c.AdminUserView],
            ("users:read",),
        ),
        Operation(
            "post",
            f"{admin}/users",
            "createUser",
            c.UserCreate,
            c.AdminUserView,
            ("users:create", "users:assign-role"),
            201,
        ),
        Operation(
            "get", f"{admin}/users/{{user_id}}", "readUser", None, c.AdminUserView, ("users:read",)
        ),
        Operation(
            "patch",
            f"{admin}/users/{{user_id}}",
            "updateUserProfile",
            c.UserProfilePatch,
            c.AdminUserView,
            ("users:update",),
        ),
        Operation(
            "patch",
            f"{admin}/users/{{user_id}}/status",
            "setUserStatus",
            c.UserStatusChange,
            c.AdminUserView,
            ("users:set-status",),
        ),
        Operation(
            "put",
            f"{admin}/users/{{user_id}}/role",
            "assignUserRole",
            c.UserRoleChange,
            c.AdminUserView,
            ("users:assign-role",),
        ),
        Operation(
            "post",
            f"{admin}/users/{{user_id}}/password-reset",
            "resetUserPassword",
            c.PasswordReset,
            c.AdminUserView,
            ("users:reset-password",),
        ),
        Operation(
            "get",
            f"{admin}/users/{{user_id}}/sessions",
            "listUserSessions",
            None,
            c.CursorPage[c.SessionView],
            ("users:read-sessions",),
        ),
        Operation(
            "post",
            f"{admin}/users/{{user_id}}/sessions/revoke",
            "revokeUserSessions",
            c.VersionedReason,
            c.Message,
            ("users:revoke-sessions",),
        ),
        Operation(
            "get", f"{admin}/roles", "listRoles", None, c.CursorPage[c.RoleView], ("roles:read",)
        ),
        Operation(
            "post", f"{admin}/roles", "createRole", c.RoleCreate, c.RoleView, ("roles:create",), 201
        ),
        Operation(
            "get", f"{admin}/roles/{{role_id}}", "readRole", None, c.RoleView, ("roles:read",)
        ),
        Operation(
            "patch",
            f"{admin}/roles/{{role_id}}",
            "updateRole",
            c.RolePatch,
            c.RoleView,
            ("roles:update",),
        ),
        Operation(
            "delete",
            f"{admin}/roles/{{role_id}}",
            "archiveRole",
            c.VersionedReason,
            c.Message,
            ("roles:delete",),
        ),
        Operation(
            "put",
            f"{admin}/roles/{{role_id}}/permissions",
            "replaceRolePermissions",
            c.PermissionReplace,
            c.RoleView,
            ("roles:assign-permissions",),
        ),
        Operation(
            "get",
            f"{admin}/permissions",
            "listPermissions",
            None,
            c.CursorPage[c.PermissionView],
            ("permissions:read",),
        ),
        Operation(
            "get",
            f"{admin}/audit-logs",
            "listAuditLogs",
            None,
            c.CursorPage[c.AuditView],
            ("audit-logs:read",),
        ),
        Operation(
            "get",
            "/api/v2/security/alerts",
            "resyncAlertsV2",
            None,
            c.AlertBatch,
            ("alerts:read",),
        ),
        Operation(
            "get",
            "/api/v1/employees",
            "listEmployees",
            None,
            c.CursorPage[c.EmployeeView],
            ("employees:read",),
        ),
        Operation(
            "post",
            "/api/v1/employees",
            "createEmployee",
            c.EmployeeCreate,
            c.EmployeeView,
            ("employees:create",),
            201,
        ),
        Operation(
            "get",
            "/api/v1/employees/{employee_id}",
            "readEmployee",
            None,
            c.EmployeeView,
            ("employees:read",),
        ),
        Operation(
            "patch",
            "/api/v1/employees/{employee_id}",
            "updateEmployee",
            c.EmployeePatch,
            c.EmployeeView,
            ("employees:update",),
        ),
        Operation(
            "get",
            "/api/v1/access-points",
            "listAccessPoints",
            None,
            c.CursorPage[c.AccessPointView],
            ("access-points:read",),
        ),
        Operation(
            "get",
            "/api/v1/pedestrian-access-grants",
            "listPedestrianGrants",
            None,
            c.CursorPage[c.GrantView],
            ("pedestrian-grants:read",),
        ),
        Operation(
            "post",
            "/api/v1/pedestrian-access-grants",
            "createPedestrianGrant",
            c.GrantCreate,
            c.GrantView,
            ("pedestrian-grants:create",),
            201,
        ),
        Operation(
            "delete",
            "/api/v1/pedestrian-access-grants/{grant_id}",
            "revokePedestrianGrant",
            c.VersionedReason,
            c.Message,
            ("pedestrian-grants:revoke",),
        ),
        Operation(
            "get",
            "/api/v1/vehicle-types",
            "listVehicleTypes",
            None,
            c.CursorPage[c.VehicleTypeView],
            ("vehicles:read",),
        ),
        Operation(
            "get",
            "/api/v1/person-access-logs",
            "listPersonLogs",
            None,
            c.CursorPage[c.PersonLogView],
            ("person-access-logs:read",),
        ),
        Operation(
            "get",
            "/api/v1/person-access-logs/{access_log_id}/snapshots/{snapshot_index}",
            "readPersonEvidence",
            None,
            c.Message,
            ("person-evidence:read",),
        ),
        Operation(
            "post",
            "/api/v2/capture-bundles",
            "ingestCaptureBundle",
            c.CaptureMetadata,
            c.CaptureView,
            status=201,
            access="device",
        ),
        Operation(
            "get",
            "/api/v2/access-events/{event_id}",
            "reconcileAccessEvent",
            None,
            c.VerificationView,
            access="operator_or_device",
        ),
        Operation(
            "get",
            "/api/v1/analytics/dashboard",
            "readDashboard",
            None,
            c.DashboardView,
            ("dashboard:read",),
        ),
        Operation(
            "get",
            "/api/v1/analytics/metric-definitions",
            "listMetricDefinitions",
            None,
            c.CursorPage[c.MetricDefinition],
            ("dashboard:read",),
        ),
    ]
    for direction in ("entry", "exit"):
        result.extend(
            [
                Operation(
                    "post",
                    f"/api/v2/gates/{direction}/verifications",
                    f"verifyVehicle{direction.title()}",
                    c.VerificationRequest,
                    c.VerificationView,
                    (f"gates:verify-{direction}",),
                    access="operator_or_device",
                ),
                Operation(
                    "post",
                    f"/api/v1/pedestrian-gates/{direction}/verifications",
                    f"verifyPedestrian{direction.title()}",
                    c.VerificationRequest,
                    c.VerificationView,
                    (f"access:verify-pedestrian-{direction}",),
                    access="operator_or_device",
                ),
            ]
        )
    reports = "/api/v1/assistant/reports"
    result.extend(
        [
            Operation(
                "post",
                reports,
                "createReport",
                c.ReportCreate,
                c.ReportView,
                ("assistant:use", "reports:generate"),
                202,
            ),
            Operation(
                "get", reports, "listReports", None, c.CursorPage[c.ReportView], ("reports:read",)
            ),
            Operation(
                "get",
                f"{reports}/{{report_id}}",
                "readReport",
                None,
                c.ReportView,
                ("reports:read",),
            ),
            Operation(
                "get",
                f"{reports}/{{report_id}}/events",
                "streamReportEvents",
                None,
                c.ReportEvent,
                ("reports:read",),
            ),
            Operation(
                "post",
                f"{reports}/{{report_id}}/cancel",
                "cancelReport",
                None,
                c.ReportView,
                ("reports:read",),
                202,
            ),
            Operation(
                "get",
                f"{reports}/{{report_id}}/download",
                "downloadReport",
                None,
                c.ReportResult,
                ("reports:read", "reports:export"),
            ),
        ]
    )
    return result


def _parameter(name: str, *, location: str = "query", required: bool = False) -> dict[str, Any]:
    schema: dict[str, Any] = {"type": "string", "maxLength": 128}
    if name == "snapshot_index":
        schema = {"type": "integer", "minimum": 0}
    elif name in {"after_sequence", "watermark"}:
        schema = {"type": "integer", "minimum": 0}
    elif name == "limit":
        schema = {"type": "integer", "minimum": 1, "maximum": 200, "default": 50}
    elif name == "cursor":
        schema = {"type": "string", "maxLength": 2048}
    elif name in {"from", "to"}:
        schema = {"type": "string", "format": "date-time"}
    elif name in {
        "user_id",
        "role_id",
        "employee_id",
        "grant_id",
        "access_log_id",
        "report_id",
        "actor_id",
    }:
        schema["format"] = "uuid"
    elif name == "is_active":
        schema = {"type": "boolean"}
    elif name == "direction":
        schema = {"type": "string", "enum": ["ENTRY", "EXIT"]}
    elif name == "access_mode":
        schema = {"type": "string", "enum": ["pedestrian", "motorcycle", "car", "truck"]}
    elif name == "timezone":
        schema = {"type": "string", "enum": ["Asia/Bangkok", "UTC"], "default": "Asia/Bangkok"}
    elif name == "granularity":
        schema = {"type": "string", "enum": ["hour", "day"], "default": "day"}
    elif name in {"Origin", "Idempotency-Key", "Last-Event-ID"}:
        schema["maxLength"] = 2048
    return {"name": name, "in": location, "required": required, "schema": schema}


def build_contract() -> dict[str, Any]:
    ops = operations()
    models = {model for op in ops for model in (op.request, op.response) if model is not None}
    models.update({c.ErrorEnvelope, c.ReportEvent, c.AlertDelta})
    refs, definitions = models_json_schema(
        [(model, "validation") for model in sorted(models, key=lambda m: m.__name__)],
        ref_template="#/components/schemas/{model}",
    )
    document: dict[str, Any] = {
        "openapi": "3.1.0",
        "info": {
            "title": "EV Smart Gate - hợp đồng migration mục tiêu",
            "version": "1.0.0-draft",
            "description": "M0 review candidate. API trong tài liệu CHƯA được triển khai; không dùng thay runtime OpenAPI.",
        },
        "x-contract-status": "review-required",
        "x-runtime-openapi": "../openapi.json",
        "x-runtime-inventory": "runtime-inventory.json",
        "x-websockets": [
            {
                "path": "/ws/v2/security/alerts",
                "ticket_endpoint": "/api/v2/auth/ws-tickets",
                "authentication": "short-lived single-use ticket; redact URL/access logs",
                "close_codes": {"4401": "expired/revoked", "4403": "permission denied"},
                "resync": "/api/v2/security/alerts",
                "event_schema": "#/components/schemas/AlertDelta",
                "gap_policy": "410 ALERT_HISTORY_GAP; bootstrap có coverage/retained_from, không suy từ array v1",
                "max_frame_bytes": 65536,
                "max_buffer_events": 1000,
                "close_codes": {
                    "4401": "expired/revoked",
                    "4403": "permission denied",
                    "4409": "resync required/overflow",
                },
            }
        ],
        "paths": {},
        "components": {
            "schemas": definitions["$defs"],
            "securitySchemes": {
                "OperatorJWT": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
                "RefreshCookie": {"type": "apiKey", "in": "cookie", "name": "evsg_refresh"},
                "AuthCsrf": {"type": "apiKey", "in": "header", "name": "X-CSRF-Token"},
                "DeviceKey": {"type": "apiKey", "in": "header", "name": "X-Device-Key"},
            },
        },
    }
    for op in ops:
        payload: dict[str, Any] = {
            "operationId": op.name,
            "summary": op.name,
            "x-implementation-status": "planned",
            "x-required-permissions-all": list(op.permissions),
            "x-additional-policy": "migration-v1.md: quyền target/owner/domain/device/state luôn áp dụng",
            "parameters": [
                _parameter(name, location="path", required=True)
                for name in re.findall(r"{([^}]+)}", op.path)
            ],
            "security": [{"OperatorJWT": []}],
            "responses": {},
        }
        if op.access == "public":
            payload["security"] = []
        elif op.access == "refresh":
            payload["security"] = [{"RefreshCookie": [], "AuthCsrf": []}]
        elif op.access == "logout":
            payload["security"] = [{"RefreshCookie": [], "AuthCsrf": []}, {"OperatorJWT": []}]
        elif op.access == "device":
            payload["security"] = [{"DeviceKey": []}]
            payload["x-device-scopes-any"] = ["capture:ingest"]
        elif op.access == "operator_or_device":
            payload["security"] = [{"OperatorJWT": []}, {"DeviceKey": []}]
            payload["x-device-policy"] = (
                "gate/access-point binding, mode/direction và event ownership"
            )
            if op.name.startswith("verifyVehicle"):
                payload["x-device-scopes-any"] = [
                    "gate:entry" if "entry" in op.path else "gate:exit"
                ]
            elif op.name.startswith("verifyPedestrian"):
                payload["x-device-scopes-any"] = [
                    "pedestrian:entry" if "entry" in op.path else "pedestrian:exit"
                ]
            else:
                payload["x-device-scopes-any"] = [
                    "gate:entry",
                    "gate:exit",
                    "pedestrian:entry",
                    "pedestrian:exit",
                ]
        if op.path.startswith("/api/v2/auth") and op.method == "post":
            payload["parameters"].append(_parameter("Origin", location="header", required=True))
        response_content = {"application/json": {"schema": refs[op.response, "validation"]}}
        if op.name == "readPersonEvidence":
            response_content = {"image/jpeg": {"schema": {"type": "string", "format": "binary"}}}
        elif op.name == "streamReportEvents":
            response_content = {"text/event-stream": {"schema": {"type": "string"}}}
            payload["x-event-schema"] = refs[c.ReportEvent, "validation"]
            payload["parameters"].append(_parameter("Last-Event-ID", location="header"))
        payload["responses"][str(op.status)] = {
            "description": "Kết quả theo trạng thái server, không khẳng định actual crossing",
            "content": response_content,
            "headers": {
                "X-Request-ID": {
                    "schema": {"type": "string"},
                    "description": "Correlation ID đã redact",
                },
                "Cache-Control": {"schema": {"type": "string", "const": "no-store"}},
            },
        }
        for code in (400, 401, 403, 404, 409, 410, 413, 422, 429, 500, 503):
            payload["responses"][str(code)] = {
                "description": "ErrorEnvelope; policy và ví dụ trong migration-v1.md",
                "content": {"application/json": {"schema": refs[c.ErrorEnvelope, "validation"]}},
            }
        if op.request is not None:
            content: dict[str, Any] = {
                "application/json": {"schema": refs[op.request, "validation"]}
            }
            if op.name == "ingestCaptureBundle":
                content = {
                    "multipart/form-data": {
                        "schema": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["metadata", "face_image"],
                            "properties": {
                                "metadata": refs[c.CaptureMetadata, "validation"],
                                "face_image": {"type": "string", "format": "binary"},
                                "plate_image": {"type": "string", "format": "binary"},
                            },
                        },
                        "encoding": {"metadata": {"contentType": "application/json"}},
                    }
                }
            payload["requestBody"] = {"required": True, "content": content}
        if op.response.__name__.startswith("CursorPage"):
            payload["parameters"].extend([_parameter("cursor"), _parameter("limit")])
        if op.name == "resyncAlertsV2":
            payload["parameters"].extend(
                _parameter(name) for name in ("after_sequence", "watermark", "epoch", "limit")
            )
        if op.name == "listReports":
            payload["parameters"].append(
                {
                    "name": "status",
                    "in": "query",
                    "required": False,
                    "schema": c.ReportView.model_json_schema()["properties"]["status"],
                }
            )
        if op.name == "listPedestrianGrants":
            # Cùng tên status nhưng enum độc lập vòng đời report.
            payload["parameters"].append(
                {
                    "name": "status",
                    "in": "query",
                    "required": False,
                    "schema": {"type": "string", "enum": ["ACTIVE", "REVOKED"]},
                }
            )
        if op.name in {"readDashboard", "listPersonLogs", "listAuditLogs"}:
            payload["parameters"].extend([_parameter("from"), _parameter("to")])
        if op.name == "readDashboard":
            payload["parameters"].extend(
                _parameter(name)
                for name in (
                    "timezone",
                    "access_point_id",
                    "access_mode",
                    "direction",
                    "granularity",
                )
            )
        if op.name == "listUsers":
            payload["parameters"].extend(
                _parameter(name) for name in ("search", "role_id", "is_active")
            )
        if op.name == "listEmployees":
            payload["parameters"].extend(_parameter(name) for name in ("search", "is_active"))
        if op.name == "listPedestrianGrants":
            payload["parameters"].extend(
                _parameter(name) for name in ("employee_id", "access_point_id", "direction")
            )
        if op.name == "listPersonLogs":
            payload["parameters"].extend(
                _parameter(name) for name in ("employee_id", "access_point_id", "direction")
            )
        if op.name == "listAuditLogs":
            payload["parameters"].extend(
                _parameter(name)
                for name in ("actor_id", "action", "target_type", "target_id", "outcome")
            )
        if op.name in {"createReport", "createEmployee", "ingestCaptureBundle"}:
            payload["parameters"].append(
                _parameter("Idempotency-Key", location="header", required=True)
            )
        document["paths"].setdefault(op.path, {})[op.method] = payload
    return document


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Xuất contract mục tiêu, không tạo runtime routes")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    document = build_contract()
    if args.check:
        if not TARGET.is_file() or json.loads(TARGET.read_text("utf-8")) != document:
            parser.exit(1, "Migration contract drift; xuất lại và review.\n")
        print("Migration contract khớp DTO/operation manifest")
        return
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Đã xuất {len(operations())} HTTP operations mục tiêu, chưa triển khai")


if __name__ == "__main__":
    main()
