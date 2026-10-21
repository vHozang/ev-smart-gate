"""Adapters bộ nhớ chỉ dành cho unit test operator auth, không import vào runtime."""

from __future__ import annotations

import asyncio
import copy
import hashlib
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime

from smart_gate.domain.exceptions import AuthenticationError, ConflictError
from smart_gate.domain.operator_identity import (
    OperatorRole,
    OperatorUser,
    RefreshRecord,
    SecurityAudit,
    TokenFamily,
    WsTicket,
)


@dataclass
class State:
    users: dict = field(default_factory=dict)
    roles: dict = field(default_factory=dict)
    families: dict = field(default_factory=dict)
    refreshes: dict = field(default_factory=dict)
    tickets: dict = field(default_factory=dict)
    audits: list = field(default_factory=list)
    events: list = field(default_factory=list)


class MemoryIdentity:
    def __init__(self) -> None:
        self.state = State()
        self.lock = asyncio.Lock()
        self.audit_unavailable = False

    async def run(self, operation):
        async with self.lock:
            before = copy.deepcopy(self.state)
            try:
                return await operation()
            except BaseException:
                self.state = before
                raise

    async def list_events(self, filters, before, limit):
        rows = [
            event
            for event in self.state.audits
            if all(
                value is None or getattr(event, name) == value
                for name, value in {
                    "actor_id": filters.actor_id,
                    "action": filters.action,
                    "target_id": filters.target_id,
                    "outcome": filters.outcome,
                }.items()
            )
            and (
                filters.target_type is None
                or event.target_type.lower() == filters.target_type.strip().lower()
            )
            and (filters.from_ is None or event.occurred_at >= filters.from_)
            and (filters.to is None or event.occurred_at < filters.to)
        ]
        rows.sort(key=lambda item: (item.occurred_at, item.id.int), reverse=True)
        if before:
            rows = [
                row
                for row in rows
                if (row.occurred_at, row.id.int) < (before.created_at, before.id.int)
            ]
        return rows[:limit]

    async def append(self, audit: SecurityAudit):
        if self.audit_unavailable:
            raise RuntimeError("audit unavailable")
        self.state.audits.append(audit)

    async def publish_revoke(self, event):
        self.state.events.append(event)


class MemoryUsers:
    def __init__(self, db: MemoryIdentity):
        self.db = db

    async def get(self, user_id):
        return self.db.state.users.get(user_id)

    async def by_username(self, username):
        return next((x for x in self.db.state.users.values() if x.username == username), None)

    async def add(self, user: OperatorUser):
        if await self.by_username(user.username):
            raise ConflictError("USERNAME_EXISTS", "Username đã tồn tại")
        self.db.state.users[user.id] = user
        return user

    async def save(self, user, expected_version):
        old = await self.get(user.id)
        if old is None or old.version != expected_version:
            raise ConflictError("USER_VERSION_CONFLICT", "Version đã đổi")
        self.db.state.users[user.id] = user
        return user

    async def bump_role_members(self, role_id):
        ids = []
        for uid, user in list(self.db.state.users.items()):
            if user.role_id == role_id:
                self.db.state.users[uid] = replace(
                    user,
                    version=user.version + 1,
                    authz_version=user.authz_version + 1,
                    session_version=user.session_version + 1,
                )
                ids.append(uid)
        return ids

    async def count_role_members(self, role_ids):
        return {
            role_id: sum(user.role_id == role_id for user in self.db.state.users.values())
            for role_id in role_ids
        }

    async def count_role(self, role_id, *, active_only=False):
        return sum(
            u.role_id == role_id and (u.is_active or not active_only)
            for u in self.db.state.users.values()
        )

    async def list_users(self, filters, before, limit):
        rows = [
            user
            for user in self.db.state.users.values()
            if (filters.search is None or user.username.startswith(filters.search))
            and (filters.role_id is None or user.role_id == filters.role_id)
            and (filters.is_active is None or user.is_active == filters.is_active)
        ]
        rows.sort(key=lambda user: (user.created_at, user.id.int), reverse=True)
        if before:
            rows = [
                user
                for user in rows
                if (user.created_at, user.id.int) < (before.created_at, before.id.int)
            ]
        return rows[:limit]

    async def lock_admin_invariant(self):
        # MemoryIdentity.run serialize toàn bộ test; Mongo adapter phải ghi fence thật.
        pass


