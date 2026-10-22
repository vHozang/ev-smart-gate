from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from contextvars import ContextVar, Token

from pymongo.asynchronous.client_session import AsyncClientSession

from smart_gate.infrastructure.database.client import MongoDatabase

_active_session: ContextVar[AsyncClientSession | None] = ContextVar(
    "smart_gate_mongo_session", default=None
)


def current_session() -> AsyncClientSession | None:
    return _active_session.get()


class MongoUnitOfWork:
    """Cung cấp transaction MongoDB replica set cho các thao tác nhiều document."""

    def __init__(self, database: MongoDatabase) -> None:
        self.database = database

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[None]:
        if self.database.client is None:
            raise RuntimeError("MongoDB chưa được khởi tạo")
        async with AsyncExitStack() as stack:
            session = await stack.enter_async_context(self.database.client.start_session())
            transaction = await session.start_transaction()
            await stack.enter_async_context(transaction)
            token: Token = _active_session.set(session)
            try:
                yield
            finally:
                _active_session.reset(token)
