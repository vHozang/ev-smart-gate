from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import UUID

from smart_gate.domain.entities import (
    CargoDetection,
    DockInspection,
    Driver,
    DriverVehicleAuthorization,
    EmployeeCard,
    ExitSlipArtifacts,
    ExitSlipClaims,
    FaceObservation,
    GateCommand,
    GateLog,
    PlateObservation,
    SecurityAlert,
    Vehicle,
    WarehouseExitOrder,
)
from smart_gate.domain.enums import (
    AlertStatus,
    CardStatus,
    Direction,
    OrderStatus,
    RecordStatus,
    VerificationStatus,
)
from smart_gate.domain.exceptions import ConflictError


class DriverRepositoryFake:
    def __init__(self, *drivers: Driver) -> None:
        self.items = {item.id: item for item in drivers}

    async def add(self, driver: Driver) -> Driver:
        self.items[driver.id] = driver
        return driver

    async def get(self, driver_id: UUID) -> Driver | None:
        return self.items.get(driver_id)

    async def list_active(self) -> list[Driver]:
        return [item for item in self.items.values() if item.status == RecordStatus.ACTIVE]

    async def list_all(self) -> list[Driver]:
        return list(self.items.values())

    async def update(self, driver: Driver) -> Driver:
        self.items[driver.id] = driver
        return driver


class VehicleRepositoryFake:
    def __init__(self, *vehicles: Vehicle) -> None:
        self.items = {item.id: item for item in vehicles}

    async def add(self, vehicle: Vehicle) -> Vehicle:
        self.items[vehicle.id] = vehicle
        return vehicle

    async def get(self, vehicle_id: UUID) -> Vehicle | None:
        return self.items.get(vehicle_id)

    async def get_by_plate(self, plate_normalized: str) -> Vehicle | None:
        return next(
            (item for item in self.items.values() if item.plate_normalized == plate_normalized),
            None,
        )

    async def list_active(self) -> list[Vehicle]:
        return [item for item in self.items.values() if item.status == RecordStatus.ACTIVE]

    async def list_all(self) -> list[Vehicle]:
        return list(self.items.values())

    async def update(self, vehicle: Vehicle) -> Vehicle:
        self.items[vehicle.id] = vehicle
        return vehicle


class AuthorizationRepositoryFake:
    def __init__(self, authorized: bool = True) -> None:
        self.authorized = authorized
        self.items: list[DriverVehicleAuthorization] = []

    async def add(self, authorization: DriverVehicleAuthorization) -> DriverVehicleAuthorization:
        self.items.append(authorization)
        return authorization

    async def is_authorized(self, driver_id: UUID, vehicle_id: UUID, at: datetime) -> bool:
        return self.authorized

    async def revoke(self, driver_id: UUID, vehicle_id: UUID) -> bool:
        self.authorized = False
        return True

    async def list_all(self) -> list[DriverVehicleAuthorization]:
        return self.items


class GateLogRepositoryFake:
    def __init__(self) -> None:
        self.items: dict[str, GateLog] = {}

    async def add(self, gate_log: GateLog) -> GateLog:
        return self.items.setdefault(gate_log.event_id, gate_log)

    async def get_by_event_id(self, event_id: str) -> GateLog | None:
        return self.items.get(event_id)

    async def get(self, gate_log_id: UUID) -> GateLog | None:
        return next((item for item in self.items.values() if item.id == gate_log_id), None)

    async def update(self, gate_log: GateLog) -> GateLog:
        self.items[gate_log.event_id] = gate_log
        return gate_log

    async def list_recent(
        self,
        limit: int = 100,
        direction: Direction | None = None,
        verification_status: VerificationStatus | None = None,
    ) -> list[GateLog]:
        items = [
            item
            for item in self.items.values()
            if (direction is None or item.direction == direction)
            and (verification_status is None or item.verification_status == verification_status)
        ]
        return sorted(
            items,
            key=lambda item: item.occurred_at or datetime.min,
            reverse=True,
        )[:limit]

    async def latest_passed_entry(self, driver_id: UUID, vehicle_id: UUID) -> GateLog | None:
        candidates = [
            item
            for item in self.items.values()
            if item.direction == Direction.ENTRY
            and item.driver_id == driver_id
            and item.vehicle_id == vehicle_id
        ]
        return (
            max(candidates, key=lambda item: item.occurred_at or datetime.min)
            if candidates
            else None
        )


