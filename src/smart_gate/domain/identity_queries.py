from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Generic, Literal, TypeVar
from uuid import UUID

T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class PageBoundary:
    created_at: datetime
    id: UUID


@dataclass(frozen=True, slots=True)
class UserFilters:
    search: str | None = None
    role_id: UUID | None = None
    is_active: bool | None = None


@dataclass(frozen=True, slots=True)
class AuditFilters:
    from_: datetime | None = None
    to: datetime | None = None
    actor_id: UUID | None = None
    action: str | None = None
    target_type: str | None = None
    target_id: str | None = None
    outcome: str | None = None


@dataclass(frozen=True, slots=True)
class IdentityPage(Generic[T]):
    items: tuple[T, ...]
    next_cursor: str | None
    has_more: bool
    coverage: Literal["complete", "partial"] = "complete"
