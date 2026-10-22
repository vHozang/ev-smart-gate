from __future__ import annotations

import asyncio
import re
from collections.abc import Awaitable, Callable
from dataclasses import asdict
from datetime import datetime, timedelta
from typing import Any, TypeVar
from uuid import UUID

from pymongo import ASCENDING, ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern

from smart_gate.domain.exceptions import (
    AuthenticationError,
    ConflictError,
    InfrastructureError,
    SmartGateError,
)
from smart_gate.domain.identity_queries import AuditFilters, PageBoundary, UserFilters
from smart_gate.domain.operator_identity import (
    OperatorRole,
    OperatorUser,
    RefreshRecord,
    RevocationEvent,
    SecurityAudit,
    TokenFamily,
    WsTicket,
)
from smart_gate.infrastructure.database.client import MongoDatabase
from smart_gate.infrastructure.database.unit_of_work import _active_session, current_session

T = TypeVar("T")


def _session():
    session = current_session()
    if session is None:
        raise InfrastructureError("AUTH_TRANSACTION_REQUIRED", "Mutation auth cần transaction")
    return session


def _data(entity, key="id") -> dict[str, Any]:
    result = asdict(entity)
    result["_id"] = result.pop(key)
    if "permissions" in result:
        result["permissions"] = sorted(result["permissions"])
    return result


def _family(document) -> TokenFamily | None:
    if document is None:
        return None
    return TokenFamily(
        id=document["_id"],
        **{name: document[name] for name in TokenFamily.__dataclass_fields__ if name != "id"},
    )


def _paging(
    query: dict[str, Any], before: PageBoundary | None, field: str = "created_at"
) -> dict[str, Any]:
    if before is not None:
        query["$or"] = [
            {field: {"$lt": before.created_at}},
            {field: before.created_at, "_id": {"$lt": before.id}},
        ]
    return query


class MongoIdentityWork:
    """Snapshot transaction + majority commit; PyMongo retry transient/unknown commit.

    Mỗi retry nhận snapshot mới; callback không phát credentials hoặc side effects ngoài DB.
    Timeout hữu hạn và lỗi storage luôn fail-closed, không fallback memory/cache.
    """

    def __init__(self, database: MongoDatabase, timeout_seconds: float = 30) -> None:
        self.database, self.timeout_seconds = database, timeout_seconds

    async def run(self, operation: Callable[[], Awaitable[T]]) -> T:
        if current_session() is not None:
            return await operation()
        if self.database.client is None:
            raise InfrastructureError("AUTH_STORAGE_UNAVAILABLE", "Auth storage chưa sẵn sàng")

        async def callback(session):
            token = _active_session.set(session)
            try:
                return await operation()
            finally:
                _active_session.reset(token)

        try:
            async with asyncio.timeout(self.timeout_seconds):
                async with self.database.client.start_session() as session:
                    return await session.with_transaction(
                        callback,
                        read_concern=ReadConcern("snapshot"),
                        write_concern=WriteConcern("majority"),
                        max_commit_time_ms=10000,
                    )
        except (PyMongoError, TimeoutError) as error:
            raise InfrastructureError(
                "AUTH_STORAGE_UNAVAILABLE", "Không xác minh được auth storage"
            ) from error


