from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from smart_gate.config import Settings
from smart_gate.domain.entities import Driver, Vehicle, WarehouseExitOrder
from smart_gate.domain.exceptions import SmartGateError
from smart_gate.infrastructure.signing.ed25519_slip import Ed25519ExitSlipGateway


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        APP_ENV="test",
        QR_PRIVATE_KEY="nWGxne/9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A=",
        QR_PUBLIC_KEY="11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=",
    )


@pytest.mark.asyncio
async def test_jws_detects_tampering_and_increments_version() -> None:
    now = datetime.now(UTC)
    driver = Driver("Tài xế", (1.0, 0.0), "test")
    vehicle = Vehicle("30A-12345", "30A12345", "truck")
    order = WarehouseExitOrder("ORDER-1", driver.id, vehicle.id, [], now, now + timedelta(hours=2))
    gateway = Ed25519ExitSlipGateway(_settings())

    first = await gateway.issue(order, driver, vehicle, now + timedelta(hours=1))
    order.slip_version = first.claims.slip_version
    second = await gateway.issue(order, driver, vehicle, now + timedelta(hours=1))

    assert (await gateway.verify(first.token)).order_id == order.order_id
    assert second.claims.slip_version == 2
    header, payload, signature = first.token.split(".")
    replacement = "A" if payload[10] != "A" else "B"
    tampered = f"{header}.{payload[:10]}{replacement}{payload[11:]}.{signature}"
    with pytest.raises(SmartGateError) as error:
        await gateway.verify(tampered)
    assert error.value.code == "SLIP_SIGNATURE_INVALID"


@pytest.mark.asyncio
async def test_jws_rejects_expired_token() -> None:
    now = datetime.now(UTC)
    driver = Driver("Tài xế", (1.0, 0.0), "test")
    vehicle = Vehicle("30A-12345", "30A12345", "truck")
    order = WarehouseExitOrder("ORDER-2", driver.id, vehicle.id, [], now, now)
    gateway = Ed25519ExitSlipGateway(_settings())
    artifact = await gateway.issue(order, driver, vehicle, now - timedelta(seconds=1))

    with pytest.raises(SmartGateError) as error:
        await gateway.verify(artifact.token)

    assert error.value.code == "SLIP_EXPIRED"
