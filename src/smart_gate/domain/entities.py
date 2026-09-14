from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from smart_gate.domain.enums import (
    AlertSeverity,
    AlertStatus,
    BarrierStatus,
    CardStatus,
    CargoState,
    Direction,
    DockStatus,
    GateCommandStatus,
    OrderStatus,
    PlateMatchType,
    RecordStatus,
    UserRole,
    VerificationStatus,
)


@dataclass(slots=True)
class Driver:
    full_name: str
    face_embedding: tuple[float, ...]
    face_model: str
    id: UUID = field(default_factory=uuid4)
    employee_code: str | None = None
    phone: str | None = None
    status: RecordStatus = RecordStatus.ACTIVE
    embedding_version: str = "1"
    enrolled_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass(slots=True)
class Vehicle:
    plate_number: str
    plate_normalized: str
    vehicle_type: str
    id: UUID = field(default_factory=uuid4)
    make: str | None = None
    model: str | None = None
    color: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    status: RecordStatus = RecordStatus.ACTIVE
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass(slots=True)
class DriverVehicleAuthorization:
    driver_id: UUID
    vehicle_id: UUID
    valid_from: datetime
    id: UUID = field(default_factory=uuid4)
    valid_until: datetime | None = None
    status: RecordStatus = RecordStatus.ACTIVE


@dataclass(slots=True)
class EmployeeCard:
    card_uid: str
    card_uid_normalized: str
    driver_id: UUID
    id: UUID = field(default_factory=uuid4)
    status: CardStatus = CardStatus.ACTIVE
    status_reason: str | None = None
    replaces_card_id: UUID | None = None
    replaced_by_card_id: UUID | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    issued_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class PlateObservation:
    text: str
    confidence: float
    model_version: str


@dataclass(frozen=True, slots=True)
class FaceObservation:
    embedding: tuple[float, ...]
    detector_confidence: float
    liveness_score: float
    is_live: bool
    model_version: str


@dataclass(frozen=True, slots=True)
class CargoDetection:
    class_name: str
    confidence: float
    bounding_box: dict[str, float]
    model_version: str


@dataclass(frozen=True, slots=True)
class PlateMatch:
    vehicle: Vehicle | None
    score: float
    match_type: PlateMatchType


@dataclass(slots=True)
class GateLog:
    event_id: str
    direction: Direction
    verification_status: VerificationStatus
    observed_plate: str
    plate_score: float
    plate_match_type: PlateMatchType
    face_similarity: float
    verification_score: float
    reason_codes: list[str]
    id: UUID = field(default_factory=uuid4)
    driver_id: UUID | None = None
    vehicle_id: UUID | None = None
    order_id: str | None = None
    snapshot_refs: list[str] = field(default_factory=list)
    barrier_status: BarrierStatus = BarrierStatus.NOT_REQUESTED
    model_versions: dict[str, str] = field(default_factory=dict)
    threshold_version: str = "v1"
    occurred_at: datetime | None = None
    completed_at: datetime | None = None
    card_id: UUID | None = None
    card_status: CardStatus | None = None
    card_verified: bool = False
    face_verified: bool = False
    plate_verified: bool = False
    authorization_verified: bool = False
    vehicle_type: str | None = None


@dataclass(slots=True)
class WarehouseExitOrder:
    order_id: str
    assigned_driver_id: UUID
    assigned_vehicle_id: UUID
    cargo_metadata: list[dict[str, Any]]
    valid_from: datetime
    valid_until: datetime
    id: UUID = field(default_factory=uuid4)
    status: OrderStatus = OrderStatus.PENDING
    dock_session_id: UUID | None = None
    slip_version: int = 0
    slip_jti_hash: str | None = None
    slip_token_hash: str | None = None
    slip_refs: dict[str, str] = field(default_factory=dict)
    slip_issued_at: datetime | None = None
    exit_event_id: str | None = None
    completed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass(slots=True)
class DockCapture:
    captured_at: datetime
    cargo_state: CargoState
    evidence_ref: str
    detections: list[CargoDetection]


@dataclass(slots=True)
class DockInspection:
    order_id: str
    entry_gate_log_id: UUID
    id: UUID = field(default_factory=uuid4)
    status: DockStatus = DockStatus.ACTIVE
    current_cargo_state: CargoState = CargoState.UNKNOWN
    captures: list[DockCapture] = field(default_factory=list)
    operator_note: str | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None


@dataclass(slots=True)
class SecurityAlert:
    event_id: str
    sequence: int
    alert_type: str
    severity: AlertSeverity
    message: str
    data: dict[str, Any]
    id: UUID = field(default_factory=uuid4)
    status: AlertStatus = AlertStatus.OPEN
    occurred_at: datetime | None = None
    resolved_at: datetime | None = None


@dataclass(slots=True)
class GateCommand:
    command_id: str
    gate_log_id: UUID
    gate_id: str
    id: UUID = field(default_factory=uuid4)
    status: GateCommandStatus = GateCommandStatus.PENDING
    error_code: str | None = None
    issued_at: datetime | None = None
    acknowledged_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class ExitSlipClaims:
    order_id: str
    vehicle_id: UUID
    driver_id: UUID
    slip_version: int
    jti: str
    issued_at: datetime
    expires_at: datetime
    kid: str


@dataclass(frozen=True, slots=True)
class ExitSlipArtifacts:
    token: str
    claims: ExitSlipClaims
    qr_png: bytes
    html: bytes
    pdf: bytes


@dataclass(slots=True)
class User:
    username: str
    password_hash: str
    role: UserRole
    id: UUID = field(default_factory=uuid4)
    is_active: bool = True
    created_at: datetime | None = None


@dataclass(slots=True)
class AuthSession:
    user_id: UUID
    token_hash: str
    csrf_hash: str
    expires_at: datetime
    id: UUID = field(default_factory=uuid4)
    created_at: datetime | None = None


@dataclass(slots=True)
class DeviceCredential:
    name: str
    key_hash: str
    scopes: list[str]
    id: UUID = field(default_factory=uuid4)
    is_active: bool = True
    created_at: datetime | None = None