class OperatorCollections:
    def __init__(self, database: MongoDatabase) -> None:
        self.database = database

    def collection(self, name):
        if self.database.client is None:
            raise InfrastructureError("AUTH_STORAGE_UNAVAILABLE", "Auth storage chưa sẵn sàng")
        return self.database.client[self.database.settings.mongodb_database][name]

    async def initialize(self) -> None:
        await self.collection("operator_roles").create_index("code", unique=True)
        await self.collection("users").create_index(
            "normalized_username",
            unique=True,
            partialFilterExpression={"normalized_username": {"$type": "string"}},
        )
        await self.collection("users").create_index(
            [("role_id", ASCENDING), ("is_active", ASCENDING)]
        )
        await self.collection("operator_sessions").create_index("expires_at", expireAfterSeconds=0)
        await self.collection("operator_sessions").create_index(
            [("user_id", ASCENDING), ("created_at", ASCENDING)]
        )
        await self.collection("operator_refresh_credentials").create_index(
            "expires_at", expireAfterSeconds=0
        )
        await self.collection("operator_refresh_credentials").create_index("family_id")
        await self.collection("operator_ws_tickets").create_index(
            "expires_at", expireAfterSeconds=0
        )
        await self.collection("operator_auth_audit").create_index(
            [("occurred_at", ASCENDING), ("_id", ASCENDING)]
        )
        await self.collection("operator_auth_outbox").create_index("sequence", unique=True)
        await self.collection("operator_auth_outbox").create_index(
            "expires_at", expireAfterSeconds=0
        )
        await self.collection("operator_auth_rate_limits").create_index(
            "expires_at", expireAfterSeconds=0
        )
        await self.collection("sequence_counters").update_one(
            {"_id": "operator-last-admin"}, {"$setOnInsert": {"value": 0}}, upsert=True
        )


class MongoOperatorUsers:
    def __init__(self, collections: OperatorCollections) -> None:
        self.collections = collections

    @property
    def collection(self):
        return self.collections.collection("users")

    @staticmethod
    def decode(document) -> OperatorUser | None:
        if document is None:
            return None
        required = {"role_id", "authz_version", "session_version", "version", "normalized_username"}
        if required - set(document) or not isinstance(document.get("role_id"), UUID):
            raise InfrastructureError(
                "ROLE_MIGRATION_REQUIRED", "User chưa được migrate sang operator roles"
            )
        return OperatorUser(
            id=document["_id"],
            username=document["normalized_username"],
            password_hash=document["password_hash"],
            role_id=document["role_id"],
            is_active=document["is_active"],
            created_at=document["created_at"],
            display_name=document.get("display_name"),
            must_change_password=document.get("must_change_password", False),
            version=document["version"],
            authz_version=document["authz_version"],
            session_version=document["session_version"],
        )

    async def get(self, user_id: UUID) -> OperatorUser | None:
        return self.decode(
            await self.collection.find_one({"_id": user_id}, session=current_session())
        )

    async def by_username(self, normalized_username: str) -> OperatorUser | None:
        return self.decode(
            await self.collection.find_one(
                {"normalized_username": normalized_username}, session=current_session()
            )
        )

    async def add(self, user: OperatorUser) -> OperatorUser:
        data = _data(user)
        data["normalized_username"] = user.username
        role = await self.collections.collection("operator_roles").find_one(
            {"_id": user.role_id}, session=_session()
        )
        if not role:
            raise ConflictError("ROLE_NOT_FOUND", "Role không tồn tại")
        compatible = role["is_system"] and role["code"] in {"ADMIN", "SECURITY", "WAREHOUSE"}
        data["role"] = role["code"] if compatible else "SECURITY"
        data["legacy_compatible"] = compatible
        try:
            await self.collection.insert_one(data, session=_session())
        except DuplicateKeyError as error:
            raise ConflictError("USERNAME_EXISTS", "Tên đăng nhập đã tồn tại") from error
        return user

    async def save(self, user: OperatorUser, expected_version: int) -> OperatorUser:
        data = _data(user)
        data.pop("_id")
        data["normalized_username"] = user.username
        role = await self.collections.collection("operator_roles").find_one(
            {"_id": user.role_id}, session=_session()
        )
        if not role:
            raise ConflictError("ROLE_NOT_FOUND", "Role không tồn tại")
        compatible = role["is_system"] and role["code"] in {"ADMIN", "SECURITY", "WAREHOUSE"}
        data["legacy_compatible"] = compatible
        if compatible:
            data["role"] = role["code"]
        try:
            result = await self.collection.update_one(
                {"_id": user.id, "version": expected_version}, {"$set": data}, session=_session()
            )
        except DuplicateKeyError as error:
            raise ConflictError("USERNAME_EXISTS", "Tên đăng nhập đã tồn tại") from error
        if result.matched_count != 1:
            raise ConflictError("USER_VERSION_CONFLICT", "User đã được cập nhật; cần tải lại")
        return user

    async def bump_role_members(self, role_id: UUID) -> list[UUID]:
        ids = [
            item["_id"]
            async for item in self.collection.find(
                {"role_id": role_id}, {"_id": 1}, session=_session()
            )
        ]
        await self.collection.update_many(
            {"role_id": role_id},
            {"$inc": {"version": 1, "authz_version": 1, "session_version": 1}},
            session=_session(),
        )
        await self.collections.collection("auth_sessions").delete_many(
            {"user_id": {"$in": ids}}, session=_session()
        )
        return ids

    async def list_users(
        self, filters: UserFilters, before: PageBoundary | None, limit: int
    ) -> list[OperatorUser]:
        query: dict[str, Any] = {"role_id": {"$type": "binData"}}
        if filters.search:
            query["normalized_username"] = {
                "$regex": "^" + re.escape(filters.search.strip().lower())
            }
        if filters.role_id is not None:
            query["role_id"] = filters.role_id
        if filters.is_active is not None:
            query["is_active"] = filters.is_active
        rows = (
            await self.collection.find(_paging(query, before), session=current_session())
            .sort([("created_at", -1), ("_id", -1)])
            .limit(limit)
            .to_list(limit)
        )
        return [user for row in rows if (user := self.decode(row)) is not None]

    async def count_role_members(self, role_ids: tuple[UUID, ...]) -> dict[UUID, int]:
        cursor = await self.collection.aggregate(
            [
                {"$match": {"role_id": {"$in": list(role_ids)}}},
                {"$group": {"_id": "$role_id", "count": {"$sum": 1}}},
            ],
            session=current_session(),
        )
        counts = {role_id: 0 for role_id in role_ids}
        async for item in cursor:
            counts[item["_id"]] = item["count"]
        return counts

    async def count_role(self, role_id: UUID, *, active_only: bool = False) -> int:
        query: dict[str, Any] = {"role_id": role_id}
        if active_only:
            query["is_active"] = True
        return await self.collection.count_documents(query, session=_session())

    async def lock_admin_invariant(self) -> None:
        result = await self.collections.collection("sequence_counters").update_one(
            {"_id": "operator-last-admin"}, {"$inc": {"value": 1}}, session=_session()
        )
        if result.matched_count != 1:
            raise InfrastructureError("AUTH_STORAGE_UNAVAILABLE", "Chưa khởi tạo last-admin fence")


