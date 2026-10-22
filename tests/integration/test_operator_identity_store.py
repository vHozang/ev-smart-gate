from __future__ import annotations

import asyncio
import os
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from smart_gate.application.operator_auth import OperatorAuthService
from smart_gate.config import Settings
from smart_gate.domain.entities import User
from smart_gate.domain.enums import UserRole
from smart_gate.domain.exceptions import (
    AuthenticationError,
    ConflictError,
    InfrastructureError,
    SmartGateError,
)
from smart_gate.domain.operator_identity import OperatorUser, require_admin_survives
from smart_gate.domain.permission_catalog import BASELINE_ROLE_PERMISSIONS, system_role_id
from smart_gate.infrastructure.database.client import MongoDatabase
from smart_gate.infrastructure.database.operator_migration import migrate_operator_identities
from smart_gate.infrastructure.database.operator_store import (
    MongoIdentityRateLimiter,
    MongoIdentityWork,
    MongoOperatorAudit,
    MongoOperatorRoles,
    MongoOperatorSessions,
    MongoOperatorTickets,
    MongoOperatorUsers,
    OperatorCollections,
)
from smart_gate.infrastructure.database.repositories import BeanieUserRepository
from smart_gate.infrastructure.security.crypto import PasswordService
from smart_gate.infrastructure.security.operator_tokens import (
    Ed25519OperatorTokens,
    OperatorSecrets,
)

pytestmark = [
    pytest.mark.integration,
    pytest.mark.asyncio,
    pytest.mark.skipif(
        os.getenv("RUN_INTEGRATION") != "1", reason="Cần MongoDB replica set thật, cô lập"
    ),
]


class MutableClock:
    def __init__(self):
        self.value = datetime.now(UTC).replace(microsecond=0)

    def now(self):
        return self.value


@pytest_asyncio.fixture
async def world():
    if os.getenv("APP_ENV") != "test":
        pytest.fail("Chỉ chạy với APP_ENV=test và DB test riêng")
    name = f"evsg_contract_test_identity_{uuid4().hex}"
    settings = Settings(
        _env_file=None, APP_ENV="test", MONGODB_DATABASE=name, MONGODB_URI=os.environ["MONGODB_URI"]
    )
    first, second = MongoDatabase(settings), MongoDatabase(settings)
    try:
        await first.connect()
        password = os.environ.get("TEST_OPERATOR_PASSWORD", "synthetic-integration-only-password")
        passwords = PasswordService()
        legacy = BeanieUserRepository()
        users = {}
        for role in UserRole:
            users[role.value] = await legacy.add(
                User(f"contract-{role.value.lower()}", passwords.hash(password), role)
            )
        collections = OperatorCollections(first)
        await collections.initialize()
        work = MongoIdentityWork(first)
        clock = MutableClock()
        report = await migrate_operator_identities(collections, work, clock.now())
        roles = MongoOperatorRoles(collections)
        for code, permissions in BASELINE_ROLE_PERMISSIONS.items():
            assert (await roles.get(system_role_id(code))).permissions == permissions
        assert not report["approved_additions"]
        await migrate_operator_identities(
            collections, work, clock.now(), seed_approved_permissions=True
        )
        await second.connect()
        key = Ed25519PrivateKey.generate()
        tokens = Ed25519OperatorTokens(
            key, {"test-operator": key.public_key()}, issuer="test-operator", kid="test-operator"
        )
        secrets = OperatorSecrets(b"isolated-integration-pepper-32-bytes")

        def service(database=first, audit=None):
            c = OperatorCollections(database)
            return OperatorAuthService(
                MongoOperatorUsers(c),
                MongoOperatorRoles(c),
                MongoOperatorSessions(c),
                MongoOperatorTickets(c),
                audit or MongoOperatorAudit(c),
                MongoIdentityWork(database),
                passwords,
                secrets,
                tokens,
                clock,
                MongoIdentityRateLimiter(
                    c,
                    {
                        scope: (1000, 60)
                        for scope in [
                            "login-client",
                            "login-account",
                            "refresh-client",
                            "ws-ticket",
                        ]
                    },
                ),
            )

        yield first, second, collections, work, clock, users, password, service, secrets
    finally:
        if first.client:
            assert name.startswith("evsg_contract_test_identity_")
            await first.client.drop_database(name)
        await first.close()
        await second.close()


