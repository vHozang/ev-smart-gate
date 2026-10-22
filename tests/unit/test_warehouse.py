from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from smart_gate.application.dto import CaptureDockInput, FinalizeDockInput
from smart_gate.application.warehouse import WarehouseService
from smart_gate.config import Settings
from smart_gate.domain.entities import Driver, GateLog, Vehicle, WarehouseExitOrder
from smart_gate.domain.enums import (
    CargoState,
    Direction,
    OrderStatus,
    PlateMatchType,
    VerificationStatus,
)
from smart_gate.domain.services import OrderStateService
from smart_gate.infrastructure.security.crypto import SecretHasher
from smart_gate.infrastructure.signing.ed25519_slip import Ed25519ExitSlipGateway
from tests.fakes import (
    AuthorizationRepositoryFake,
    CargoGatewayFake,
    DockRepositoryFake,
    DriverRepositoryFake,
    EvidenceStorageFake,
    GateLogRepositoryFake,
    OrderRepositoryFake,
    UnitOfWorkFake,
    VehicleRepositoryFake,
)


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        APP_ENV="test",
        QR_PRIVATE_KEY="nWGxne/9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A=",
        QR_PUBLIC_KEY="11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=",
    )


@pytest.mark.asyncio
async def test_dock_finalize_and_reissue_slip() -> None:
    now = datetime.now(UTC)
    driver = Driver("Tài xế", (1.0, 0.0), "test")
    vehicle = Vehicle("30A-12345", "30A12345", "truck")
    order = WarehouseExitOrder(
        "ORDER-WH",
        driver.id,
        vehicle.id,
        [{"sku": "PALLET", "quantity": 1}],
        now - timedelta(minutes=5),
        now + timedelta(hours=4),
    )
    gate_logs = GateLogRepositoryFake()
    await gate_logs.add(
        GateLog(
            event_id="warehouse-entry-event",
            direction=Direction.ENTRY,
            verification_status=VerificationStatus.PASSED,
            observed_plate=vehicle.plate_normalized,
            plate_score=1.0,
            plate_match_type=PlateMatchType.EXACT,
            face_similarity=1.0,
            verification_score=1.0,
            reason_codes=["ALL_CHECKS_PASSED"],
            driver_id=driver.id,
            vehicle_id=vehicle.id,
            occurred_at=now,
        )
    )
    orders = OrderRepositoryFake(order)
    docks = DockRepositoryFake()
    hasher = SecretHasher("warehouse-unit-test-secret")
    service = WarehouseService(
        _settings(),
        orders,
        docks,
        DriverRepositoryFake(driver),
        VehicleRepositoryFake(vehicle),
        AuthorizationRepositoryFake(True),
        gate_logs,
        EvidenceStorageFake(),
        CargoGatewayFake(),
        Ed25519ExitSlipGateway(_settings()),
        hasher,
        OrderStateService(),
        UnitOfWorkFake(),
    )

    dock = await service.start_dock(order.order_id)
    capture = await service.capture_dock(CaptureDockInput(inspection_id=dock.id, image=b"cargo"))
    finalized = await service.finalize_dock(
        FinalizeDockInput(
            inspection_id=dock.id,
            operator_note="Đã kiểm tra đủ hàng",
            final_cargo_state=CargoState.LOADED,
        )
    )
    first = await service.issue_slip(order.order_id)
    old_jti_hash = order.slip_jti_hash
    second = await service.issue_slip(order.order_id, reissue=True)

    assert capture.capture_count == 1
    assert finalized.current_cargo_state == CargoState.LOADED
    assert order.status == OrderStatus.SLIP_ISSUED
    assert first.slip_version == 1
    assert second.slip_version == 2
    assert order.slip_jti_hash != old_jti_hash