class MongoOperatorRoles:
    def __init__(self, collections: OperatorCollections) -> None:
        self.collection = collections.collection("operator_roles")

    @staticmethod
    def decode(document) -> OperatorRole | None:
        if document is None:
            return None
        result = dict(document)
        result["id"] = result.pop("_id")
        result["permissions"] = frozenset(result["permissions"])
        return OperatorRole(**result)

    async def get_many(self, role_ids: tuple[UUID, ...]) -> dict[UUID, OperatorRole]:
        rows = await self.collection.find(
            {"_id": {"$in": list(role_ids)}}, session=current_session()
        ).to_list(len(role_ids) or 1)
        return {role.id: role for row in rows if (role := self.decode(row)) is not None}

    async def get(self, role_id: UUID) -> OperatorRole | None:
        return self.decode(
            await self.collection.find_one({"_id": role_id}, session=current_session())
        )

    async def by_code(self, code: str) -> OperatorRole | None:
        return self.decode(
            await self.collection.find_one({"code": code}, session=current_session())
        )

    async def add(self, role: OperatorRole) -> OperatorRole:
        try:
            await self.collection.insert_one(_data(role), session=_session())
        except DuplicateKeyError as error:
            raise ConflictError("ROLE_EXISTS", "Code role đã tồn tại") from error
        return role

    async def list_roles(self, before: PageBoundary | None, limit: int) -> list[OperatorRole]:
        rows = (
            await self.collection.find(_paging({}, before), session=current_session())
            .sort([("created_at", -1), ("_id", -1)])
            .limit(limit)
            .to_list(limit)
        )
        return [role for row in rows if (role := self.decode(row)) is not None]

    async def save(self, role: OperatorRole, expected_version: int) -> OperatorRole:
        data = _data(role)
        data.pop("_id")
        result = await self.collection.update_one(
            {"_id": role.id, "version": expected_version}, {"$set": data}, session=_session()
        )
        if result.matched_count != 1:
            raise ConflictError("ROLE_VERSION_CONFLICT", "Role đã được cập nhật; cần tải lại")
        return role


