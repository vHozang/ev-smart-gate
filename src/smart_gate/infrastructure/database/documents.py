from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel

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


def utc_now() -> datetime:
    return datetime.now(UTC)


class DriverDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    full_name: str
    employee_code: str | None = None
    phone: str | None = None
    status: RecordStatus = RecordStatus.ACTIVE
    face_embedding_ciphertext: str
    embedding_dimension: int
    face_model: str
    embedding_version: str = "1"
    enrolled_at: datetime = Field(default_factory=utc_now)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "drivers"
        keep_nulls = False
        indexes = [
            IndexModel([("employee_code", ASCENDING)], unique=True, sparse=True),
            IndexModel([("status", ASCENDING), ("created_at", DESCENDING)]),
        ]


class EmployeeCardDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    card_uid: str
    card_uid_normalized: str
    driver_id: UUID
    status: CardStatus = CardStatus.ACTIVE
    status_reason: str | None = None
    replaces_card_id: UUID | None = None
    replaced_by_card_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    issued_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "employee_cards"
        indexes = [
            IndexModel([("card_uid_normalized", ASCENDING)], unique=True),
            IndexModel(
                [("driver_id", ASCENDING)],
                unique=True,
                partialFilterExpression={"status": "ACTIVE"},
            ),
            IndexModel([("driver_id", ASCENDING), ("issued_at", DESCENDING)]),
            IndexModel([("status", ASCENDING), ("updated_at", DESCENDING)]),
        ]


class VehicleDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    plate_number: str
    plate_normalized: str
    vehicle_type: str
    make: str | None = None
    model: str | None = None
    color: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    status: RecordStatus = RecordStatus.ACTIVE
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "vehicles"
        indexes = [
            IndexModel([("plate_normalized", ASCENDING)], unique=True),
            IndexModel([("status", ASCENDING), ("created_at", DESCENDING)]),
        ]


class DriverVehicleAuthorizationDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    driver_id: UUID
    vehicle_id: UUID
    valid_from: datetime
    valid_until: datetime | None = None
    status: RecordStatus = RecordStatus.ACTIVE
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "driver_vehicle_authorizations"
        indexes = [
            IndexModel(
                [
                    ("driver_id", ASCENDING),
                    ("vehicle_id", ASCENDING),
                    ("valid_from", ASCENDING),
                ],
                unique=True,
            ),
            IndexModel([("status", ASCENDING), ("valid_from", ASCENDING)]),
        ]


class GateLogDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    event_id: str
    direction: Direction
    verification_status: VerificationStatus
    observed_plate: str
    plate_score: float
    plate_match_type: PlateMatchType
    face_similarity: float
    verification_score: float
    reason_codes: list[str] = Field(default_factory=list)
    driver_id: UUID | None = None
    vehicle_id: UUID | None = None
    order_id: str | None = None
    snapshot_refs: list[str] = Field(default_factory=list)
    barrier_status: BarrierStatus = BarrierStatus.NOT_REQUESTED
    model_versions: dict[str, str] = Field(default_factory=dict)
    threshold_version: str = "v1"
    occurred_at: datetime = Field(default_factory=utc_now)
    completed_at: datetime | None = None
    card_id: UUID | None = None
    card_status: CardStatus | None = None
    card_verified: bool = False
    face_verified: bool = False
    plate_verified: bool = False
    authorization_verified: bool = False
    vehicle_type: str | None = None

    class Settings:
        name = "gate_logs"
        indexes = [
            IndexModel([("event_id", ASCENDING)], unique=True),
            IndexModel([("direction", ASCENDING), ("occurred_at", DESCENDING)]),
            IndexModel(
                [("vehicle_id", ASCENDING), ("driver_id", ASCENDING), ("occurred_at", DESCENDING)]
            ),
            IndexModel([("order_id", ASCENDING), ("occurred_at", DESCENDING)], sparse=True),
        ]


class WarehouseExitOrderDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    order_id: str
    assigned_driver_id: UUID
    assigned_vehicle_id: UUID
    cargo_metadata: list[dict[str, Any]] = Field(default_factory=list)
    valid_from: datetime
    valid_until: datetime
    status: OrderStatus = OrderStatus.PENDING
    dock_session_id: UUID | None = None
    slip_version: int = 0
    slip_jti_hash: str | None = None
    slip_token_hash: str | None = None
    slip_refs: dict[str, str] = Field(default_factory=dict)
    slip_issued_at: datetime | None = None
    exit_event_id: str | None = None
    completed_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "warehouse_exit_orders"
        indexes = [
            IndexModel([("order_id", ASCENDING)], unique=True),
            IndexModel([("status", ASCENDING), ("valid_until", ASCENDING)]),
            IndexModel([("assigned_vehicle_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("exit_event_id", ASCENDING)], sparse=True),
        ]


class CargoDetectionModel(BaseModel):
    class_name: str
    confidence: float
    bounding_box: dict[str, float]
    model_version: str


class DockCaptureModel(BaseModel):
    captured_at: datetime
    cargo_state: CargoState
    evidence_ref: str
    detections: list[CargoDetectionModel] = Field(default_factory=list)


class DockInspectionDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    order_id: str
    entry_gate_log_id: UUID
    status: DockStatus = DockStatus.ACTIVE
    current_cargo_state: CargoState = CargoState.UNKNOWN
    captures: list[DockCaptureModel] = Field(default_factory=list)
    operator_note: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    completed_at: datetime | None = None

    class Settings:
        name = "dock_inspections"
        indexes = [
            IndexModel([("order_id", ASCENDING)], unique=True),
            IndexModel([("status", ASCENDING), ("created_at", DESCENDING)]),
        ]


class EvidenceDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    object_key: str
    category: str
    correlation_id: str
    content_type: str
    content_sha256: str
    size_bytes: int
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "evidence"
        indexes = [
            IndexModel([("object_key", ASCENDING)], unique=True),
            IndexModel([("correlation_id", ASCENDING), ("created_at", DESCENDING)]),
        ]


class SecurityAlertDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    event_id: str
    sequence: int
    alert_type: str
    severity: AlertSeverity
    status: AlertStatus = AlertStatus.OPEN
    message: str
    data: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime = Field(default_factory=utc_now)
    resolved_at: datetime | None = None

    class Settings:
        name = "security_alerts"
        indexes = [
            IndexModel([("sequence", ASCENDING)], unique=True),
            IndexModel([("event_id", ASCENDING), ("alert_type", ASCENDING)]),
            IndexModel(
                [("status", ASCENDING), ("severity", DESCENDING), ("occurred_at", DESCENDING)]
            ),
        ]


class GateCommandDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    command_id: str
    gate_log_id: UUID
    gate_id: str
    status: GateCommandStatus = GateCommandStatus.PENDING
    error_code: str | None = None
    issued_at: datetime = Field(default_factory=utc_now)
    acknowledged_at: datetime | None = None

    class Settings:
        name = "gate_commands"
        indexes = [
            IndexModel([("command_id", ASCENDING)], unique=True),
            IndexModel([("gate_log_id", ASCENDING)]),
        ]


class UserDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    username: str
    password_hash: str
    role: UserRole
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    role_id: UUID | None = None
    session_version: int = 1
    authz_version: int = 1
    must_change_password: bool = False

    class Settings:
        name = "users"
        indexes = [IndexModel([("username", ASCENDING)], unique=True)]


class AuthSessionDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    user_id: UUID
    token_hash: str
    csrf_hash: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=utc_now)
    session_version: int = 1

    class Settings:
        name = "auth_sessions"
        indexes = [
            IndexModel([("token_hash", ASCENDING)], unique=True),
            IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0),
        ]


class DeviceCredentialDocument(Document):
    id: UUID = Field(default_factory=uuid4)
    name: str
    key_hash: str
    scopes: list[str] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "device_credentials"
        indexes = [
            IndexModel([("name", ASCENDING)], unique=True),
            IndexModel([("key_hash", ASCENDING)], unique=True),
        ]


class SequenceCounterDocument(Document):
    id: str
    value: int = 0

    class Settings:
        name = "sequence_counters"


DOCUMENT_MODELS = [
    DriverDocument,
    EmployeeCardDocument,
    VehicleDocument,
    DriverVehicleAuthorizationDocument,
    GateLogDocument,
    WarehouseExitOrderDocument,
    DockInspectionDocument,
    EvidenceDocument,
    SecurityAlertDocument,
    GateCommandDocument,
    UserDocument,
    AuthSessionDocument,
    DeviceCredentialDocument,
    SequenceCounterDocument,
]
