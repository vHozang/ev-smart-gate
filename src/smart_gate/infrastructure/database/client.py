from __future__ import annotations

from beanie import init_beanie
from pymongo import AsyncMongoClient

from smart_gate.config import Settings
from smart_gate.infrastructure.database.documents import DOCUMENT_MODELS


class MongoDatabase:
    """Quản lý vòng đời PyMongo Async client và khởi tạo Beanie indexes."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: AsyncMongoClient | None = None

    async def connect(self) -> None:
        self.client = AsyncMongoClient(
            self.settings.mongodb_uri,
            uuidRepresentation="standard",
            tz_aware=True,
        )
        await init_beanie(
            database=self.client[self.settings.mongodb_database],
            document_models=DOCUMENT_MODELS,
        )

    async def ping(self) -> bool:
        if self.client is None:
            return False
        try:
            await self.client.admin.command("ping")
            return True
        except Exception:
            return False

    async def close(self) -> None:
        if self.client is not None:
            await self.client.close()
            self.client = None
