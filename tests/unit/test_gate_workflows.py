from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from smart_gate.application.alerts import AlertService
from smart_gate.application.barrier import BarrierService
from smart_gate.application.dto import (
    ExitVerificationInput,
    GateVerificationInput,
    ParkingGateVerificationInput,
)
from smart_gate.application.gate_entry import VerifyEntryUseCase
from smart_gate.application.gate_exit import VerifyExitUseCase
from smart_gate.application.gate_logs import GateLogQueryService
from smart_gate.application.parking_gate import VerifyParkingGateUseCase
from smart_gate.config import Settings
from smart_gate.domain.entities import (
    Driver,
    EmployeeCard,
    ExitSlipClaims,
    GateLog,
    Vehicle,
    WarehouseExitOrder,
)
from smart_gate.domain.enums import (
    BarrierStatus,
    CardStatus,
    Direction,
    OrderStatus,
    PlateMatchType,
    RecordStatus,
    VerificationStatus,
)
from smart_gate.domain.exceptions import ConflictError, InfrastructureError, SmartGateError
from smart_gate.domain.services import FaceMatchingService, PlateMatchingService, normalize_card_uid
from smart_gate.infrastructure.security.crypto import SecretHasher
from tests.fakes import (
    AlertRepositoryFake,
    AuthorizationRepositoryFake,
    BarrierGatewayFake,
    DriverRepositoryFake,
    EmployeeCardRepositoryFake,
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


class UnexpectedEvidenceStorage:
    async def store(
        self,
        payload: bytes,
        *,
        category: str,
        correlation_id: str,
        content_type: str,
        extension: str,
    ) -> str:
        raise RuntimeError("Lỗi evidence store mô phỏng")

    async def read(self, object_key: str) -> bytes:
        raise RuntimeError("Lỗi evidence read mô phỏng")


@dataclass(slots=True)
class _ParkingHarness:
    use_case: VerifyParkingGateUseCase
    card: EmployeeCard
    driver: Driver
    vehicle: Vehicle
    gate_logs: GateLogRepositoryFake
    alerts_repo: AlertRepositoryFake
    alerts: AlertService
    barrier_gateway: BarrierGatewayFake
    barrier: BarrierService
    evidence: EvidenceStorageFake
    cards_repo: EmployeeCardRepositoryFake
    drivers_repo: DriverRepositoryFake


def _parking_setup(
    *,
    direction: Direction = Direction.ENTRY,
    card_uid: str = "CARD-1234",
    card_status: CardStatus = CardStatus.ACTIVE,
    driver: Driver | None = None,
    other_drivers: list[Driver] | None = None,
    vehicle: Vehicle | None = None,
    authorized: bool = True,
    observed_plate: str | None = None,
    plate_confidence: float = 0.99,
    observed_face_embedding: tuple[float, ...] | None = None,
    face_is_live: bool = True,
    face_detector_confidence: float = 0.99,
    evidence_storage=None,
    lpr_gateway=None,
    face_gateway=None,
    barrier_opened: bool = True,
    barrier_error: Exception | None = None,
) -> _ParkingHarness:
    if driver is None:
        driver = Driver("Tài xế", (1.0, 0.0), "test")
    if vehicle is None:
        vehicle = Vehicle("30A-12345", "30A12345", "sedan")

    card = EmployeeCard(
        card_uid=card_uid,
        card_uid_normalized=normalize_card_uid(card_uid),
        driver_id=driver.id,
        status=card_status,
    )
    cards_repo = EmployeeCardRepositoryFake(card)
    all_drivers = [driver] + (other_drivers or [])
    drivers_repo = DriverRepositoryFake(*all_drivers)
    vehicles_repo = VehicleRepositoryFake(vehicle)
    authorizations_repo = AuthorizationRepositoryFake(authorized)
    gate_logs, alerts_repo, alerts, barrier_gateway, barrier = _services(
        opened=barrier_opened, barrier_error=barrier_error
    )
    evidence = evidence_storage or EvidenceStorageFake()
    lpr = lpr_gateway or StaticPlateGateway(
        observed_plate if observed_plate is not None else vehicle.plate_normalized,
        confidence=plate_confidence,
    )
    face = face_gateway or StaticFaceGateway(
        observed_face_embedding if observed_face_embedding is not None else driver.face_embedding,
        is_live=face_is_live,
        detector_confidence=face_detector_confidence,
    )
    use_case = VerifyParkingGateUseCase(
        _settings(),
        cards_repo,
        drivers_repo,
        vehicles_repo,
        authorizations_repo,
        gate_logs,
        evidence,
        lpr,
        face,
        PlateMatchingService(90),
        FaceMatchingService(0.75),
        alerts,
        barrier,
    )
    return _ParkingHarness(
        use_case=use_case,
        card=card,
        driver=driver,
        vehicle=vehicle,
        gate_logs=gate_logs,
        alerts_repo=alerts_repo,
        alerts=alerts,
        barrier_gateway=barrier_gateway,
        barrier=barrier,
        evidence=evidence,
        cards_repo=cards_repo,
        drivers_repo=drivers_repo,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("direction", [Direction.ENTRY, Direction.EXIT])
async def test_parking_gate_opens_only_when_all_factors_match(direction: Direction) -> None:
    harness = _parking_setup(direction=direction)

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=direction,
            event_id=f"parking-event-pass-{direction.value.lower()}",
            gate_id=f"gate-{direction.value.lower()}",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.PASSED
    assert output.permit_granted is True
    assert output.barrier_status == BarrierStatus.OPENED
    assert output.direction == direction
    assert output.card_id == harness.card.id
    assert output.card_status == CardStatus.ACTIVE
    assert output.card_verified is True
    assert output.face_verified is True
    assert output.plate_verified is True
    assert output.authorization_verified is True
    assert output.vehicle_type == "sedan"
    assert output.driver_name == "Tài xế"
    assert len(harness.barrier_gateway.calls) == 1
    assert harness.alerts_repo.items == []


@pytest.mark.asyncio
async def test_parking_gate_duplicate_event_returns_same_log_and_one_barrier_call() -> None:
    harness = _parking_setup()

    payload1 = ParkingGateVerificationInput(
        direction=Direction.ENTRY,
        event_id="parking-event-duplicate-001",
        gate_id="gate-in",
        card_uid=harness.card.card_uid,
        plate_image=b"plate",
        face_image=b"face",
    )
    payload2 = ParkingGateVerificationInput(
        direction=Direction.ENTRY,
        event_id="parking-event-duplicate-001",
        gate_id="gate-in",
        card_uid=harness.card.card_uid,
        plate_image=b"plate-retry",
        face_image=b"face-retry",
    )
    out1 = await harness.use_case.execute(payload1)
    out2 = await harness.use_case.execute(payload2)

    assert out1.verification_status == VerificationStatus.PASSED
    assert out2.gate_log_id == out1.gate_log_id
    assert out2.permit_granted is True
    assert len(harness.barrier_gateway.calls) == 1


@pytest.mark.asyncio
async def test_parking_gate_rejects_event_id_reused_for_other_direction() -> None:
    harness = _parking_setup()

    entry_payload = ParkingGateVerificationInput(
        direction=Direction.ENTRY,
        event_id="parking-conflict-001",
        gate_id="gate-in",
        card_uid=harness.card.card_uid,
        plate_image=b"plate",
        face_image=b"face",
    )
    exit_payload = ParkingGateVerificationInput(
        direction=Direction.EXIT,
        event_id="parking-conflict-001",
        gate_id="gate-out",
        card_uid=harness.card.card_uid,
        plate_image=b"plate",
        face_image=b"face",
    )
    await harness.use_case.execute(entry_payload)

    with pytest.raises(ConflictError) as exc_info:
        await harness.use_case.execute(exit_payload)
    assert exc_info.value.code == "EVENT_ID_WORKFLOW_CONFLICT"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [CardStatus.BLOCKED, CardStatus.LOST, CardStatus.REPLACED])
async def test_parking_gate_rejects_non_active_card_before_ai(status: CardStatus) -> None:
    harness = _parking_setup(card_status=status)

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id=f"parking-inactive-card-{status.value.lower()}",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "CARD_NOT_ACTIVE" in output.reason_codes
    assert output.card_id == harness.card.id
    assert output.card_status == status
    assert output.card_verified is False
    assert len(harness.evidence.items) == 0
    assert len(harness.barrier_gateway.calls) == 0
    assert len(harness.alerts_repo.items) == 1


@pytest.mark.asyncio
async def test_parking_gate_rejects_unknown_card_before_ai() -> None:
    harness = _parking_setup()

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-unknown-card-001",
            gate_id="gate-in",
            card_uid="UNKNOWN-9999",
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "CARD_NOT_FOUND" in output.reason_codes
    assert output.card_verified is False
    assert len(harness.evidence.items) == 0
    assert len(harness.barrier_gateway.calls) == 0
    assert len(harness.alerts_repo.items) == 1


@pytest.mark.asyncio
async def test_parking_gate_rejects_missing_card_owner() -> None:
    harness = _parking_setup()

    missing_driver_id = uuid4()
    orphan_card = EmployeeCard(
        card_uid="ORPHAN-CARD",
        card_uid_normalized="ORPHANCARD",
        driver_id=missing_driver_id,
        status=CardStatus.ACTIVE,
    )
    await harness.cards_repo.add(orphan_card)

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-missing-owner-001",
            gate_id="gate-in",
            card_uid="ORPHAN-CARD",
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "CARD_OWNER_NOT_FOUND" in output.reason_codes
    assert output.card_verified is True
    assert len(harness.evidence.items) == 0
    assert len(harness.barrier_gateway.calls) == 0
    assert len(harness.alerts_repo.items) == 1


@pytest.mark.asyncio
async def test_parking_gate_rejects_inactive_card_owner() -> None:
    inactive_driver = Driver("Tài xế nghỉ việc", (1.0, 0.0), "test", status=RecordStatus.INACTIVE)
    harness = _parking_setup(driver=inactive_driver)

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-inactive-owner-001",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "CARD_OWNER_INACTIVE" in output.reason_codes
    assert output.card_verified is True
    assert len(harness.evidence.items) == 0
    assert len(harness.barrier_gateway.calls) == 0
    assert len(harness.alerts_repo.items) == 1


@pytest.mark.asyncio
async def test_parking_gate_compares_face_only_with_card_owner() -> None:
    card_owner = Driver("Chủ Thẻ", (1.0, 0.0), "test")
    other_driver = Driver("Người Khác", (0.0, 1.0), "test")
    harness = _parking_setup(
        driver=card_owner,
        other_drivers=[other_driver],
        observed_face_embedding=(0.0, 1.0),
    )

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-face-mismatch-001",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "FACE_NOT_CARD_OWNER" in output.reason_codes
    assert output.face_verified is False
    assert output.card_verified is True
    assert output.plate_verified is True
    assert output.driver_id == card_owner.id
    assert len(harness.barrier_gateway.calls) == 0
    assert len(harness.alerts_repo.items) == 1


@pytest.mark.asyncio
async def test_parking_gate_rejects_low_confidence_face() -> None:
    harness = _parking_setup(face_detector_confidence=0.5)

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-low-conf-face-001",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "FACE_LOW_CONFIDENCE" in output.reason_codes
    assert output.face_verified is False
    assert len(harness.barrier_gateway.calls) == 0


@pytest.mark.asyncio
async def test_parking_gate_rejects_face_spoof() -> None:
    harness = _parking_setup(face_is_live=False)

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-face-spoof-001",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "FACE_SPOOF" in output.reason_codes
    assert output.face_verified is False
    assert len(harness.barrier_gateway.calls) == 0


@pytest.mark.asyncio
async def test_parking_gate_rejects_unreadable_or_unregistered_plate() -> None:
    harness = _parking_setup(observed_plate="99Z-99999")

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-unreg-plate-001",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "VEHICLE_NOT_MATCHED" in output.reason_codes
    assert output.plate_verified is False
    assert len(harness.barrier_gateway.calls) == 0


@pytest.mark.asyncio
async def test_parking_gate_rejects_unauthorized_owner_vehicle_pair() -> None:
    harness = _parking_setup(authorized=False)

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-unauthorized-001",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "DRIVER_VEHICLE_NOT_AUTHORIZED" in output.reason_codes
    assert output.authorization_verified is False
    assert output.card_verified is True
    assert output.face_verified is True
    assert output.plate_verified is True
    assert len(harness.barrier_gateway.calls) == 0
    assert len(harness.alerts_repo.items) == 1


@pytest.mark.asyncio
async def test_parking_gate_ai_exception_fails_closed() -> None:
    harness = _parking_setup(face_gateway=UnexpectedFaceGateway())

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-ai-error-001",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "AI_PIPELINE_UNEXPECTED_ERROR" in output.reason_codes
    assert len(harness.barrier_gateway.calls) == 0
    assert len(harness.alerts_repo.items) == 1


@pytest.mark.asyncio
async def test_parking_gate_evidence_exception_fails_closed() -> None:
    harness = _parking_setup(evidence_storage=UnexpectedEvidenceStorage())

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-evidence-error-001",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "EVIDENCE_STORE_UNEXPECTED_ERROR" in output.reason_codes
    assert len(harness.barrier_gateway.calls) == 0
    assert len(harness.alerts_repo.items) == 1


@pytest.mark.asyncio
async def test_parking_gate_barrier_exception_keeps_permit_closed() -> None:
    harness = _parking_setup(barrier_error=RuntimeError("Lỗi barrier mô phỏng"))

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-barrier-error-001",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.PASSED
    assert output.permit_granted is False
    assert output.barrier_status == BarrierStatus.FAILED
    assert len(harness.barrier_gateway.calls) == 1
    assert any(item.alert_type == "GATE_FAILURE" for item in harness.alerts_repo.items)


@pytest.mark.asyncio
async def test_parking_gate_returns_registered_vehicle_type() -> None:
    suv_vehicle = Vehicle("51F-99999", "51F99999", "electric_suv")
    harness = _parking_setup(vehicle=suv_vehicle)

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-veh-type-001",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.PASSED
    assert output.vehicle_type == "electric_suv"


@pytest.mark.asyncio
async def test_parking_gate_rejects_invalid_card_uid() -> None:
    harness = _parking_setup()

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-invalid-uid-001",
            gate_id="gate-in",
            card_uid="---A",
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "CARD_UID_INVALID" in output.reason_codes
    assert output.card_verified is False
    assert len(harness.evidence.items) == 0
    assert len(harness.barrier_gateway.calls) == 0
    assert len(harness.alerts_repo.items) == 1


@pytest.mark.asyncio
async def test_parking_gate_rejects_low_confidence_plate() -> None:
    harness = _parking_setup(plate_confidence=0.4)

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-low-conf-plate-001",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.FAILED
    assert output.permit_granted is False
    assert "PLATE_LOW_CONFIDENCE" in output.reason_codes
    assert output.plate_verified is False
    assert len(harness.barrier_gateway.calls) == 0
    assert len(harness.alerts_repo.items) == 1


class _AdapterEvidenceStorageError:
    async def store(
        self,
        payload: bytes,
        *,
        category: str,
        correlation_id: str,
        content_type: str,
        extension: str,
    ) -> str:
        raise InfrastructureError("EVIDENCE_STORE_FAILED", "MinIO cluster unavailable")

    async def read(self, object_key: str) -> bytes:
        raise InfrastructureError("EVIDENCE_READ_FAILED", "MinIO cluster unavailable")


class _AdapterPlateError:
    async def recognize(self, image: bytes):
        raise SmartGateError("PLATE_NOT_FOUND", "Không phát hiện được biển số", status_code=422)


class _AdapterAlprLoadError:
    async def recognize(self, image: bytes):
        raise InfrastructureError("ALPR_LOAD_FAILED", "Không thể nạp model FastALPR")


class _AdapterPaddleOcrError:
    async def recognize(self, image: bytes):
        raise InfrastructureError("PADDLE_OCR_FAILED", "PaddleOCR xử lý ký tự thất bại")


class _AdapterFaceError:
    async def extract(self, image: bytes):
        raise SmartGateError("FACE_NOT_FOUND", "Không phát hiện được khuôn mặt", status_code=422)


class _AdapterArbitrarySmartGateError:
    async def extract(self, image: bytes):
        raise SmartGateError("CUSTOM_VISION_CRASH", "Custom model error", status_code=500)


@pytest.mark.asyncio
async def test_parking_gate_maps_production_adapter_errors() -> None:
    # 1. Evidence storage error -> EVIDENCE_STORE_UNEXPECTED_ERROR
    harness_ev = _parking_setup(evidence_storage=_AdapterEvidenceStorageError())
    out_ev = await harness_ev.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-adapter-ev-001",
            gate_id="gate-in",
            card_uid=harness_ev.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )
    assert out_ev.verification_status == VerificationStatus.FAILED
    assert "EVIDENCE_STORE_UNEXPECTED_ERROR" in out_ev.reason_codes
    assert "EVIDENCE_STORE_FAILED" not in out_ev.reason_codes

    # 2. Plate genuine no-detection -> VEHICLE_NOT_MATCHED
    harness_plate = _parking_setup(lpr_gateway=_AdapterPlateError())
    out_plate = await harness_plate.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-adapter-plate-001",
            gate_id="gate-in",
            card_uid=harness_plate.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )
    assert out_plate.verification_status == VerificationStatus.FAILED
    assert "VEHICLE_NOT_MATCHED" in out_plate.reason_codes
    assert "PLATE_NOT_FOUND" not in out_plate.reason_codes
    assert "AI_PIPELINE_UNEXPECTED_ERROR" not in out_plate.reason_codes
    assert len(harness_plate.alerts_repo.items) == 1
    assert harness_plate.alerts_repo.items[0].alert_type == "ENTRY_MISMATCH"

    # 2b. ALPR load infrastructure failure -> AI_PIPELINE_UNEXPECTED_ERROR + ENTRY_PROCESSING_FAILED
    harness_alpr = _parking_setup(lpr_gateway=_AdapterAlprLoadError())
    out_alpr = await harness_alpr.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-adapter-alpr-001",
            gate_id="gate-in",
            card_uid=harness_alpr.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )
    assert out_alpr.verification_status == VerificationStatus.FAILED
    assert "AI_PIPELINE_UNEXPECTED_ERROR" in out_alpr.reason_codes
    assert "VEHICLE_NOT_MATCHED" not in out_alpr.reason_codes
    assert len(harness_alpr.alerts_repo.items) == 1
    assert harness_alpr.alerts_repo.items[0].alert_type == "ENTRY_PROCESSING_FAILED"

    # 2c. Paddle OCR infrastructure failure -> AI_PIPELINE_UNEXPECTED_ERROR + ENTRY_PROCESSING_FAILED
    harness_ocr = _parking_setup(lpr_gateway=_AdapterPaddleOcrError())
    out_ocr = await harness_ocr.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-adapter-ocr-001",
            gate_id="gate-in",
            card_uid=harness_ocr.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )
    assert out_ocr.verification_status == VerificationStatus.FAILED
    assert "AI_PIPELINE_UNEXPECTED_ERROR" in out_ocr.reason_codes
    assert "VEHICLE_NOT_MATCHED" not in out_ocr.reason_codes
    assert len(harness_ocr.alerts_repo.items) == 1
    assert harness_ocr.alerts_repo.items[0].alert_type == "ENTRY_PROCESSING_FAILED"

    # 2d. Exit direction ALPR infrastructure failure -> EXIT_PROCESSING_FAILED
    harness_exit_alpr = _parking_setup(lpr_gateway=_AdapterAlprLoadError())
    out_exit_alpr = await harness_exit_alpr.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.EXIT,
            event_id="parking-adapter-alpr-exit-001",
            gate_id="gate-out",
            card_uid=harness_exit_alpr.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )
    assert out_exit_alpr.verification_status == VerificationStatus.FAILED
    assert "AI_PIPELINE_UNEXPECTED_ERROR" in out_exit_alpr.reason_codes
    assert "VEHICLE_NOT_MATCHED" not in out_exit_alpr.reason_codes
    assert len(harness_exit_alpr.alerts_repo.items) == 1
    assert harness_exit_alpr.alerts_repo.items[0].alert_type == "EXIT_PROCESSING_FAILED"

    # 3. Face error -> AI_PIPELINE_UNEXPECTED_ERROR
    harness_face = _parking_setup(face_gateway=_AdapterFaceError())
    out_face = await harness_face.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-adapter-face-001",
            gate_id="gate-in",
            card_uid=harness_face.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )
    assert out_face.verification_status == VerificationStatus.FAILED
    assert "AI_PIPELINE_UNEXPECTED_ERROR" in out_face.reason_codes
    assert "FACE_NOT_FOUND" not in out_face.reason_codes

    # 4. Any other SmartGateError -> AI_PIPELINE_UNEXPECTED_ERROR
    harness_other = _parking_setup(face_gateway=_AdapterArbitrarySmartGateError())
    out_other = await harness_other.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-adapter-other-001",
            gate_id="gate-in",
            card_uid=harness_other.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )
    assert out_other.verification_status == VerificationStatus.FAILED
    assert "AI_PIPELINE_UNEXPECTED_ERROR" in out_other.reason_codes
    assert "CUSTOM_VISION_CRASH" not in out_other.reason_codes


