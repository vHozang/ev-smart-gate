from __future__ import annotations

from types import MappingProxyType
from uuid import NAMESPACE_URL, UUID, uuid5

# Catalog đã duyệt MG0; quyền baseline và quyền mới giữ hai tập độc lập.
CATALOG_VERSION = "1.0.0"
PERMISSION_DEPENDENCIES = MappingProxyType(
    {
        "access-points:read": (),
        "access:verify-pedestrian-entry": (),
        "access:verify-pedestrian-exit": (),
        "alerts:read": (),
        "alerts:update": (),
        "analytics:read-alerts": ("alerts:read",),
        "analytics:read-gates": ("gate-logs:read",),
        "analytics:read-people": ("person-access-logs:read",),
        "analytics:read-warehouse": ("orders:read", "dock:read"),
        "assistant:use": (),
        "audit-logs:read": (),
        "dashboard:read": (),
        "dock:capture": (),
        "dock:finalize": ("dock:read",),
        "dock:read": (),
        "dock:start": (),
        "driver-vehicle-authorizations:create": (),
        "driver-vehicle-authorizations:read": (),
        "driver-vehicle-authorizations:revoke": (),
        "drivers:create": (),
        "drivers:deactivate": (),
        "drivers:read": (),
        "drivers:update": (),
        "employee-cards:block": (),
        "employee-cards:issue": (),
        "employee-cards:read": (),
        "employee-cards:replace": (),
        "employee-cards:report-lost": (),
        "employees:create": (),
        "employees:read": (),
        "employees:update": (),
        "exit-slips:issue": (),
        "exit-slips:read": (),
        "exit-slips:reissue": (),
        "gate-evidence:read": (),
        "gate-logs:read": (),
        "gates:verify-entry": (),
        "gates:verify-exit": (),
        "orders:cancel": (),
        "orders:create": (),
        "orders:read": (),
        "orders:update": (),
        "pedestrian-grants:create": (),
        "pedestrian-grants:read": (),
        "pedestrian-grants:revoke": (),
        "permissions:read": (),
        "person-access-logs:read": (),
        "person-evidence:read": (),
        "reports:export": ("reports:read",),
        "reports:generate": ("assistant:use", "reports:read"),
        "reports:read": (),
        "roles:assign-permissions": ("roles:read", "permissions:read"),
        "roles:create": (),
        "roles:delete": (),
        "roles:read": (),
        "roles:update": (),
        "users:assign-admin": ("users:assign-role",),
        "users:assign-role": ("roles:read",),
        "users:create": (),
        "users:manage-admin": (),
        "users:read": (),
        "users:read-sessions": (),
        "users:reset-password": (),
        "users:revoke-sessions": (),
        "users:set-status": (),
        "users:update": (),
        "vehicles:create": (),
        "vehicles:deactivate": (),
        "vehicles:read": (),
        "vehicles:update": (),
    }
)
PROTECTED_PERMISSIONS = frozenset(("users:assign-admin", "users:manage-admin"))
BASELINE_ROLE_PERMISSIONS = MappingProxyType(
    {
        "ADMIN": frozenset(
            {
                "alerts:read",
                "alerts:update",
                "dock:capture",
                "dock:finalize",
                "dock:read",
                "dock:start",
                "driver-vehicle-authorizations:create",
                "driver-vehicle-authorizations:read",
                "driver-vehicle-authorizations:revoke",
                "drivers:create",
                "drivers:deactivate",
                "drivers:read",
                "drivers:update",
                "employee-cards:block",
                "employee-cards:issue",
                "employee-cards:read",
                "employee-cards:replace",
                "employee-cards:report-lost",
                "exit-slips:issue",
                "exit-slips:read",
                "exit-slips:reissue",
                "gate-evidence:read",
                "gate-logs:read",
                "gates:verify-entry",
                "gates:verify-exit",
                "orders:cancel",
                "orders:create",
                "orders:read",
                "orders:update",
                "vehicles:create",
                "vehicles:deactivate",
                "vehicles:read",
                "vehicles:update",
            }
        ),
        "SECURITY": frozenset(
            {
                "alerts:read",
                "alerts:update",
                "dock:read",
                "driver-vehicle-authorizations:read",
                "drivers:read",
                "exit-slips:read",
                "gate-evidence:read",
                "gate-logs:read",
                "gates:verify-entry",
                "gates:verify-exit",
                "orders:read",
                "vehicles:read",
            }
        ),
        "WAREHOUSE": frozenset(
            {
                "dock:capture",
                "dock:finalize",
                "dock:read",
                "dock:start",
                "driver-vehicle-authorizations:read",
                "drivers:read",
                "exit-slips:issue",
                "exit-slips:read",
                "exit-slips:reissue",
                "gate-evidence:read",
                "gate-logs:read",
                "orders:cancel",
                "orders:create",
                "orders:read",
                "orders:update",
                "vehicles:read",
            }
        ),
    }
)
APPROVED_NEW_PERMISSIONS = MappingProxyType(
    {
        "ADMIN": frozenset(
            {
                "access-points:read",
                "access:verify-pedestrian-entry",
                "access:verify-pedestrian-exit",
                "analytics:read-alerts",
                "analytics:read-gates",
                "analytics:read-people",
                "analytics:read-warehouse",
                "assistant:use",
                "audit-logs:read",
                "dashboard:read",
                "employees:create",
                "employees:read",
                "employees:update",
                "pedestrian-grants:create",
                "pedestrian-grants:read",
                "pedestrian-grants:revoke",
                "permissions:read",
                "person-access-logs:read",
                "person-evidence:read",
                "reports:export",
                "reports:generate",
                "reports:read",
                "roles:assign-permissions",
                "roles:create",
                "roles:delete",
                "roles:read",
                "roles:update",
                "users:assign-admin",
                "users:assign-role",
                "users:create",
                "users:manage-admin",
                "users:read",
                "users:read-sessions",
                "users:reset-password",
                "users:revoke-sessions",
                "users:set-status",
                "users:update",
            }
        ),
        "SECURITY": frozenset(
            {
                "access-points:read",
                "access:verify-pedestrian-entry",
                "access:verify-pedestrian-exit",
                "analytics:read-alerts",
                "analytics:read-gates",
                "analytics:read-people",
                "assistant:use",
                "dashboard:read",
                "employees:read",
                "person-access-logs:read",
                "person-evidence:read",
                "reports:export",
                "reports:generate",
                "reports:read",
            }
        ),
        "WAREHOUSE": frozenset(
            {
                "analytics:read-gates",
                "analytics:read-warehouse",
                "assistant:use",
                "dashboard:read",
                "reports:export",
                "reports:generate",
                "reports:read",
            }
        ),
    }
)
HTTP_PERMISSIONS = MappingProxyType(
    {
        (
            "DELETE",
            "/api/v1/driver-vehicle-authorizations/{driver_id}/{vehicle_id}",
        ): "driver-vehicle-authorizations:revoke",
        ("DELETE", "/api/v1/drivers/{driver_id}"): "drivers:deactivate",
        ("DELETE", "/api/v1/vehicles/{vehicle_id}"): "vehicles:deactivate",
        ("DELETE", "/api/v1/warehouse/orders/{order_id}"): "orders:cancel",
        ("GET", "/api/v1/driver-vehicle-authorizations"): "driver-vehicle-authorizations:read",
        ("GET", "/api/v1/drivers"): "drivers:read",
        ("GET", "/api/v1/drivers/{driver_id}"): "drivers:read",
        ("GET", "/api/v1/employee-cards"): "employee-cards:read",
        ("GET", "/api/v1/employee-cards/{card_id}"): "employee-cards:read",
        ("GET", "/api/v1/gate-logs"): "gate-logs:read",
        ("GET", "/api/v1/gate-logs/{gate_log_id}/snapshots/{snapshot_index}"): "gate-evidence:read",
        ("GET", "/api/v1/security/alerts"): "alerts:read",
        ("GET", "/api/v1/vehicles"): "vehicles:read",
        ("GET", "/api/v1/vehicles/{vehicle_id}"): "vehicles:read",
        ("GET", "/api/v1/warehouse/dock-sessions"): "dock:read",
        ("GET", "/api/v1/warehouse/dock-sessions/{inspection_id}"): "dock:read",
        (
            "GET",
            "/api/v1/warehouse/dock-sessions/{inspection_id}/captures/{capture_index}/image",
        ): "dock:read",
        ("GET", "/api/v1/warehouse/orders"): "orders:read",
        ("GET", "/api/v1/warehouse/orders/{order_id}"): "orders:read",
        ("GET", "/api/v1/warehouse/orders/{order_id}/exit-slip/{artifact_type}"): "exit-slips:read",
        ("PATCH", "/api/v1/drivers/{driver_id}"): "drivers:update",
        ("PATCH", "/api/v1/security/alerts/{alert_id}"): "alerts:update",
        ("PATCH", "/api/v1/vehicles/{vehicle_id}"): "vehicles:update",
        ("PATCH", "/api/v1/warehouse/orders/{order_id}"): "orders:update",
        ("POST", "/api/v1/driver-vehicle-authorizations"): "driver-vehicle-authorizations:create",
        ("POST", "/api/v1/drivers"): "drivers:create",
        ("POST", "/api/v1/employee-cards"): "employee-cards:issue",
        ("POST", "/api/v1/employee-cards/{card_id}/block"): "employee-cards:block",
        ("POST", "/api/v1/employee-cards/{card_id}/replace"): "employee-cards:replace",
        ("POST", "/api/v1/employee-cards/{card_id}/report-lost"): "employee-cards:report-lost",
        ("POST", "/api/v1/gates/entry/verifications"): "gates:verify-entry",
        ("POST", "/api/v1/gates/exit/verifications"): "gates:verify-exit",
        ("POST", "/api/v1/vehicles"): "vehicles:create",
        ("POST", "/api/v1/warehouse/dock-sessions/{inspection_id}/captures"): "dock:capture",
        ("POST", "/api/v1/warehouse/dock-sessions/{inspection_id}/finalize"): "dock:finalize",
        ("POST", "/api/v1/warehouse/orders"): "orders:create",
        ("POST", "/api/v1/warehouse/orders/{order_id}/dock-sessions"): "dock:start",
        ("POST", "/api/v1/warehouse/orders/{order_id}/exit-slip"): "exit-slips:issue",
        ("POST", "/api/v1/warehouse/orders/{order_id}/exit-slip/reissue"): "exit-slips:reissue",
    }
)

DEVICE_SCOPES = frozenset(
    {
        "gate:entry",
        "gate:exit",
        "dock:capture",
        "capture:ingest",
        "pedestrian:entry",
        "pedestrian:exit",
    }
)
WS_PERMISSIONS = MappingProxyType({"security.alerts": "alerts:read"})
ADMIN_CORE_PERMISSIONS = frozenset(
    code
    for code in PERMISSION_DEPENDENCIES
    if code.split(":")[0] in {"users", "roles", "permissions", "audit-logs"}
)


def system_role_id(code: str) -> UUID:
    """ID bất biến giữa các lần migration và deployment."""
    if code not in BASELINE_ROLE_PERMISSIONS:
        raise ValueError("System role không tồn tại")
    return uuid5(NAMESPACE_URL, f"ev-smart-gate/system-role/{code}")
