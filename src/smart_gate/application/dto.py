from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from smart_gate.domain.enums import (
    BarrierStatus,
    CardStatus,
    CargoState,
    Direction,
    DockStatus,
    OrderStatus,
    PlateMatchType,
    UserRole,
    VerificationStatus,
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CreateDriverInput(StrictModel):
    full_name: str = Field(min_length=2, max_length=200)
    employee_code: str | None = Field(None, max_length=64)
    phone: str | None = Field(None, max_length=32)


class CreateVehicleInput(StrictModel):
    plate_number: str = Field(min_length=4, max_length=32)
    vehicle_type: str = Field(min_length=2, max_length=64)
    make: str | None = Field(None, max_length=100)
    model: str | None = Field(None, max_length=100)
    color: str | None = Field(None, max_length=64)
    metadata: dict[str, Any] = Field(default_factory=dict)


class UpdateDriverInput(StrictModel):
    full_name: str | None = Field(None, min_length=2, max_length=200)
    employee_code: str | None = Field(None, max_length=64)
    phone: str | None = Field(None, max_length=32)


class UpdateVehicleInput(StrictModel):
    plate_number: str | None = Field(None, min_length=4, max_length=32)
    vehicle_type: str | None = Field(None, min_length=2, max_length=64)
    make: str | None = Field(None, max_length=100)
    model: str | None = Field(None, max_length=100)
    color: str | None = Field(None, max_length=64)
    metadata: dict[str, Any] | None = None


class IssueEmployeeCardInput(StrictModel):
    driver_id: UUID
    card_uid: str = Field(min_length=4, max_length=128)
    status_reason: str | None = Field(None, max_length=500)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReplaceEmployeeCardInput(StrictModel):
    card_uid: str = Field(min_length=4, max_length=128)
    status_reason: str = Field(min_length=2, max_length=500)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChangeEmployeeCardStatusInput(StrictModel):
    status_reason: str = Field(min_length=2, max_length=500)


class CreateAuthorizationInput(StrictModel):
    driver_id: UUID
    vehicle_id: UUID
    valid_from: datetime
    valid_until: datetime | None = None

    @model_validator(mode="after")
    def validate_window(self) -> CreateAuthorizationInput:
        if self.valid_until is not None and self.valid_until <= self.valid_from:
            raise ValueError("valid_until phải lớn hơn valid_from")
        return self


class GateVerificationInput(StrictModel):
    event_id: str = Field(min_length=8, max_length=128)
    gate_id: str = Field(min_length=1, max_length=128)
    plate_image: bytes
    face_image: bytes


class ExitVerificationInput(GateVerificationInput):
    slip_image: bytes


class ParkingGateVerificationInput(StrictModel):
    direction: Direction
    event_id: str = Field(min_length=8, max_length=128)
    gate_id: str = Field(min_length=1, max_length=128)
    card_uid: str = Field(min_length=4, max_length=128)
    plate_image: bytes
    face_image: bytes


class VerificationOutput(StrictModel):
    gate_log_id: UUID
    event_id: str
    direction: Direction
    verification_status: VerificationStatus
    permit_granted: bool
    driver_id: UUID | None
    vehicle_id: UUID | None
    order_id: str | None
    observed_plate: str
    plate_score: float
    face_similarity: float
    verification_score: float
    reason_codes: list[str]
    barrier_status: BarrierStatus
    alert_id: UUID | None = None
    card_id: UUID | None = None
    card_status: CardStatus | None = None
    card_verified: bool = False
    face_verified: bool = False
    plate_verified: bool = False
    authorization_verified: bool = False
    driver_name: str | None = None
    vehicle_type: str | None = None


class GateLogOutput(StrictModel):
    id: UUID
    event_id: str
    direction: Direction
    verification_status: VerificationStatus
    observed_plate: str
    plate_score: float
    plate_match_type: PlateMatchType
    face_similarity: float
    verification_score: float
    reason_codes: list[str]
    driver_id: UUID | None
    vehicle_id: UUID | None
    order_id: str | None
    snapshot_count: int
    barrier_status: BarrierStatus
    model_versions: dict[str, str]
    threshold_version: str
    occurred_at: datetime | None
    completed_at: datetime | None
    card_id: UUID | None = None
    card_status: CardStatus | None = None
    card_verified: bool = False
    face_verified: bool = False
    plate_verified: bool = False
    authorization_verified: bool = False
    vehicle_type: str | None = None


class CreateOrderInput(StrictModel):
    order_id: str = Field(min_length=3, max_length=128)
    assigned_driver_id: UUID
    assigned_vehicle_id: UUID
    cargo_metadata: list[dict[str, Any]] = Field(default_factory=list)
    valid_from: datetime
    valid_until: datetime

    @model_validator(mode="after")
    def validate_window(self) -> CreateOrderInput:
        if self.valid_until <= self.valid_from:
            raise ValueError("valid_until phải lớn hơn valid_from")
        return self


class UpdateOrderInput(StrictModel):
    assigned_driver_id: UUID | None = None
    assigned_vehicle_id: UUID | None = None
    cargo_metadata: list[dict[str, Any]] | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None


class CaptureDockInput(StrictModel):
    inspection_id: UUID
    image: bytes
    cargo_state: CargoState | None = None


class StartDockInput(StrictModel):
    order_id: str = Field(min_length=3, max_length=128)


class FinalizeDockInput(StrictModel):
    inspection_id: UUID
    operator_note: str = Field(min_length=2, max_length=1000)
    final_cargo_state: CargoState

    @model_validator(mode="after")
    def validate_final_state(self) -> FinalizeDockInput:
        if self.final_cargo_state not in {CargoState.LOADED, CargoState.ANOMALY}:
            raise ValueError("final_cargo_state phải là LOADED hoặc ANOMALY")
        return self


class OrderOutput(StrictModel):
    id: UUID
    order_id: str
    assigned_driver_id: UUID
    assigned_vehicle_id: UUID
    cargo_metadata: list[dict[str, Any]]
    status: OrderStatus
    valid_from: datetime
    valid_until: datetime
    dock_session_id: UUID | None
    slip_version: int
    slip_refs: dict[str, str]


class DockOutput(StrictModel):
    id: UUID
    order_id: str
    entry_gate_log_id: UUID
    status: DockStatus
    current_cargo_state: CargoState
    capture_count: int
    operator_note: str | None
    completed_at: datetime | None


class CargoDetectionOutput(StrictModel):
    class_name: str
    confidence: float
    bounding_box: dict[str, float]
    model_version: str


class DockCaptureOutput(StrictModel):
    index: int
    captured_at: datetime
    cargo_state: CargoState
    detections: list[CargoDetectionOutput]


class DockDetailOutput(DockOutput):
    captures: list[DockCaptureOutput]


class SlipOutput(StrictModel):
    order_id: str
    slip_version: int
    expires_at: datetime
    refs: dict[str, str]


class LoginInput(StrictModel):
    username: str = Field(min_length=3, max_length=128)
    password: str = Field(min_length=8, max_length=256)


class AuthTokens(StrictModel):
    session_token: str
    csrf_token: str
    expires_at: datetime


class UserOutput(StrictModel):
    id: UUID
    username: str
    role: UserRole