class OrderRepositoryFake:
    def __init__(self, *orders: WarehouseExitOrder) -> None:
        self.items = {item.order_id: item for item in orders}

    async def add(self, order: WarehouseExitOrder) -> WarehouseExitOrder:
        self.items[order.order_id] = order
        return order

    async def get_by_order_id(self, order_id: str) -> WarehouseExitOrder | None:
        return self.items.get(order_id)

    async def list_all(self) -> list[WarehouseExitOrder]:
        return list(self.items.values())

    async def update(self, order: WarehouseExitOrder) -> WarehouseExitOrder:
        self.items[order.order_id] = order
        return order

    async def claim_exit(self, order_id: str, event_id: str) -> WarehouseExitOrder | None:
        order = self.items.get(order_id)
        if order is None or order.status != OrderStatus.SLIP_ISSUED:
            return None
        if order.exit_event_id not in {None, event_id}:
            return None
        order.exit_event_id = event_id
        return order

    async def release_exit(self, order_id: str, event_id: str) -> None:
        order = self.items.get(order_id)
        if order is not None and order.exit_event_id == event_id:
            order.exit_event_id = None

    async def complete_exit(
        self, order_id: str, event_id: str, completed_at: datetime
    ) -> WarehouseExitOrder | None:
        order = self.items.get(order_id)
        if order is None or order.exit_event_id != event_id:
            return None
        order.status = OrderStatus.COMPLETED
        order.completed_at = completed_at
        return order


class EvidenceStorageFake:
    def __init__(self) -> None:
        self.items: dict[str, bytes] = {}

    async def store(
        self,
        payload: bytes,
        *,
        category: str,
        correlation_id: str,
        content_type: str,
        extension: str,
    ) -> str:
        key = f"{category}/{correlation_id}/{len(self.items)}.{extension}"
        self.items[key] = payload
        return key

    async def read(self, object_key: str) -> bytes:
        return self.items[object_key]


class StaticPlateGateway:
    def __init__(self, text: str, *, confidence: float = 0.99) -> None:
        self.text = text
        self.confidence = confidence

    async def recognize(self, image: bytes) -> PlateObservation:
        return PlateObservation(self.text, self.confidence, "test-lpr")


class StaticFaceGateway:
    def __init__(
        self,
        embedding: tuple[float, ...],
        *,
        is_live: bool = True,
        detector_confidence: float = 0.99,
        liveness_score: float = 0.99,
    ) -> None:
        self.embedding = embedding
        self.is_live = is_live
        self.detector_confidence = detector_confidence
        self.liveness_score = liveness_score

    async def extract(self, image: bytes) -> FaceObservation:
        return FaceObservation(
            self.embedding,
            self.detector_confidence,
            self.liveness_score,
            self.is_live,
            "test-face",
        )


class StaticQrReader:
    def __init__(self, token: str | None) -> None:
        self.token = token

    async def read_token(self, image: bytes) -> tuple[str | None, str | None]:
        return self.token, None


class StaticSlipGateway:
    def __init__(self, claims: ExitSlipClaims) -> None:
        self.claims = claims

    async def issue(
        self,
        order: WarehouseExitOrder,
        driver: Driver,
        vehicle: Vehicle,
        expires_at: datetime,
    ) -> ExitSlipArtifacts:
        return ExitSlipArtifacts("signed-token", self.claims, b"qr", b"html", b"pdf")

    async def verify(self, token: str) -> ExitSlipClaims:
        return self.claims


class AlertRepositoryFake:
    def __init__(self) -> None:
        self.items: list[SecurityAlert] = []

    async def add(self, alert: SecurityAlert) -> SecurityAlert:
        self.items.append(alert)
        return alert

    async def list_after(self, sequence: int, limit: int = 200) -> list[SecurityAlert]:
        return [item for item in self.items if item.sequence > sequence][:limit]

    async def get(self, alert_id: UUID) -> SecurityAlert | None:
        return next((item for item in self.items if item.id == alert_id), None)

    async def update_status(self, alert_id: UUID, status: AlertStatus) -> SecurityAlert | None:
        alert = await self.get(alert_id)
        if alert is not None:
            alert.status = status
        return alert


class SequenceRepositoryFake:
    def __init__(self) -> None:
        self.value = 0

    async def next(self, name: str) -> int:
        self.value += 1
        return self.value


