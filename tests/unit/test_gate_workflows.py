from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from smart_gate.application.alerts import AlertService
from smart_gate.application.barrier import BarrierService
from smart_gate.application.dto import ExitVerificationInput, GateVerificationInput
from smart_gate.application.gate_entry import VerifyEntryUseCase
from smart_gate.application.gate_exit import VerifyExitUseCase
from smart_gate.application.gate_logs import GateLogQueryService
from smart_gate.config import Settings
from smart_gate.domain.entities import Driver, ExitSlipClaims, GateLog, Vehicle, WarehouseExitOrder
from smart_gate.domain.enums import (
    BarrierStatus,
    CardStatus,
    Direction,
    OrderStatus,
    PlateMatchType,
    VerificationStatus,
)
from smart_gate.domain.services import FaceMatchingService, PlateMatchingService
from smart_gate.infrastructure.security.crypto import SecretHasher
from tests.fakes import (
    AlertRepositoryFake,
    AuthorizationRepositoryFake,
    BarrierGatewayFake,
    DriverRepositoryFake,
    EvidenceStorageFake,
    GateCommandRepositoryFake,
    GateLogRepositoryFake,
    OrderRepositoryFake,
    RealtimePublisherFake,
    SequenceRepositoryFake,
    StaticFaceGateway,
    StaticPlateGateway,
    StaticQrReader,
    StaticSlipGateway,
    UnitOfWorkFake,
    VehicleRepositoryFake,
)


def _settings() -> Settings:
    return Settings(_env_file=None, APP_ENV="test", REQUIRE_LIVENESS=True)


def _services(opened: bool = True, barrier_error: Exception | None = None):
    gate_logs = GateLogRepositoryFake()
    alert_repository = AlertRepositoryFake()
    alerts = AlertService(alert_repository, SequenceRepositoryFake(), RealtimePublisherFake())
    barrier_gateway = BarrierGatewayFake(opened, barrier_error)
    barrier = BarrierService(barrier_gateway, GateCommandRepositoryFake(), gate_logs, alerts)
    return gate_logs, alert_repository, alerts, barrier_gateway, barrier


class UnexpectedFaceGateway:
    async def extract(self, image: bytes):
        raise RuntimeError("Lỗi face gateway mô phỏng")


@pytest.mark.asyncio
async def test_gate_entry_opens_only_for_authorized_pair() -> None:
    driver = Driver("Tài xế", (1.0, 0.0), "test")
    vehicle = Vehicle("30A-12345", "30A12345", "truck")
    gate_logs, alerts_repo, alerts, barrier_gateway, barrier = _services()
    use_case = VerifyEntryUseCase(
        _settings(),
        DriverRepositoryFake(driver),
        VehicleRepositoryFake(vehicle),
        AuthorizationRepositoryFake(True),
        gate_logs,
        EvidenceStorageFake(),
        StaticPlateGateway("30A12345"),
        StaticFaceGateway((1.0, 0.0)),
        PlateMatchingService(90),
        FaceMatchingService(0.75),
        alerts,
        barrier,
    )

    output = await use_case.execute(
        GateVerificationInput(
            event_id="entry-event-001",
            gate_id="gate-in",
            plate_image=b"plate",
            face_image=b"face",
        )
    )
    duplicate = await use_case.execute(
        GateVerificationInput(
            event_id="entry-event-001",
            gate_id="gate-in",
            plate_image=b"plate-retry",
            face_image=b"face-retry",
        )
    )

    assert output.verification_status == VerificationStatus.PASSED
    assert output.permit_granted is True
    assert output.barrier_status == BarrierStatus.OPENED
    assert duplicate.gate_log_id == output.gate_log_id
    assert duplicate.permit_granted is True
    assert len(barrier_gateway.calls) == 1
    assert alerts_repo.items == []


