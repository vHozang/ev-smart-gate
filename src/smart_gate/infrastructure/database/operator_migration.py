from __future__ import annotations

from dataclasses import asdict
from datetime import datetime

from smart_gate.domain.exceptions import InfrastructureError
from smart_gate.domain.operator_identity import OperatorRole
from smart_gate.domain.permission_catalog import (
    APPROVED_NEW_PERMISSIONS,
    BASELINE_ROLE_PERMISSIONS,
    CATALOG_VERSION,
    system_role_id,
)
from smart_gate.infrastructure.database.operator_store import (
    MongoIdentityWork,
    MongoOperatorUsers,
    OperatorCollections,
    _session,
)


async def migrate_operator_identities(
    collections: OperatorCollections,
    work: MongoIdentityWork,
    now: datetime,
    *,
    seed_approved_permissions: bool = False,
) -> dict:
    """Migration additive/idempotent; quyền baseline và seed đã duyệt có marker riêng.

    Không khôi phục quyền/password/status đã quản trị thay đổi; không tự tạo ADMIN mới.
    Phải gọi sau indexes và bootstrap ban đầu, trước khi bật readers/routes JWT.
    Rollback giữ schema mới và revocation state, chỉ tắt feature/deployment.
    """

    async def operation():
        users = collections.collection("users")
        roles = collections.collection("operator_roles")
        markers = collections.collection("operator_identity_migrations")
        await MongoOperatorUsers(collections).lock_admin_invariant()
        marker = await markers.find_one({"_id": "operator-rbac-v1:baseline"}, session=_session())
        migrated = 0
        # Preflight toàn bộ trước mutation; collision không được tự merge hai tài khoản.
        seen = set()
        documents = await users.find({}, session=_session()).to_list(None)
        for document in documents:
            name = document.get("username")
            if not isinstance(name, str) or not name.strip() or "created_at" not in document:
                raise InfrastructureError(
                    "MIGRATION_REVIEW_REQUIRED", "User legacy thiếu dữ liệu cần đối chiếu"
                )
            normalized = name.strip().lower()
            if normalized in seen:
                raise InfrastructureError(
                    "MIGRATION_USERNAME_COLLISION",
                    "Có username trùng sau chuẩn hóa; cần xử lý trước migration",
                )
            seen.add(normalized)
            if (
                document.get("role_id") is None
                and document.get("role") not in BASELINE_ROLE_PERMISSIONS
            ):
                raise InfrastructureError(
                    "MIGRATION_ROLE_UNKNOWN", "Có enum role legacy chưa được ánh xạ"
                )
        for code, permissions in BASELINE_ROLE_PERMISSIONS.items():
            role = OperatorRole(system_role_id(code), code, code, permissions, is_system=True, created_at=now)
            data = asdict(role)
            data["_id"] = data.pop("id")
            data["permissions"] = sorted(permissions)
            existing = await roles.find_one({"code": code}, session=_session())
            if existing and (existing["_id"] != role.id or not existing.get("is_system")):
                raise InfrastructureError(
                    "MIGRATION_ROLE_COLLISION", "System role bị xung đột ID/code"
                )
            # Khi migration đã chạy, role bị xóa không được startup tạo lại âm thầm.
            if existing is None and marker is not None:
                raise InfrastructureError(
                    "MIGRATION_REVIEW_REQUIRED", "System role đã mất sau migration"
                )
            await roles.update_one(
                {"_id": role.id}, {"$setOnInsert": data}, upsert=True, session=_session()
            )
        for document in documents:
            if document.get("role_id") is not None:
                continue
            code = document["role"]
            normalized = document["username"].strip().lower()
            await users.update_one(
                {"_id": document["_id"], "role_id": None},
                {
                    "$set": {
                        "role_id": system_role_id(code),
                        "username": normalized,
                        "normalized_username": normalized,
                        "legacy_compatible": True,
                        "version": 1,
                        "authz_version": 1,
                        "session_version": 1,
                        "must_change_password": document.get("must_change_password", False),
                        "display_name": None,
                    }
                },
                session=_session(),
            )
            migrated += 1
        if marker is None:
            await markers.insert_one(
                {
                    "_id": "operator-rbac-v1:baseline",
                    "applied_at": now,
                    "catalog_version": CATALOG_VERSION,
                },
                session=_session(),
            )
        seed_marker = await markers.find_one(
            {"_id": "operator-rbac-v1:approved-permissions"}, session=_session()
        )
        seeded = False
        if seed_approved_permissions and seed_marker is None:
            for code, permissions in BASELINE_ROLE_PERMISSIONS.items():
                existing = await roles.find_one({"_id": system_role_id(code)}, session=_session())
                if existing["version"] != 1 or set(existing["permissions"]) != set(permissions):
                    raise InfrastructureError(
                        "MIGRATION_SEED_REVIEW_REQUIRED",
                        "Role đã thay đổi trước seed; không ghi đè quản trị",
                    )
                await roles.update_one(
                    {"_id": system_role_id(code), "version": 1},
                    {
                        "$set": {
                            "permissions": sorted(permissions | APPROVED_NEW_PERMISSIONS[code])
                        },
                        "$inc": {"version": 1},
                    },
                    session=_session(),
                )
                await MongoOperatorUsers(collections).bump_role_members(system_role_id(code))
            await markers.insert_one(
                {
                    "_id": "operator-rbac-v1:approved-permissions",
                    "applied_at": now,
                    "catalog_version": CATALOG_VERSION,
                },
                session=_session(),
            )
            seeded = True
        return {
            "catalog_version": CATALOG_VERSION,
            "migrated_users": migrated,
            "seed_applied": seeded,
            "baseline_permissions": {k: sorted(v) for k, v in BASELINE_ROLE_PERMISSIONS.items()},
            "approved_additions": {k: sorted(v) for k, v in APPROVED_NEW_PERMISSIONS.items()}
            if seed_approved_permissions
            else {},
        }

    return await work.run(operation)
