from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from smart_gate.domain.enums import AlertSeverity, AlertStatus, CargoState, RecordStatus, UserRole


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class ErrorBody(ApiModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(ApiModel):
    error: ErrorBody


class MessageResponse(ApiModel):
    message: str


class LoginRequest(ApiModel):
    username: str = Field(min_length=3, max_length=128)
    password: str = Field(min_length=8, max_length=256)


class LoginResponse(ApiModel):
    user_id: UUID
    username: str
    role: UserRole
    csrf_token: str
    expires_at: datetime


class UserResponse(ApiModel):
    id: UUID
    username: str
    role: UserRole
    csrf_token: str | None = None


class DriverResponse(ApiModel):
    id: UUID
    full_name: str
    employee_code: str | None
    phone: str | None
    status: RecordStatus
    face_model: str
    embedding_version: str
    enrolled_at: datetime | None


class VehicleRequest(ApiModel):
    plate_number: str = Field(min_length=4, max_length=32)
    vehicle_type: str = Field(min_length=2, max_length=64)
    make: str | None = Field(None, max_length=100)
    model: str | None = Field(None, max_length=100)
    color: str | None = Field(None, max_length=64)
    metadata: dict[str, Any] = Field(default_factory=dict)


class VehicleUpdateRequest(ApiModel):
    plate_number: str | None = Field(None, min_length=4, max_length=32)
    vehicle_type: str | None = Field(None, min_length=2, max_length=64)
    make: str | None = Field(None, max_length=100)
    model: str | None = Field(None, max_length=100)
    color: str | None = Field(None, max_length=64)
    metadata: dict[str, Any] | None = None


class VehicleResponse(ApiModel):
    id: UUID
    plate_number: str
    plate_normalized: str
    vehicle_type: str
    make: str | None
    model: str | None
    color: str | None
    metadata: dict[str, Any]
    status: RecordStatus


class AuthorizationRequest(ApiModel):
    driver_id: UUID
    vehicle_id: UUID
    valid_from: datetime
    valid_until: datetime | None = None


class AuthorizationResponse(ApiModel):
    id: UUID
    driver_id: UUID
    vehicle_id: UUID
    valid_from: datetime
    valid_until: datetime | None
    status: RecordStatus


class CreateOrderRequest(ApiModel):
    order_id: str = Field(min_length=3, max_length=128)
    assigned_driver_id: UUID
    assigned_vehicle_id: UUID
    cargo_metadata: list[dict[str, Any]] = Field(default_factory=list)
    valid_from: datetime
    valid_until: datetime


class UpdateOrderRequest(ApiModel):
    assigned_driver_id: UUID | None = None
    assigned_vehicle_id: UUID | None = None
    cargo_metadata: list[dict[str, Any]] | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None


class FinalizeDockRequest(ApiModel):
    operator_note: str = Field(min_length=2, max_length=1000)
    final_cargo_state: CargoState


class AlertResponse(ApiModel):
    id: UUID
    event_id: str
    sequence: int
    alert_type: str
    severity: AlertSeverity
    status: AlertStatus
    message: str
    data: dict[str, Any]
    occurred_at: datetime | None
    resolved_at: datetime | None


class AlertStatusRequest(ApiModel):
    status: AlertStatus