class RealtimePublisherFake:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def publish(self, event: dict) -> None:
        self.events.append(event)

    async def subscribe(self) -> AsyncIterator[dict]:
        for event in self.events:
            yield event


class GateCommandRepositoryFake:
    def __init__(self) -> None:
        self.items: dict[str, GateCommand] = {}

    async def add(self, command: GateCommand) -> GateCommand:
        self.items[command.command_id] = command
        return command

    async def get_by_command_id(self, command_id: str) -> GateCommand | None:
        return self.items.get(command_id)

    async def update(self, command: GateCommand) -> GateCommand:
        self.items[command.command_id] = command
        return command


class BarrierGatewayFake:
    def __init__(self, opened: bool = True, error: Exception | None = None) -> None:
        self.opened = opened
        self.error = error
        self.calls: list[str] = []

    async def open(self, gate_id: str, command_id: str) -> bool:
        self.calls.append(command_id)
        if self.error is not None:
            raise self.error
        return self.opened


class UnitOfWorkFake:
    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[None]:
        yield


class DockRepositoryFake:
    def __init__(self) -> None:
        self.items: dict[UUID, DockInspection] = {}

    async def add(self, inspection: DockInspection) -> DockInspection:
        self.items[inspection.id] = inspection
        return inspection

    async def get(self, inspection_id: UUID) -> DockInspection | None:
        return self.items.get(inspection_id)

    async def list_recent(self, limit: int = 100) -> list[DockInspection]:
        return list(self.items.values())[:limit]

    async def update(self, inspection: DockInspection) -> DockInspection:
        self.items[inspection.id] = inspection
        return inspection


class EmployeeCardRepositoryFake:
    def __init__(self, *cards: EmployeeCard) -> None:
        self.items: dict[UUID, EmployeeCard] = {}
        self.by_uid: dict[str, EmployeeCard] = {}
        for card in cards:
            self.items[card.id] = card
            self.by_uid[card.card_uid_normalized] = card

    async def add(self, card: EmployeeCard) -> EmployeeCard:
        self.items[card.id] = card
        self.by_uid[card.card_uid_normalized] = card
        return card

    async def get(self, card_id: UUID) -> EmployeeCard | None:
        return self.items.get(card_id)

    async def get_by_uid(self, card_uid_normalized: str) -> EmployeeCard | None:
        return self.by_uid.get(card_uid_normalized)

    async def get_active_by_driver(self, driver_id: UUID) -> EmployeeCard | None:
        return next(
            (
                item
                for item in self.items.values()
                if item.driver_id == driver_id and item.status == CardStatus.ACTIVE
            ),
            None,
        )

    async def list_by_driver(self, driver_id: UUID) -> list[EmployeeCard]:
        return [item for item in self.items.values() if item.driver_id == driver_id]

    async def list_all(self) -> list[EmployeeCard]:
        return list(self.items.values())

    async def change_active_status(
        self,
        card_id: UUID,
        target: CardStatus,
        status_reason: str,
        updated_at: datetime,
    ) -> EmployeeCard | None:
        card = self.items.get(card_id)
        if card is None or card.status != CardStatus.ACTIVE:
            return None
        card.status = target
        card.status_reason = status_reason
        card.updated_at = updated_at
        return card

    async def replace_active(
        self,
        replacement: EmployeeCard,
        expected_active_card_id: UUID | None,
        replaced_at: datetime,
        status_reason: str,
    ) -> tuple[EmployeeCard, EmployeeCard | None]:
        current = await self.get_active_by_driver(replacement.driver_id)
        current_id = current.id if current is not None else None
        if current_id != expected_active_card_id:
            raise ConflictError("CARD_REPLACEMENT_CONFLICT", "Thẻ đang hoạt động vừa thay đổi")

        if current is not None:
            current.status = CardStatus.REPLACED
            current.status_reason = status_reason
            current.updated_at = replaced_at
            current.replaced_by_card_id = replacement.id
            replacement.replaces_card_id = current.id

        await self.add(replacement)
        return replacement, current


class CargoGatewayFake:
    async def detect(self, image: bytes) -> list[CargoDetection]:
        return [
            CargoDetection(
                class_name="pallet",
                confidence=0.98,
                bounding_box={"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8},
                model_version="test-cargo",
            )
        ]