async def test_atomic_rotation_reuse_durable_across_two_mongo_clients(world):
    first, second, c, _, clock, _, password, service, secrets = world
    a, b = service(first), service(second)
    issued = await a.login("contract-admin", password, "client-a")
    results = await asyncio.gather(
        a.refresh(issued.refresh_token, issued.csrf_token, issued.csrf_token, "client-a"),
        b.refresh(issued.refresh_token, issued.csrf_token, issued.csrf_token, "client-b"),
        return_exceptions=True,
    )
    assert sum(not isinstance(x, Exception) for x in results) == 1
    assert (
        sum(isinstance(x, ConflictError) and x.code == "REFRESH_IN_PROGRESS" for x in results) == 1
    )
    winner = next(x for x in results if not isinstance(x, Exception))
    assert (
        await c.collection("operator_refresh_credentials").count_documents(
            {"family_id": issued.family.id}
        )
        == 2
    )
    raw = await c.collection("operator_sessions").find_one({"_id": issued.family.id})
    assert issued.refresh_token not in repr(raw) and winner.refresh_token not in repr(raw)
    assert raw["current_refresh_hash"] == secrets.digest(winner.refresh_token)
    clock.value += timedelta(seconds=6)
    with pytest.raises(AuthenticationError) as error:
        await b.refresh(issued.refresh_token, issued.csrf_token, issued.csrf_token, "client-b")
    assert error.value.code == "REFRESH_REUSE_DETECTED"
    assert (await c.collection("operator_sessions").find_one({"_id": issued.family.id}))[
        "revoked_at"
    ]
    with pytest.raises(AuthenticationError):
        await a.authenticate(winner.access_token)
    assert (
        await c.collection("operator_auth_outbox").count_documents({"session_id": issued.family.id})
        == 1
    )


async def test_change_password_audit_failure_rolls_back_real_transaction(world):
    _, _, c, _, _, users, password, service, _ = world

    class FailingAudit(MongoOperatorAudit):
        async def append(self, audit):
            raise RuntimeError("audit unavailable")

    normal = service()
    issued = await normal.login("contract-admin", password, "client")
    before = await c.collection("users").find_one({"_id": users["ADMIN"].id})
    with pytest.raises(RuntimeError):
        await service(audit=FailingAudit(c)).change_password(
            issued.principal, password, "different-synthetic-password", "req"
        )
    after = await c.collection("users").find_one({"_id": users["ADMIN"].id})
    assert after["password_hash"] == before["password_hash"]
    assert after["session_version"] == before["session_version"]
    assert not (await c.collection("operator_sessions").find_one({"_id": issued.family.id}))[
        "revoked_at"
    ]
    assert (await normal.authenticate(issued.access_token)).id == users["ADMIN"].id
    assert not await c.collection("operator_auth_outbox").count_documents({})


async def test_ticket_single_consume_and_logout_on_other_client(world):
    first, second, _, _, _, _, password, service, _ = world
    a, b = service(first), service(second)
    issued = await a.login("contract-admin", password, "client")
    raw, _ = await a.issue_ticket(issued.principal, "security.alerts")
    results = await asyncio.gather(
        a.consume_ticket(raw, "security.alerts"),
        b.consume_ticket(raw, "security.alerts"),
        return_exceptions=True,
    )
    assert sum(not isinstance(x, Exception) for x in results) == 1
    assert sum(isinstance(x, AuthenticationError) for x in results) == 1
    await b.logout(principal=issued.principal)
    with pytest.raises(AuthenticationError):
        await a.revalidate(issued.principal)