class _ConcurrentRaceGateLogRepo(GateLogRepositoryFake):
    def __init__(self, competing_direction: Direction) -> None:
        super().__init__()
        self.competing_direction = competing_direction
        self._first_lookup = True

    async def get_by_event_id(self, event_id: str) -> GateLog | None:
        if self._first_lookup:
            self._first_lookup = False
            return None
        return await super().get_by_event_id(event_id)

    async def add(self, gate_log: GateLog) -> GateLog:
        if gate_log.event_id not in self.items:
            competing_log = GateLog(
                event_id=gate_log.event_id,
                direction=self.competing_direction,
                verification_status=VerificationStatus.PASSED,
                observed_plate="30A12345",
                plate_score=1.0,
                plate_match_type=PlateMatchType.EXACT,
                face_similarity=1.0,
                verification_score=1.0,
                reason_codes=["ALL_CHECKS_PASSED"],
                threshold_version="v1",
            )
            self.items[gate_log.event_id] = competing_log
        return await super().add(gate_log)


@pytest.mark.asyncio
async def test_parking_gate_concurrent_cross_direction_raises_conflict() -> None:
    # 1. Success path concurrent race
    driver = Driver("Tài xế", (1.0, 0.0), "test")
    vehicle = Vehicle("30A-12345", "30A12345", "sedan")
    card = EmployeeCard(
        card_uid="CARD-1234",
        card_uid_normalized="CARD1234",
        driver_id=driver.id,
        status=CardStatus.ACTIVE,
    )
    cards_repo = EmployeeCardRepositoryFake(card)
    drivers_repo = DriverRepositoryFake(driver)
    vehicles_repo = VehicleRepositoryFake(vehicle)
    authorizations_repo = AuthorizationRepositoryFake(True)
    race_logs = _ConcurrentRaceGateLogRepo(competing_direction=Direction.EXIT)
    alerts_repo = AlertRepositoryFake()
    alerts = AlertService(alerts_repo, SequenceRepositoryFake(), RealtimePublisherFake())
    barrier_gateway = BarrierGatewayFake(True)
    barrier = BarrierService(barrier_gateway, GateCommandRepositoryFake(), race_logs, alerts)
    use_case = VerifyParkingGateUseCase(
        _settings(),
        cards_repo,
        drivers_repo,
        vehicles_repo,
        authorizations_repo,
        race_logs,
        EvidenceStorageFake(),
        StaticPlateGateway("30A12345"),
        StaticFaceGateway((1.0, 0.0)),
        PlateMatchingService(90),
        FaceMatchingService(0.75),
        alerts,
        barrier,
    )

    with pytest.raises(ConflictError) as exc_info:
        await use_case.execute(
            ParkingGateVerificationInput(
                direction=Direction.ENTRY,
                event_id="concurrent-cross-001",
                gate_id="gate-in",
                card_uid=card.card_uid,
                plate_image=b"plate",
                face_image=b"face",
            )
        )
    assert exc_info.value.code == "EVENT_ID_WORKFLOW_CONFLICT"

    # 2. Failed path concurrent race (e.g. invalid card UID)
    race_logs_failed = _ConcurrentRaceGateLogRepo(competing_direction=Direction.EXIT)
    barrier_failed = BarrierService(
        barrier_gateway, GateCommandRepositoryFake(), race_logs_failed, alerts
    )
    use_case_failed = VerifyParkingGateUseCase(
        _settings(),
        cards_repo,
        drivers_repo,
        vehicles_repo,
        authorizations_repo,
        race_logs_failed,
        EvidenceStorageFake(),
        StaticPlateGateway("30A12345"),
        StaticFaceGateway((1.0, 0.0)),
        PlateMatchingService(90),
        FaceMatchingService(0.75),
        alerts,
        barrier_failed,
    )
    with pytest.raises(ConflictError) as exc_info_failed:
        await use_case_failed.execute(
            ParkingGateVerificationInput(
                direction=Direction.ENTRY,
                event_id="concurrent-cross-002",
                gate_id="gate-in",
                card_uid="---A",
                plate_image=b"plate",
                face_image=b"face",
            )
        )
    assert exc_info_failed.value.code == "EVENT_ID_WORKFLOW_CONFLICT"


