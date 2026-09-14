from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from smart_gate.application.cards import EmployeeCardService
from smart_gate.application.dto import IssueEmployeeCardInput, ReplaceEmployeeCardInput
from smart_gate.config import Settings
from smart_gate.domain.entities import Driver, EmployeeCard
from smart_gate.domain.enums import CardStatus
from smart_gate.domain.exceptions import ConflictError
from smart_gate.infrastructure.database.client import MongoDatabase
from smart_gate.infrastructure.database.documents import EmployeeCardDocument
from smart_gate.infrastructure.database.repositories import (
    BeanieDriverRepository,
    BeanieEmployeeCardRepository,
)
from smart_gate.infrastructure.database.unit_of_work import MongoUnitOfWork
from smart_gate.infrastructure.security.crypto import EmbeddingCipher

pytestmark = pytest.mark.integration

_SKIP_REASON = "Chỉ chạy khi MongoDB replica set và MinIO thật đã sẵn sàng"


def _settings(database_name: str) -> Settings:
    return Settings(
        _env_file=None,
        APP_ENV="test",
        MONGODB_URI=os.getenv("MONGODB_URI", "mongodb://mongodb:27017/?replicaSet=rs0"),
        MONGODB_DATABASE=database_name,
        MINIO_ENDPOINT=os.getenv("MINIO_ENDPOINT", "minio:9000"),
        MINIO_ACCESS_KEY=os.getenv("MINIO_ACCESS_KEY", "smartgate-local"),
        MINIO_SECRET_KEY=os.getenv("MINIO_SECRET_KEY", "smartgate-local-secret"),
        EMBEDDING_ENCRYPTION_KEY="AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        EVIDENCE_ENCRYPTION_KEY="ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=",
    )


@pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason=_SKIP_REASON)
@pytest.mark.asyncio
async def test_indexes() -> None:
    database_name = f"smart_gate_test_{uuid4().hex}"
    database = MongoDatabase(_settings(database_name))
    await database.connect()
    try:
        index_cursor = await EmployeeCardDocument.get_pymongo_collection().list_indexes()
        indexes = [item async for item in index_cursor]

        uid_index = next(
            (item for item in indexes if dict(item["key"]) == {"card_uid_normalized": 1}),
            None,
        )
        assert uid_index is not None
        assert uid_index.get("unique") is True

        driver_active_index = next(
            (
                item
                for item in indexes
                if dict(item["key"]) == {"driver_id": 1}
                and item.get("partialFilterExpression") == {"status": "ACTIVE"}
            ),
            None,
        )
        assert driver_active_index is not None
        assert driver_active_index.get("unique") is True
    finally:
        if database.client is not None:
            await database.client.drop_database(database_name)
        await database.close()


@pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason=_SKIP_REASON)
@pytest.mark.asyncio
async def test_issue_replace_rollback_and_concurrency() -> None:
    database_name = f"smart_gate_test_{uuid4().hex}"
    settings = _settings(database_name)
    database = MongoDatabase(settings)
    await database.connect()
    try:
        cipher = EmbeddingCipher(settings.embedding_encryption_key)
        drivers = BeanieDriverRepository(cipher)
        cards = BeanieEmployeeCardRepository()
        unit_of_work = MongoUnitOfWork(database)
        service = EmployeeCardService(drivers, cards, unit_of_work)

        driver = await drivers.add(Driver("Tài xế tích hợp", (1.0, 0.0), "test"))

        # 1. Issuing the first card.
        first = await service.issue(
            IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34")
        )
        assert first.status == CardStatus.ACTIVE
        active_after_first = await cards.get_active_by_driver(driver.id)
        assert active_after_first is not None
        assert active_after_first.id == first.id

        # 2. Issuing a second card marks the first REPLACED, links both, exactly one ACTIVE.
        second = await service.issue(
            IssueEmployeeCardInput(driver_id=driver.id, card_uid="cd-56-78")
        )
        old = await cards.get(first.id)
        assert old is not None
        assert old.status == CardStatus.REPLACED
        assert old.replaced_by_card_id == second.id
        assert old.status_reason == "Cấp thẻ mới thay thẻ đang hoạt động"
        assert second.status == CardStatus.ACTIVE
        assert second.replaces_card_id == first.id
        assert second.status_reason is None
        history = await cards.list_by_driver(driver.id)
        assert len(history) == 2
        active_after_second = [card for card in history if card.status == CardStatus.ACTIVE]
        assert len(active_after_second) == 1
        assert active_after_second[0].id == second.id
        assert [card.id for card in history] == [second.id, first.id]

        # 3. Duplicate formatted variants raise CARD_UID_ALREADY_EXISTS.
        other_driver = await drivers.add(Driver("Tài xế khác", (0.0, 1.0), "test"))
        with pytest.raises(ConflictError) as duplicate_variant_error:
            await service.issue(
                IssueEmployeeCardInput(driver_id=other_driver.id, card_uid="ab1234")
            )
        assert duplicate_variant_error.value.code == "CARD_UID_ALREADY_EXISTS"

        # 4. A deliberate exception after replacement inside an outer transaction rolls back.
        third_card_uid = "ef-90-12"
        with pytest.raises(RuntimeError, match="rollback chủ động"):
            async with unit_of_work.transaction():
                await cards.replace_active(
                    EmployeeCard(
                        card_uid=third_card_uid,
                        card_uid_normalized="EF9012",
                        driver_id=driver.id,
                        issued_at=datetime.now(UTC),
                        updated_at=datetime.now(UTC),
                    ),
                    second.id,
                    datetime.now(UTC),
                    "Rollback test",
                )
                raise RuntimeError("rollback chủ động")

        assert await cards.get_by_uid("EF9012") is None
        rolled_back_second = await cards.get(second.id)
        assert rolled_back_second is not None
        assert rolled_back_second.status == CardStatus.ACTIVE
        active_after_rollback = await cards.get_active_by_driver(driver.id)
        assert active_after_rollback is not None
        assert active_after_rollback.id == second.id

        # 5. Two concurrent replacements against the same old card: one wins, one conflicts.
        async def replace_one() -> EmployeeCard:
            return await service.replace(
                second.id,
                ReplaceEmployeeCardInput(card_uid="11-22-33", status_reason="Thay thẻ 1"),
            )

        async def replace_two() -> EmployeeCard:
            return await service.replace(
                second.id,
                ReplaceEmployeeCardInput(card_uid="44-55-66", status_reason="Thay thẻ 2"),
            )

        results = await asyncio.gather(replace_one(), replace_two(), return_exceptions=True)
        final_history = await cards.list_by_driver(driver.id)
        final_active = [card for card in final_history if card.status == CardStatus.ACTIVE]
        assert len(final_active) == 1
        assert sum(isinstance(item, EmployeeCard) for item in results) == 1
        assert sum(isinstance(item, ConflictError) for item in results) == 1
    finally:
        if database.client is not None:
            await database.client.drop_database(database_name)
        await database.close()