async def test_migration_repeat_preserves_admin_changes_and_separate_seed(world):
    _, _, c, work, clock, users, _, _, _ = world
    admin_id = users["ADMIN"].id
    await c.collection("users").update_one(
        {"_id": admin_id},
        {"$set": {"is_active": False}, "$inc": {"version": 1, "session_version": 1}},
    )
    await c.collection("operator_roles").update_one(
        {"_id": system_role_id("SECURITY")},
        {"$set": {"name": "Reviewed security"}, "$inc": {"version": 1}},
    )
    report = await migrate_operator_identities(c, work, clock.now(), seed_approved_permissions=True)
    assert report["migrated_users"] == 0 and not report["seed_applied"]
    assert not (await c.collection("users").find_one({"_id": admin_id}))["is_active"]
    assert (await c.collection("operator_roles").find_one({"_id": system_role_id("SECURITY")}))[
        "name"
    ] == "Reviewed security"
    assert await c.collection("users").count_documents({}) == 3


async def test_migration_username_collision_fails_without_merging(world):
    _, _, c, work, clock, _, _, _, _ = world
    await c.collection("users").insert_one(
        {
            "_id": uuid4(),
            "username": " CONTRACT-ADMIN ",
            "role": "ADMIN",
            "password_hash": "synthetic-hash",
            "created_at": clock.now(),
            "is_active": True,
        }
    )
    with pytest.raises(InfrastructureError) as error:
        await migrate_operator_identities(c, work, clock.now(), seed_approved_permissions=True)
    assert error.value.code == "MIGRATION_USERNAME_COLLISION"
    assert await c.collection("users").count_documents({}) == 4


async def test_real_fence_prevents_last_admin_write_skew(world):
    first, second, c, work, clock, users, _, _, _ = world
    repository = MongoOperatorUsers(c)
    extra = OperatorUser(
        uuid4(), "second-admin", "synthetic-hash", system_role_id("ADMIN"), True, clock.now()
    )
    await work.run(lambda: repository.add(extra))

    async def demote(database, target_id):
        local = OperatorCollections(database)
        repo, roles = MongoOperatorUsers(local), MongoOperatorRoles(local)

        async def operation():
            await repo.lock_admin_invariant()
            user = await repo.get(target_id)
            old_role, new_role = (
                await roles.get(user.role_id),
                await roles.get(system_role_id("SECURITY")),
            )
            count = await repo.count_role(system_role_id("ADMIN"), active_only=True)
            require_admin_survives(old_role, user.is_active, new_role, True, count)
            return await repo.save(
                replace(
                    user,
                    role_id=new_role.id,
                    version=user.version + 1,
                    session_version=user.session_version + 1,
                ),
                user.version,
            )

        return await MongoIdentityWork(database).run(operation)

    results = await asyncio.gather(
        demote(first, users["ADMIN"].id), demote(second, extra.id), return_exceptions=True
    )
    assert sum(not isinstance(x, Exception) for x in results) == 1
    assert (
        sum(isinstance(x, ConflictError) and x.code == "LAST_ADMIN_PROTECTED" for x in results) == 1
    )
    assert (
        await c.collection("users").count_documents(
            {"role_id": system_role_id("ADMIN"), "is_active": True}
        )
        == 1
    )


async def test_rate_limit_is_shared_between_mongo_clients(world):
    first, second, _, _, clock, _, _, _, secrets = world
    a = MongoIdentityRateLimiter(OperatorCollections(first), {"test-rate": (2, 60)})
    b = MongoIdentityRateLimiter(OperatorCollections(second), {"test-rate": (2, 60)})
    results = await asyncio.gather(
        *(
            limiter.consume("test-rate", secrets.digest("unit-rate"), clock.now())
            for limiter in [a, b, a, b, a, b]
        ),
        return_exceptions=True,
    )
    assert sum(x is None for x in results) == 2
    assert sum(isinstance(x, SmartGateError) and x.status_code == 429 for x in results) == 4
