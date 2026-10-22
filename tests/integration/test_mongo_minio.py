from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from smart_gate.config import Settings
from smart_gate.domain.entities import (
    DockInspection,
    Driver,
    DriverVehicleAuthorization,
    Vehicle,
    WarehouseExitOrder,
)
from smart_gate.domain.enums import OrderStatus
from smart_gate.domain.exceptions import ConflictError
from smart_gate.infrastructure.database.client import MongoDatabase
from smart_gate.infrastructure.database.documents import (
    DriverDocument,
    DriverVehicleAuthorizationDocument,
    GateLogDocument,
)
from smart_gate.infrastructure.database.repositories import (
    BeanieAuthorizationRepository,
    BeanieDockRepository,
    BeanieDriverRepository,
    BeanieOrderRepository,
    BeanieVehicleRepository,
)
from smart_gate.infrastructure.database.unit_of_work import MongoUnitOfWork
from smart_gate.infrastructure.security.crypto import EmbeddingCipher
from smart_gate.infrastructure.storage.minio_storage import MinioEvidenceStorage

pytestmark = pytest.mark.integration


@pytest.mark.skipif(
    os.getenv("RUN_INTEGRATION") != "1",
    reason="Chỉ chạy khi MongoDB replica set và MinIO thật đã sẵn sàng",
)
@pytest.mark.asyncio
async def test_encryption_indexes_storage_and_transaction_rollback() -> None:
    database_name = f"smart_gate_test_{uuid4().hex}"
    settings = Settings(
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
    database = MongoDatabase(settings)
    await database.connect()
    try:
        cipher = EmbeddingCipher(settings.embedding_encryption_key)
        drivers = BeanieDriverRepository(cipher)
        vehicles = BeanieVehicleRepository()
        authorizations = BeanieAuthorizationRepository()
        orders = BeanieOrderRepository()
        docks = BeanieDockRepository()
        storage = MinioEvidenceStorage(settings)
        await storage.initialize()

        driver = await drivers.add(Driver("Tài xế tích hợp", (1.0, 0.0), "test"))
        document = await DriverDocument.get(driver.id)
        assert document is not None
        assert document.face_embedding_ciphertext != "[1.0,0.0]"
        loaded_driver = await drivers.get(driver.id)
        assert loaded_driver is not None
        assert loaded_driver.face_embedding == (1.0, 0.0)
        driver_without_code = await drivers.add(Driver("Tài xế không mã", (0.0, 1.0), "test"))
        assert driver_without_code.id != driver.id

        await drivers.add(
            Driver(
                "Tài xế có mã",
                (0.5, 0.5),
                "test",
                employee_code="INTEGRATION-001",
            )
        )
        with pytest.raises(ConflictError) as duplicate_driver_error:
            await drivers.add(
                Driver(
                    "Tài xế trùng mã",
                    (0.5, -0.5),
                    "test",
                    employee_code="INTEGRATION-001",
                )
            )
        assert duplicate_driver_error.value.code == "DRIVER_ALREADY_EXISTS"

        object_key = await storage.store(
            b"evidence-secret",
            category="integration-test",
            correlation_id=uuid4().hex,
            content_type="application/octet-stream",
            extension="bin",
        )
        assert await storage.read(object_key) == b"evidence-secret"

        gate_log_index_cursor = await GateLogDocument.get_pymongo_collection().list_indexes()
        index_names = {item["name"] async for item in gate_log_index_cursor}
        assert "event_id_1" in index_names

        now = datetime.now(UTC)
        vehicle = await vehicles.add(Vehicle("51A-12345", "51A12345", "TRUCK"))
        await authorizations.add(
            DriverVehicleAuthorization(
                driver_id=driver.id,
                vehicle_id=vehicle.id,
                valid_from=now,
                valid_until=now + timedelta(hours=1),
            )
        )
        with pytest.raises(ConflictError) as overlap_error:
            await authorizations.add(
                DriverVehicleAuthorization(
                    driver_id=driver.id,
                    vehicle_id=vehicle.id,
                    valid_from=now + timedelta(minutes=30),
                    valid_until=now + timedelta(hours=2),
                )
            )
        assert overlap_error.value.code == "AUTHORIZATION_PERIOD_OVERLAP"

        await authorizations.add(
            DriverVehicleAuthorization(
                driver_id=driver.id,
                vehicle_id=vehicle.id,
                valid_from=now + timedelta(hours=2),
                valid_until=now + timedelta(hours=3),
            )
        )
        assert await authorizations.revoke(driver.id, vehicle.id)
        assert await authorizations.is_authorized(
            driver.id, vehicle.id, now + timedelta(minutes=15)
        )
        assert not await authorizations.is_authorized(
            driver.id, vehicle.id, now + timedelta(hours=2, minutes=30)
        )

        authorization_index_cursor = (
            await DriverVehicleAuthorizationDocument.get_pymongo_collection().list_indexes()
        )
        authorization_indexes = [item async for item in authorization_index_cursor]
        assert any(
            dict(item["key"]) == {"driver_id": 1, "vehicle_id": 1, "valid_from": 1}
            and item.get("unique") is True
            for item in authorization_indexes
        )

        order = await orders.add(
            WarehouseExitOrder(
                order_id=f"TX-{uuid4().hex}",
                assigned_driver_id=driver.id,
                assigned_vehicle_id=uuid4(),
                cargo_metadata=[],
                valid_from=now,
                valid_until=now + timedelta(hours=1),
            )
        )
        inspection = DockInspection(order.order_id, uuid4())
        with pytest.raises(RuntimeError, match="rollback chủ động"):
            async with MongoUnitOfWork(database).transaction():
                await docks.add(inspection)
                order.status = OrderStatus.LOADING
                order.dock_session_id = inspection.id
                await orders.update(order)
                raise RuntimeError("rollback chủ động")

        persisted_order = await orders.get_by_order_id(order.order_id)
        assert persisted_order is not None
        assert persisted_order.status == OrderStatus.PENDING
        assert await docks.get(inspection.id) is None
    finally:
        if database.client is not None:
            await database.client.drop_database(database_name)
        await database.close()
