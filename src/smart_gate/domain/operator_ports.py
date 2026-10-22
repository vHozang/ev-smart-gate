from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Protocol, TypeVar
from uuid import UUID

from smart_gate.domain.identity_queries import AuditFilters, PageBoundary, UserFilters
from smart_gate.domain.operator_identity import (
    AccessClaims,
    OperatorRole,
    OperatorUser,
    RefreshRecord,
    RevocationEvent,
    SecurityAudit,
    TokenFamily,
    WsTicket,
)

T = TypeVar("T")


class AtomicIdentityWork(Protocol):
    async def run(self, operation: Callable[[], Awaitable[T]]) -> T:
        """Transaction snapshot; retry bounded transient/CAS và unknown commit theo driver.

        Callback không gọi model/device/network hoặc phát credential. Tất cả reads/writes
        của repositories trong callback cùng một session; lỗi audit rollback mutation.
        """
        ...


class OperatorUsers(Protocol):
    async def count_role_members(self, role_ids: tuple[UUID, ...]) -> dict[UUID, int]: ...
    async def list_users(
        self, filters: UserFilters, before: PageBoundary | None, limit: int
    ) -> list[OperatorUser]: ...
    async def get(self, user_id: UUID) -> OperatorUser | None: ...
    async def by_username(self, normalized_username: str) -> OperatorUser | None: ...
    async def add(self, user: OperatorUser) -> OperatorUser: ...
    async def save(self, user: OperatorUser, expected_version: int) -> OperatorUser:
        """CAS + username unique; mismatch trả USER_VERSION_CONFLICT, không upsert."""
        ...

    async def bump_role_members(self, role_id: UUID) -> list[UUID]:
        """Tăng authz/session/version mọi user của role, cùng transaction role update."""
        ...

    async def count_role(self, role_id: UUID, *, active_only: bool = False) -> int: ...
    async def lock_admin_invariant(self) -> None:
        """Ghi một fence chung trong transaction trước count/mutation last-admin.

        Snapshot count đơn thuần có write-skew; hai request cạnh tranh phải tranh cùng fence.
        """
        ...


class OperatorRoles(Protocol):
    async def get_many(self, role_ids: tuple[UUID, ...]) -> dict[UUID, OperatorRole]: ...
    async def list_roles(self, before: PageBoundary | None, limit: int) -> list[OperatorRole]: ...
    async def get(self, role_id: UUID) -> OperatorRole | None: ...
    async def by_code(self, code: str) -> OperatorRole | None: ...
    async def add(self, role: OperatorRole) -> OperatorRole: ...
    async def save(self, role: OperatorRole, expected_version: int) -> OperatorRole: ...


class OperatorSessions(Protocol):
    async def get_family(self, session_id: UUID) -> TokenFamily | None: ...
    async def add_family(self, family: TokenFamily, refresh: RefreshRecord) -> None: ...
    async def get_refresh(self, token_hash: str) -> RefreshRecord | None: ...
    async def rotate(
        self,
        family: TokenFamily,
        consumed: RefreshRecord,
        replacement: RefreshRecord,
        expected_version: int,
    ) -> None:
        """CAS family + consume record cũ + insert hash mới trong cùng transaction.

        Giữ hash record đã consume tới absolute expiry để phát hiện replay; không lưu plaintext.
        """
        ...

    async def revoke_family(self, session_id: UUID, now: datetime) -> None: ...
    async def revoke_user(self, user_id: UUID, now: datetime) -> None: ...
    async def list_user(
        self, user_id: UUID, before: PageBoundary | None = None, limit: int = 201
    ) -> list[TokenFamily]: ...


class OperatorAudit(Protocol):
    async def list_events(
        self, filters: AuditFilters, before: PageBoundary | None, limit: int
    ) -> list[SecurityAudit]: ...
    async def append(self, audit: SecurityAudit) -> None: ...
    async def publish_revoke(self, event: RevocationEvent) -> None:
        """Ghi durable outbox cùng transaction; không chỉ gửi process-local event."""
        ...


class OperatorTickets(Protocol):
    async def add(self, ticket: WsTicket) -> None: ...
    async def get(self, token_hash: str) -> WsTicket | None: ...
    async def consume(self, token_hash: str, now: datetime) -> None:
        """Atomic CAS chưa consume/chưa expiry; không consume lại bằng upsert."""
        ...


class OperatorTokenGateway(Protocol):
    def issue(self, claims: AccessClaims) -> str: ...
    def verify(self, token: str, now: datetime) -> AccessClaims:
        """Allowlist alg/kid/iss/aud/typ/expiry; không dùng keys/claims phiếu kho."""
        ...


class IdentityClock(Protocol):
    def now(self) -> datetime:
        """UTC aware từ server, không nhận timestamp client để quyết định expiry."""
        ...


class IdentitySecrets(Protocol):
    def generate(self) -> str:
        """CSPRNG ít nhất 256 bit; không log credential."""
        ...

    def digest(self, secret: str) -> str: ...
    def matches(self, secret: str, digest: str) -> bool: ...


class IdentityRateLimiter(Protocol):
    async def consume(self, scope: str, key_hash: str, now: datetime) -> None:
        """Durable global counter/window trước credential verification, không process-local."""
        ...


class IdentityCursorGateway(Protocol):
    def encode(self, position: PageBoundary, scope: str, now: datetime) -> str: ...
    def decode(self, cursor: str, scope: str, now: datetime) -> PageBoundary:
        """Opaque signed cursor; bind actor/version/query và thời hạn, không nhận raw query."""
        ...