class MongoOperatorSessions:
    def __init__(self, collections: OperatorCollections) -> None:
        self.collections = collections
        self.families = collections.collection("operator_sessions")
        self.refreshes = collections.collection("operator_refresh_credentials")

    async def get_family(self, session_id: UUID) -> TokenFamily | None:
        return _family(await self.families.find_one({"_id": session_id}, session=current_session()))

    async def add_family(self, family: TokenFamily, refresh: RefreshRecord) -> None:
        await self.families.insert_one(_data(family), session=_session())
        await self.refreshes.insert_one(_data(refresh, "token_hash"), session=_session())

    async def get_refresh(self, token_hash: str) -> RefreshRecord | None:
        document = await self.refreshes.find_one({"_id": token_hash}, session=current_session())
        if not document:
            return None
        return RefreshRecord(
            token_hash=document["_id"], **{k: v for k, v in document.items() if k != "_id"}
        )

    async def rotate(
        self,
        family: TokenFamily,
        consumed: RefreshRecord,
        replacement: RefreshRecord,
        expected_version: int,
    ) -> None:
        data = _data(family)
        data.pop("_id")
        result = await self.families.update_one(
            {
                "_id": family.id,
                "version": expected_version,
                "current_refresh_hash": consumed.token_hash,
                "revoked_at": None,
                "expires_at": {"$gt": consumed.consumed_at},
                "idle_expires_at": {"$gt": consumed.consumed_at},
            },
            {"$set": data},
            session=_session(),
        )
        if result.matched_count != 1:
            raise ConflictError("REFRESH_IN_PROGRESS", "Refresh state đã thay đổi")
        result = await self.refreshes.update_one(
            {"_id": consumed.token_hash, "consumed_at": None},
            {"$set": {"consumed_at": consumed.consumed_at}},
            session=_session(),
        )
        if result.matched_count != 1:
            raise ConflictError("REFRESH_IN_PROGRESS", "Refresh credential đã được consume")
        await self.refreshes.insert_one(_data(replacement, "token_hash"), session=_session())

    async def revoke_family(self, session_id: UUID, now: datetime) -> None:
        await self.families.update_one(
            {"_id": session_id, "revoked_at": None},
            {"$set": {"revoked_at": now}, "$inc": {"version": 1}},
            session=_session(),
        )

    async def revoke_user(self, user_id: UUID, now: datetime) -> None:
        await self.families.update_many(
            {"user_id": user_id, "revoked_at": None},
            {"$set": {"revoked_at": now}, "$inc": {"version": 1}},
            session=_session(),
        )
        await self.collections.collection("auth_sessions").delete_many(
            {"user_id": user_id}, session=_session()
        )

    async def list_user(
        self, user_id: UUID, before: PageBoundary | None = None, limit: int = 201
    ) -> list[TokenFamily]:
        rows = (
            await self.families.find(
                _paging({"user_id": user_id}, before), session=current_session()
            )
            .sort([("created_at", -1), ("_id", -1)])
            .limit(limit)
            .to_list(limit)
        )
        return [family for row in rows if (family := _family(row)) is not None]


class MongoOperatorTickets:
    def __init__(self, collections: OperatorCollections) -> None:
        self.collection = collections.collection("operator_ws_tickets")

    async def add(self, ticket: WsTicket) -> None:
        await self.collection.insert_one(_data(ticket, "token_hash"), session=_session())

    async def get(self, token_hash: str) -> WsTicket | None:
        document = await self.collection.find_one({"_id": token_hash}, session=current_session())
        return (
            WsTicket(
                token_hash=document["_id"], **{k: v for k, v in document.items() if k != "_id"}
            )
            if document
            else None
        )

    async def consume(self, token_hash: str, now: datetime) -> None:
        result = await self.collection.update_one(
            {"_id": token_hash, "consumed_at": None, "expires_at": {"$gt": now}},
            {"$set": {"consumed_at": now}},
            session=_session(),
        )
        if result.matched_count != 1:
            raise AuthenticationError("WS_TICKET_INVALID", "Ticket hết hạn hoặc đã sử dụng")


