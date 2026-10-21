from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from scripts.export_api_inventory import build_inventory
from scripts.export_migration_contracts import operations

TARGET = Path("docs/contracts/permission-seed.json")


def baseline_permission(method: str, path: str) -> str | None:
    """Ánh xạ từng thao tác hiện hữu; không tự suy role thành wildcard."""
    if path.startswith(("/health/", "/api/v1/auth/")):
        return None
    read = method == "GET"
    if "/driver-vehicle-authorizations" in path:
        action = "read" if read else "create" if method == "POST" else "revoke"
        return f"driver-vehicle-authorizations:{action}"
    if "/employee-cards" in path:
        action = (
            "read"
            if read
            else "issue"
            if path.endswith("employee-cards")
            else path.rsplit("/", 1)[1]
        )
        return f"employee-cards:{action}"
    if "/drivers" in path or "/vehicles" in path:
        resource = "drivers" if "/drivers" in path else "vehicles"
        return (
            f"{resource}:"
            + {"GET": "read", "POST": "create", "PATCH": "update", "DELETE": "deactivate"}[method]
        )
    if "/gate-logs" in path:
        return "gate-evidence:read" if "/snapshots/" in path else "gate-logs:read"
    if "/gates/" in path:
        return "gates:verify-entry" if "/entry/" in path else "gates:verify-exit"
    if "/security/alerts" in path:
        return "alerts:read" if read else "alerts:update"
    if "/exit-slip" in path:
        return (
            "exit-slips:read"
            if read
            else "exit-slips:reissue"
            if path.endswith("/reissue")
            else "exit-slips:issue"
        )
    if "/dock-sessions" in path:
        action = (
            "read"
            if read
            else "finalize"
            if path.endswith("/finalize")
            else "capture"
            if path.endswith("/captures")
            else "start"
        )
        return f"dock:{action}"
    if "/warehouse/orders" in path:
        return (
            "orders:"
            + {"GET": "read", "POST": "create", "PATCH": "update", "DELETE": "cancel"}[method]
        )
    raise ValueError(f"Chưa ánh xạ permission cho {method} {path}")


def build_seed() -> dict[str, Any]:
    inventory = build_inventory()
    baseline: dict[str, set[str]] = {role: set() for role in ("ADMIN", "WAREHOUSE", "SECURITY")}
    bindings = []
    for item in inventory["operations"]:
        permission = baseline_permission(item["method"], item["path"])
        if permission is None:
            continue
        bindings.append({"method": item["method"], "path": item["path"], "permission": permission})
        for role in item["authorization"]["operator_roles"]:
            baseline[role].add(permission)
    legacy = set().union(*baseline.values())
    planned = {code for op in operations() for code in op.permissions}
    protected = {"users:assign-admin", "users:manage-admin"}
    analytics = {
        f"analytics:read-{domain}" for domain in ("gates", "people", "warehouse", "alerts")
    }
    all_codes = legacy | planned | protected | analytics
    dependencies = {
        "dock:finalize": ["dock:read"],
        "roles:assign-permissions": ["roles:read", "permissions:read"],
        "users:assign-role": ["roles:read"],
        "users:assign-admin": ["users:assign-role"],
        "reports:generate": ["assistant:use", "reports:read"],
        "reports:export": ["reports:read"],
        "analytics:read-gates": ["gate-logs:read"],
        "analytics:read-people": ["person-access-logs:read"],
        "analytics:read-alerts": ["alerts:read"],
        "analytics:read-warehouse": ["orders:read", "dock:read"],
    }
    common_new = {
        "dashboard:read",
        "analytics:read-gates",
        "assistant:use",
        "reports:generate",
        "reports:read",
        "reports:export",
    }
    proposed_new = {
        "ADMIN": all_codes - legacy,
        "WAREHOUSE": common_new,
        "SECURITY": common_new
        | {
            "employees:read",
            "access-points:read",
            "person-access-logs:read",
            "person-evidence:read",
            "access:verify-pedestrian-entry",
            "access:verify-pedestrian-exit",
            "analytics:read-people",
            "analytics:read-alerts",
        },
    }
    # WAREHOUSE đã có quyền đọc kho; aggregate mới vẫn cần explicit seed review.
    proposed_new["WAREHOUSE"].add("analytics:read-warehouse")
    return {
        "schema_version": "1.0.0",
        "status": "review-required-not-applied",
        "legacy_permissions": sorted(legacy),
        "catalog": [
            {
                "code": code,
                "group": code.split(":", 1)[0],
                "description": f"Quyền {code}; kiểm thêm target/domain/state policy tại application",
                "dependencies": dependencies.get(code, []),
                "protected": code in protected,
            }
            for code in sorted(all_codes)
        ],
        "baseline_roles": {role: sorted(codes) for role, codes in baseline.items()},
        "new_permission_grants_requiring_review": {
            role: sorted(codes) for role, codes in proposed_new.items()
        },
        "target_roles_after_review": {
            role: sorted(baseline[role] | proposed_new[role]) for role in baseline
        },
        "current_operation_bindings": bindings,
        "device_scopes_separate_from_operator_permissions": [
            "gate:entry",
            "gate:exit",
            "dock:capture",
            "capture:ingest",
            "pedestrian:entry",
            "pedestrian:exit",
        ],
        "invariants": [
            "Một active role/user; system role code/ID ổn định; không wildcard/direct grants/hierarchy.",
            "Protected ADMIN assignment/target management/last-admin và grantable policy luôn áp dụng.",
            "Report owner-only không bị thay bằng ADMIN read-all dù ADMIN có reports:read.",
            "Baseline quyền cũ không đổi; quyền mới chỉ seed sau G2 review.",
        ],
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Xuất seed RBAC đề nghị và baseline có nguồn")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    seed = build_seed()
    if args.check:
        if not TARGET.is_file() or json.loads(TARGET.read_text("utf-8")) != seed:
            parser.exit(1, "Permission seed drift; cần review mapping/seed trước migration.\n")
        print("Permission seed khớp baseline và manifest mục tiêu")
        return
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Đã xuất {len(seed['catalog'])} permission codes đề nghị, chưa áp dụng")


if __name__ == "__main__":
    main()