@pytest.mark.asyncio
async def test_gate_entry_rejects_unauthorized_pair_without_barrier_call() -> None:
    driver = Driver("Tài xế", (1.0, 0.0), "test")
    vehicle = Vehicle("30A-12345", "30A12345", "truck")
    gate_logs, alerts_repo, alerts, barrier_gateway, barrier = _services()
    use_case = VerifyEntryUseCase(
        _settings(),
        DriverRepositoryFake(driver),
        VehicleRepositoryFake(vehicle),
        AuthorizationRepositoryFake(False),
        gate_logs,
        EvidenceStorageFake(),
        StaticPlateGateway("30A12345"),
        StaticFaceGateway((1.0, 0.0)),
        PlateMatchingService(90),
        FaceMatchingService(0.75),
        alerts,
        barrier,
    )

    output = await use_case.execute(
        GateVerificationInput(
            event_id="entry-event-002",
            gate_id="gate-in",
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert "DRIVER_VEHICLE_NOT_AUTHORIZED" in output.reason_codes
    assert barrier_gateway.calls == []
    assert len(alerts_repo.items) == 1


@pytest.mark.asyncio
async def test_gate_entry_rejects_face_mismatch() -> None:
    driver = Driver("Tài xế", (1.0, 0.0), "test")
    vehicle = Vehicle("30A-12345", "30A12345", "truck")
    gate_logs, alerts_repo, alerts, barrier_gateway, barrier = _services()
    use_case = VerifyEntryUseCase(
        _settings(),
        DriverRepositoryFake(driver),
        VehicleRepositoryFake(vehicle),
        AuthorizationRepositoryFake(True),
        gate_logs,
        EvidenceStorageFake(),
        StaticPlateGateway(vehicle.plate_normalized),
        StaticFaceGateway((0.0, 1.0)),
        PlateMatchingService(90),
        FaceMatchingService(0.75),
        alerts,
        barrier,
    )

    output = await use_case.execute(
        GateVerificationInput(
            event_id="entry-face-mismatch-001",
            gate_id="gate-in",
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert "FACE_NOT_MATCHED" in output.reason_codes
    assert barrier_gateway.calls == []
    assert len(alerts_repo.items) == 1


@pytest.mark.asyncio
async def test_gate_entry_accepts_unique_fuzzy_plate() -> None:
    driver = Driver("Tài xế", (1.0, 0.0), "test")
    vehicle = Vehicle("30A-1234568", "30A1234568", "truck")
    gate_logs, alerts_repo, alerts, barrier_gateway, barrier = _services()
    use_case = VerifyEntryUseCase(
        _settings(),
        DriverRepositoryFake(driver),
        VehicleRepositoryFake(vehicle),
        AuthorizationRepositoryFake(True),
        gate_logs,
        EvidenceStorageFake(),
        StaticPlateGateway("30A1234567"),
        StaticFaceGateway(driver.face_embedding),
        PlateMatchingService(90),
        FaceMatchingService(0.75),
        alerts,
        barrier,
    )

    output = await use_case.execute(
        GateVerificationInput(
            event_id="entry-fuzzy-plate-001",
            gate_id="gate-in",
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.PASSED
    assert output.permit_granted is True
    assert len(barrier_gateway.calls) == 1
    assert alerts_repo.items == []


@pytest.mark.asyncio
async def test_gate_entry_unexpected_ai_error_fails_closed() -> None:
    driver = Driver("Tài xế", (1.0, 0.0), "test")
    vehicle = Vehicle("30A-12345", "30A12345", "truck")
    gate_logs, alerts_repo, alerts, barrier_gateway, barrier = _services()
    use_case = VerifyEntryUseCase(
        _settings(),
        DriverRepositoryFake(driver),
        VehicleRepositoryFake(vehicle),
        AuthorizationRepositoryFake(True),
        gate_logs,
        EvidenceStorageFake(),
        StaticPlateGateway(vehicle.plate_normalized),
        UnexpectedFaceGateway(),
        PlateMatchingService(90),
        FaceMatchingService(0.75),
        alerts,
        barrier,
    )

    output = await use_case.execute(
        GateVerificationInput(
            event_id="entry-ai-error-001",
            gate_id="gate-in",
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "AI_PIPELINE_UNEXPECTED_ERROR" in output.reason_codes
    assert barrier_gateway.calls == []
    assert len(alerts_repo.items) == 1


@pytest.mark.asyncio
async def test_gate_entry_barrier_exception_fails_closed() -> None:
    driver = Driver("Tài xế", (1.0, 0.0), "test")
    vehicle = Vehicle("30A-12345", "30A12345", "truck")
    gate_logs, alerts_repo, alerts, barrier_gateway, barrier = _services(
        barrier_error=RuntimeError("Lỗi barrier mô phỏng")
    )
    use_case = VerifyEntryUseCase(
        _settings(),
        DriverRepositoryFake(driver),
        VehicleRepositoryFake(vehicle),
        AuthorizationRepositoryFake(True),
        gate_logs,
        EvidenceStorageFake(),
        StaticPlateGateway(vehicle.plate_normalized),
        StaticFaceGateway(driver.face_embedding),
        PlateMatchingService(90),
        FaceMatchingService(0.75),
        alerts,
        barrier,
    )

    output = await use_case.execute(
        GateVerificationInput(
            event_id="entry-barrier-error-001",
            gate_id="gate-in",
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.PASSED
    assert output.permit_granted is False
    assert output.barrier_status == BarrierStatus.FAILED
    assert len(barrier_gateway.calls) == 1
    assert any(item.alert_type == "GATE_FAILURE" for item in alerts_repo.items)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("barrier_opened", "expected_status"),
    [(True, OrderStatus.COMPLETED), (False, OrderStatus.SLIP_ISSUED)],
)
async def test_gate_exit_completes_order_only_after_barrier_ack(
    barrier_opened: bool, expected_status: OrderStatus
) -> None:
    now = datetime.now(UTC)
    driver = Driver("Tài xế", (1.0, 0.0), "test")
    vehicle = Vehicle("30A-12345", "30A12345", "truck")
    token = "signed-token"
    hasher = SecretHasher("test-session-secret-that-is-long-enough")
    claims = ExitSlipClaims(
        order_id="ORDER-EXIT",
        vehicle_id=vehicle.id,
        driver_id=driver.id,
        slip_version=1,
        jti="jti-1",
        issued_at=now,
        expires_at=now + timedelta(hours=1),
        kid="test-key",
    )
    order = WarehouseExitOrder(
        order_id=claims.order_id,
        assigned_driver_id=driver.id,
        assigned_vehicle_id=vehicle.id,
        cargo_metadata=[],
        valid_from=now - timedelta(minutes=1),
        valid_until=now + timedelta(hours=1),
        status=OrderStatus.SLIP_ISSUED,
        slip_version=1,
        slip_jti_hash=hasher.hash(claims.jti),
        slip_token_hash=hasher.hash(token),
    )
    orders = OrderRepositoryFake(order)
    gate_logs, alerts_repo, alerts, barrier_gateway, barrier = _services(barrier_opened)
    use_case = VerifyExitUseCase(
        _settings(),
        DriverRepositoryFake(driver),
        VehicleRepositoryFake(vehicle),
        orders,
        gate_logs,
        EvidenceStorageFake(),
        StaticPlateGateway(vehicle.plate_normalized),
        StaticFaceGateway(driver.face_embedding),
        StaticQrReader(token),
        StaticSlipGateway(claims),
        hasher,
        PlateMatchingService(90),
        FaceMatchingService(0.75),
        alerts,
        barrier,
        UnitOfWorkFake(),
    )

    output = await use_case.execute(
        ExitVerificationInput(
            event_id=f"exit-event-{barrier_opened}",
            gate_id="gate-out",
            plate_image=b"plate",
            face_image=b"face",
            slip_image=b"qr",
        )
    )

    assert order.status == expected_status
    assert output.permit_granted is barrier_opened
    assert len(barrier_gateway.calls) == 1
    if barrier_opened:
        assert alerts_repo.items == []
        replay = await use_case.execute(
            ExitVerificationInput(
                event_id="exit-event-replay",
                gate_id="gate-out",
                plate_image=b"plate",
                face_image=b"face",
                slip_image=b"qr",
            )
        )
        assert replay.verification_status == VerificationStatus.FAILED
        assert replay.permit_granted is False
        assert "ORDER_STATUS_INVALID" in replay.reason_codes
        assert len(barrier_gateway.calls) == 1
    else:
        assert order.exit_event_id is None
        assert any(item.alert_type == "GATE_FAILURE" for item in alerts_repo.items)


@pytest.mark.asyncio
async def test_gate_exit_rejects_claim_mismatch_as_critical_alert() -> None:
    now = datetime.now(UTC)
    driver = Driver("Tài xế", (1.0, 0.0), "test")
    vehicle = Vehicle("30A-12345", "30A12345", "truck")
    other_vehicle = Vehicle("30A-99999", "30A99999", "truck")
    hasher = SecretHasher("test-session-secret-that-is-long-enough")
    token = "signed-token"
    claims = ExitSlipClaims(
        "ORDER-MISMATCH",
        other_vehicle.id,
        driver.id,
        1,
        "jti-2",
        now,
        now + timedelta(hours=1),
        "test-key",
    )
    order = WarehouseExitOrder(
        claims.order_id,
        driver.id,
        vehicle.id,
        [],
        now - timedelta(minutes=1),
        now + timedelta(hours=1),
        status=OrderStatus.SLIP_ISSUED,
        slip_version=1,
        slip_jti_hash=hasher.hash(claims.jti),
        slip_token_hash=hasher.hash(token),
    )
    gate_logs, alerts_repo, alerts, barrier_gateway, barrier = _services()
    use_case = VerifyExitUseCase(
        _settings(),
        DriverRepositoryFake(driver),
        VehicleRepositoryFake(vehicle),
        OrderRepositoryFake(order),
        gate_logs,
        EvidenceStorageFake(),
        StaticPlateGateway(vehicle.plate_normalized),
        StaticFaceGateway(driver.face_embedding),
        StaticQrReader(token),
        StaticSlipGateway(claims),
        hasher,
        PlateMatchingService(90),
        FaceMatchingService(0.75),
        alerts,
        barrier,
        UnitOfWorkFake(),
    )

    output = await use_case.execute(
        ExitVerificationInput(
            event_id="exit-event-mismatch",
            gate_id="gate-out",
            plate_image=b"plate",
            face_image=b"face",
            slip_image=b"qr",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert "SLIP_VEHICLE_MISMATCH" in output.reason_codes
    assert barrier_gateway.calls == []
    assert alerts_repo.items[0].severity.value == "CRITICAL"


def test_gate_log_factor_output_preserves_audit_fields() -> None:
    card_id = uuid4()
    driver_id = uuid4()
    vehicle_id = uuid4()
    gate_log = GateLog(
        event_id="test-parking-event-001",
        direction=Direction.ENTRY,
        verification_status=VerificationStatus.PASSED,
        observed_plate="30A-12345",
        plate_score=95.0,
        plate_match_type=PlateMatchType.EXACT,
        face_similarity=0.88,
        verification_score=0.92,
        reason_codes=[],
        driver_id=driver_id,
        vehicle_id=vehicle_id,
        card_id=card_id,
        card_status=CardStatus.ACTIVE,
        card_verified=True,
        face_verified=True,
        plate_verified=True,
        authorization_verified=True,
        vehicle_type="sedan",
    )
    output = GateLogQueryService.output(gate_log)
    assert output.card_id == card_id
    assert output.card_status == CardStatus.ACTIVE
    assert output.card_verified is True
    assert output.face_verified is True
    assert output.plate_verified is True
    assert output.authorization_verified is True
    assert output.vehicle_type == "sedan"
    assert not hasattr(output, "card_uid")
    assert "card_uid" not in output.model_dump()