class MongoOperatorAudit:
    def __init__(self, collections: OperatorCollections) -> None:
        self.collections = collections

    async def append(self, audit: SecurityAudit) -> None:
        audit.__post_init__()
        await self.collections.collection("operator_auth_audit").insert_one(
            _data(audit), session=_session()
        )

    async def list_events(
        self, filters: AuditFilters, before: PageBoundary | None, limit: int
    ) -> list[SecurityAudit]:
        query: dict[str, Any] = {
            key: value
            for key, value in {
                "actor_id": filters.actor_id,
                "action": filters.action,
                "target_id": filters.target_id,
                "outcome": filters.outcome,
            }.items()
            if value is not None
        }
        if filters.target_type is not None:
            query["target_type"] = {
                "$regex": f"^{re.escape(filters.target_type.strip())}$",
                "$options": "i",
            }
        time_filter: dict[str, datetime] = {}
        if filters.from_ is not None:
            time_filter["$gte"] = filters.from_
        if filters.to is not None:
            time_filter["$lt"] = filters.to
        if time_filter:
            query["occurred_at"] = time_filter
        rows = (
            await self.collections.collection("operator_auth_audit")
            .find(_paging(query, before, "occurred_at"), session=current_session())
            .sort([("occurred_at", -1), ("_id", -1)])
            .limit(limit)
            .to_list(limit)
        )
        return [
            SecurityAudit(
                id=row["_id"], **{key: value for key, value in row.items() if key != "_id"}
            )
            for row in rows
        ]

    async def publish_revoke(self, event: RevocationEvent) -> None:
        counter = await self.collections.collection("sequence_counters").find_one_and_update(
            {"_id": "operator-auth-outbox"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
            session=_session(),
        )
        data = _data(event)
        data["sequence"] = counter["value"]
        data["expires_at"] = event.occurred_at + timedelta(days=7)
        await self.collections.collection("operator_auth_outbox").insert_one(
            data, session=_session()
        )


class MongoIdentityRateLimiter:
    def __init__(
        self, collections: OperatorCollections, limits: dict[str, tuple[int, int]]
    ) -> None:
        if any(limit <= 0 or window <= 0 for limit, window in limits.values()):
            raise ValueError("Rate limits phải dương")
        self.collection = collections.collection("operator_auth_rate_limits")
        self.limits = dict(limits)

    async def consume(self, scope: str, key_hash: str, now: datetime) -> None:
        if scope not in self.limits or len(key_hash) != 64:
            raise InfrastructureError(
                "AUTH_RATE_LIMIT_UNAVAILABLE", "Rate limit scope chưa được cấu hình"
            )
        limit, window = self.limits[scope]
        key = f"{scope}:{key_hash}:{int(now.timestamp()) // window}"
        update = {
            "$inc": {"count": 1},
            "$setOnInsert": {"expires_at": now + timedelta(seconds=window * 2)},
        }
        try:
            try:
                document = await self.collection.find_one_and_update(
                    {"_id": key}, update, upsert=True, return_document=ReturnDocument.AFTER
                )
            except DuplicateKeyError:
                document = await self.collection.find_one_and_update(
                    {"_id": key}, {"$inc": {"count": 1}}, return_document=ReturnDocument.AFTER
                )
        except PyMongoError as error:
            raise InfrastructureError(
                "AUTH_RATE_LIMIT_UNAVAILABLE", "Không xác minh được rate limit"
            ) from error
        if document is None:
            raise InfrastructureError(
                "AUTH_RATE_LIMIT_UNAVAILABLE", "Không xác minh được rate limit"
            )
        if document["count"] > limit:
            raise SmartGateError(
                "RATE_LIMIT_EXCEEDED", "Thử lại sau cửa sổ giới hạn", status_code=429
            )