@pytest.mark.asyncio
async def test_parking_gate_barrier_no_ack_keeps_permit_closed() -> None:
    harness = _parking_setup(barrier_opened=False)

    output = await harness.use_case.execute(
        ParkingGateVerificationInput(
            direction=Direction.ENTRY,
            event_id="parking-barrier-no-ack-001",
            gate_id="gate-in",
            card_uid=harness.card.card_uid,
            plate_image=b"plate",
            face_image=b"face",
        )
    )

    assert output.verification_status == VerificationStatus.PASSED
    assert output.permit_granted is False
    assert output.barrier_status == BarrierStatus.FAILED
    assert len(harness.barrier_gateway.calls) == 1
    assert any(item.alert_type == "GATE_FAILURE" for item in harness.alerts_repo.items)


@pytest.mark.asyncio
async def test_gate_router_rejects_malformed_card_uid_without_leak() -> None:
    from types import SimpleNamespace

    from httpx import ASGITransport, AsyncClient

    from smart_gate.domain.entities import User
    from smart_gate.domain.enums import UserRole
    from smart_gate.main import create_app
    from smart_gate.presentation.dependencies import get_container
    from smart_gate.presentation.routers.gates import router as gates_router

    settings = Settings(_env_file=None, APP_ENV="test")
    app = create_app(settings)
    user = User(id=uuid4(), username="admin", password_hash="hash", role=UserRole.ADMIN)
    for r in gates_router.routes:
        for d in r.dependant.dependencies:
            if d.call and d.call.__name__ == "authorize":
                app.dependency_overrides[d.call] = lambda: user
    app.dependency_overrides[get_container] = lambda: SimpleNamespace(settings=settings)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Too short (< 4 chars)
        res_short = await client.post(
            "/api/v1/gates/entry/verifications",
            data={"event_id": "event-12345678", "gate_id": "gate-1", "card_uid": "ab"},
            files={
                "plate_image": ("p.jpg", b"plate", "image/jpeg"),
                "face_image": ("f.jpg", b"face", "image/jpeg"),
            },
        )
        assert res_short.status_code == 422
        assert res_short.json()["error"]["code"] == "CARD_UID_INVALID"
        assert "ab" not in res_short.text

        # Too long (> 128 chars)
        long_uid = "x" * 150
        res_long = await client.post(
            "/api/v1/gates/entry/verifications",
            data={"event_id": "event-12345678", "gate_id": "gate-1", "card_uid": long_uid},
            files={
                "plate_image": ("p.jpg", b"plate", "image/jpeg"),
                "face_image": ("f.jpg", b"face", "image/jpeg"),
            },
        )
        assert res_long.status_code == 422
        assert res_long.json()["error"]["code"] == "CARD_UID_INVALID"
        assert long_uid not in res_long.text