class MemoryRoles:
    def __init__(self, db):
        self.db = db

    async def get_many(self, role_ids):
        return {key: self.db.state.roles[key] for key in role_ids if key in self.db.state.roles}

    async def get(self, role_id):
        return self.db.state.roles.get(role_id)

    async def by_code(self, code):
        return next((r for r in self.db.state.roles.values() if r.code == code), None)

    async def add(self, role: OperatorRole):
        if await self.by_code(role.code):
            raise ConflictError("ROLE_EXISTS", "Role đã tồn tại")
        self.db.state.roles[role.id] = role
        return role

    async def list_roles(self, before, limit):
        rows = sorted(
            self.db.state.roles.values(),
            key=lambda role: (role.created_at, role.id.int),
            reverse=True,
        )
        if before:
            rows = [
                role
                for role in rows
                if (role.created_at, role.id.int) < (before.created_at, before.id.int)
            ]
        return rows[:limit]

    async def save(self, role, expected_version):
        old = await self.get(role.id)
        if old is None or old.version != expected_version:
            raise ConflictError("ROLE_VERSION_CONFLICT", "Role version đã đổi")
        self.db.state.roles[role.id] = role
        return role


class MemorySessions:
    def __init__(self, db):
        self.db = db

    async def get_family(self, session_id):
        return self.db.state.families.get(session_id)

    async def add_family(self, family: TokenFamily, refresh: RefreshRecord):
        self.db.state.families[family.id] = family
        self.db.state.refreshes[refresh.token_hash] = refresh

    async def get_refresh(self, token_hash):
        return self.db.state.refreshes.get(token_hash)

    async def rotate(self, family, consumed, replacement, expected_version):
        old = await self.get_family(family.id)
        record = await self.get_refresh(consumed.token_hash)
        if old is None or old.version != expected_version or old.revoked_at or record.consumed_at:
            raise ConflictError("REFRESH_IN_PROGRESS", "Refresh cạnh tranh")
        self.db.state.families[family.id] = family
        self.db.state.refreshes[consumed.token_hash] = consumed
        self.db.state.refreshes[replacement.token_hash] = replacement

    async def revoke_family(self, session_id, now):
        family = await self.get_family(session_id)
        if family and not family.revoked_at:
            self.db.state.families[session_id] = replace(
                family, revoked_at=now, version=family.version + 1
            )

    async def revoke_user(self, user_id, now):
        for family in list(self.db.state.families.values()):
            if family.user_id == user_id:
                await self.revoke_family(family.id, now)

    async def list_user(self, user_id, before=None, limit=201):
        rows = sorted(
            [family for family in self.db.state.families.values() if family.user_id == user_id],
            key=lambda family: (family.created_at, family.id.int),
            reverse=True,
        )
        if before:
            rows = [
                family
                for family in rows
                if (family.created_at, family.id.int) < (before.created_at, before.id.int)
            ]
        return rows[:limit]


class MemoryTickets:
    def __init__(self, db):
        self.db = db

    async def add(self, ticket: WsTicket):
        self.db.state.tickets[ticket.token_hash] = ticket

    async def get(self, token_hash):
        return self.db.state.tickets.get(token_hash)

    async def consume(self, token_hash, now):
        ticket = await self.get(token_hash)
        if ticket is None or ticket.consumed_at or now >= ticket.expires_at:
            raise AuthenticationError("WS_TICKET_INVALID", "Ticket đã dùng hoặc hết hạn")
        self.db.state.tickets[token_hash] = replace(ticket, consumed_at=now)


class TestPasswords:
    __test__ = False

    def hash(self, password):
        return hashlib.sha256(password.encode()).hexdigest()

    def verify(self, password_hash, password):
        return self.hash(password) == password_hash


class TestClock:
    __test__ = False

    def __init__(self):
        self.value = datetime(2026, 10, 20, 12, 0, tzinfo=UTC)

    def now(self):
        return self.value


class TestLimiter:
    __test__ = False

    async def consume(self, scope, key_hash, now):
        pass
