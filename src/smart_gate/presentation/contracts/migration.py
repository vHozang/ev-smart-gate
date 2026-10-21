from __future__ import annotations

from typing import Annotated, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    FiniteFloat,
    JsonValue,
    SecretStr,
    field_validator,
    model_validator,
)

Text = Annotated[str, Field(min_length=1, max_length=128)]
Reason = Annotated[str, Field(min_length=3, max_length=500)]
PermissionCode = Annotated[str, Field(pattern=r"^[a-z][a-z-]*:[a-z][a-z-]*$", max_length=100)]
AccessMode = Literal["pedestrian", "motorcycle", "car", "truck"]
Direction = Literal["ENTRY", "EXIT"]
T = TypeVar("T")


class ContractModel(BaseModel):
    """DTO mục tiêu nghiêm ngặt, không thay thế application policy."""

    model_config = ConfigDict(extra="forbid")


class CursorPage(ContractModel, Generic[T]):
    items: list[T]
    next_cursor: str | None
    has_more: bool
    coverage: Literal["complete", "partial"]
    total: int | None = Field(ge=0)


class EffectivePrincipal(ContractModel):
    id: UUID
    username: Text
    role_id: UUID
    role_code: Text
    permissions: list[PermissionCode]
    authz_version: int = Field(ge=1)
    must_change_password: bool


class LoginRequest(ContractModel):
    username: Text
    password: SecretStr = Field(min_length=1, max_length=256)


class AccessTokenResponse(ContractModel):
    access_token: str
    token_type: Literal["Bearer"]
    expires_in: int = Field(gt=0)
    principal: EffectivePrincipal


class ChangePasswordRequest(ContractModel):
    current_password: SecretStr = Field(min_length=1, max_length=256)
    new_password: SecretStr = Field(min_length=12, max_length=128)


class Message(ContractModel):
    message: str


class TicketRequest(ContractModel):
    channel: Literal["security.alerts"]

    @field_validator("channel", mode="before")
    @classmethod
    def normalize_legacy_channel(cls, value: object) -> object:
        if value == "security_alerts":
            return "security.alerts"
        return value


class TicketResponse(ContractModel):
    ticket: str
    expires_at: AwareDatetime
    websocket_path: Literal["/ws/v2/security/alerts"]


class AlertView(ContractModel):
    id: UUID
    event_id: Text
    sequence: int = Field(ge=1)
    alert_type: Text
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    status: Literal["OPEN", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"]
    message: str
    data: dict[str, JsonValue]
    occurred_at: AwareDatetime | None
    resolved_at: AwareDatetime | None


class AlertDelta(ContractModel):
    schema_version: Literal["1.0"]
    type: Literal["alert.upsert"]
    delivery_id: UUID
    epoch: Text
    sequence: int = Field(ge=1)
    occurred_at: AwareDatetime
    alert: AlertView


class AlertBatch(ContractModel):
    items: list[AlertDelta]
    epoch: Text
    oldest_sequence: int = Field(ge=1)
    watermark: int = Field(ge=0)
    next_after_sequence: int = Field(ge=0)
    has_more: bool
    coverage: Literal["complete", "partial"]
    retained_from: AwareDatetime


class VersionedReason(ContractModel):
    expected_version: int = Field(ge=1)
    reason: Reason


class UserCreate(ContractModel):
    username: Annotated[str, Field(pattern=r"^[a-zA-Z0-9._-]{3,64}$")]
    password: SecretStr = Field(min_length=12, max_length=128)
    role_id: UUID
    display_name: Text | None = None

    @field_validator("display_name", mode="before")
    @classmethod
    def _empty_display_name(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value


class UserProfilePatch(ContractModel):
    expected_version: int = Field(ge=1)
    username: Annotated[str, Field(pattern=r"^[a-zA-Z0-9._-]{3,64}$")] | None = None
    display_name: Text | None = None

    @field_validator("username", "display_name", mode="before")
    @classmethod
    def _empty_optional_fields(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value


class UserStatusChange(VersionedReason):
    is_active: bool


class UserRoleChange(VersionedReason):
    role_id: UUID


class PasswordReset(VersionedReason):
    temporary_password: SecretStr = Field(min_length=12, max_length=128)


class AdminUserView(ContractModel):
    id: UUID
    username: Text
    display_name: str | None
    role_id: UUID
    role_code: Text
    is_active: bool
    must_change_password: bool
    version: int = Field(ge=1)
    created_at: AwareDatetime


class SessionView(ContractModel):
    id: UUID
    created_at: AwareDatetime
    last_seen_at: AwareDatetime
    expires_at: AwareDatetime
    revoked_at: AwareDatetime | None


class RoleCreate(ContractModel):
    code: Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9_]{2,63}$")]
    name: Text
    description: Annotated[str, Field(max_length=500)] | None = None

    @field_validator("description", mode="before")
    @classmethod
    def _empty_description(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value


class RolePatch(VersionedReason):
    name: Text | None = None
    description: Annotated[str, Field(max_length=500)] | None = None
    is_active: bool | None = None

    @field_validator("name", "description", mode="before")
    @classmethod
    def _empty_role_patch_fields(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value


class PermissionReplace(VersionedReason):
    permission_codes: list[PermissionCode] = Field(max_length=200)


class RoleView(ContractModel):
    id: UUID
    code: Text
    name: Text
    description: str | None
    is_system: bool
    is_active: bool
    permission_codes: list[PermissionCode]
    assigned_user_count: int = Field(ge=0)
    version: int = Field(ge=1)


class PermissionView(ContractModel):
    code: PermissionCode
    group: Text
    description: str
    dependencies: list[PermissionCode]
    protected: bool


class AuditView(ContractModel):
    id: UUID
    actor_id: UUID | None
    action: Text
    target_type: Text
    target_id: str
    occurred_at: AwareDatetime
    request_id: str
    outcome: Literal["SUCCEEDED", "DENIED", "FAILED"]
    redacted_changes: dict[str, JsonValue]


class EmployeeCreate(ContractModel):
    person_id: UUID
    employee_code: Text


class EmployeePatch(VersionedReason):
    employee_code: Text | None = None
    is_active: bool | None = None

    @field_validator("employee_code", mode="before")
    @classmethod
    def _empty_employee_code(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value


class EmployeeView(ContractModel):
    employee_id: UUID
    person_id: UUID
    employee_code: Text
    is_active: bool
    version: int = Field(ge=1)
    created_at: AwareDatetime


class AccessPointView(ContractModel):
    id: Text
    name: Text
    supported_modes: list[AccessMode]
    directions: list[Direction]
    calibration_version: str | None
    strict_capture_ready: bool


class GrantCreate(ContractModel):
    employee_id: UUID
    access_point_ids: list[Text] = Field(min_length=1, max_length=100)
    directions: list[Direction] = Field(min_length=1, max_length=2)
    valid_from: AwareDatetime
    valid_until: AwareDatetime
    reason: Reason

    @model_validator(mode="after")
    def valid_window(self) -> GrantCreate:
        if self.valid_until <= self.valid_from:
            raise ValueError("valid_until phải sau valid_from")
        return self


class GrantView(GrantCreate):
    id: UUID
    status: Literal["ACTIVE", "REVOKED"]
    version: int = Field(ge=1)


class VehicleTypeView(ContractModel):
    code: Literal["motorcycle", "car", "truck", "unknown"]
    label: Text
    legacy_values: list[str]
    eligible_for_verification: bool


class CaptureMetadata(ContractModel):
    schema_version: Literal["1.0"]
    encounter_id: Text
    access_point_id: Text
    lane_id: Text
    access_mode: AccessMode
    calibration_version: Text
    face_captured_at: AwareDatetime
    plate_captured_at: AwareDatetime | None = None
    rfid_captured_at: AwareDatetime
    card_uid: SecretStr = Field(min_length=4, max_length=128)

    @model_validator(mode="after")
    def vehicle_requires_plate_time(self) -> CaptureMetadata:
        if self.access_mode != "pedestrian" and self.plate_captured_at is None:
            raise ValueError("Vehicle capture phải có plate_captured_at")
        return self


class CaptureView(ContractModel):
    capture_bundle_id: UUID
    schema_version: Literal["1.0"]
    encounter_id: Text
    access_point_id: Text
    lane_id: Text
    access_mode: AccessMode
    received_at: AwareDatetime
    expires_at: AwareDatetime
    calibration_version: Text
    face_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    plate_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")] | None


class VerificationRequest(ContractModel):
    event_id: Annotated[str, Field(min_length=8, max_length=128)]
    gate_id: Text
    capture_bundle_id: UUID


class FactorView(ContractModel):
    factor: Literal["card", "face", "plate", "authorization", "employee", "grant", "capture"]
    status: Literal["PASSED", "FAILED", "NOT_RUN", "ERROR"]
    reason_code: str | None
    score: FiniteFloat | None


class VerificationView(ContractModel):
    operation_id: UUID
    event_id: Text
    gate_id: Text
    access_mode: AccessMode
    direction: Direction
    status: Literal["PROCESSING", "COMPLETED", "OUTCOME_UNKNOWN"]
    verification_status: Literal["PASSED", "FAILED"] | None
    permit_granted: bool
    barrier_status: Literal["NOT_REQUESTED", "PENDING", "OPENED", "FAILED", "UNKNOWN"]
    command_id: str | None
    factors: list[FactorView]
    reason_codes: list[str]
    received_at: AwareDatetime
    verification_completed_at: AwareDatetime | None
    command_sent_at: AwareDatetime | None
    acknowledged_at: AwareDatetime | None


class PersonLogView(VerificationView):
    id: UUID
    person_id: UUID | None
    employee_id: UUID | None
    snapshot_count: int = Field(ge=0)


class Period(ContractModel):
    from_: AwareDatetime = Field(alias="from")
    to: AwareDatetime
    timezone: Literal["Asia/Bangkok", "UTC"] = "Asia/Bangkok"

    @model_validator(mode="after")
    def valid_window(self) -> Period:
        if self.to <= self.from_:
            raise ValueError("to phải sau from")
        return self


class AnalyticsFilters(ContractModel):
    access_point_id: Text | None = None
    access_mode: AccessMode | None = None
    direction: Direction | None = None


class MetricDefinition(ContractModel):
    metric_id: Text
    version: Text
    unit: Literal["count", "percent", "seconds"]
    formula: str
    source: str
    kind: Literal["event_flow", "current_snapshot"]
    required_permissions: list[PermissionCode]
    supported_filters: list[str]


class MetricValue(ContractModel):
    metric_id: Text
    value: FiniteFloat | None
    unit: Literal["count", "percent", "seconds"]
    status: Literal["available", "partial", "unavailable"]
    unavailable_reason: str | None
    sample_size: int | None = Field(ge=0)
    excluded_count: int | None = Field(ge=0)
    source_ref: str


class DashboardView(ContractModel):
    snapshot_id: UUID
    generated_at: AwareDatetime
    data_as_of: AwareDatetime
    period: Period
    metric_definition_version: Text
    authz_version: int = Field(ge=1)
    metrics: list[MetricValue]
    coverage: Literal["complete", "partial"]
    source_watermarks: dict[str, AwareDatetime]
    warnings: list[str]


class ReportCreate(ContractModel):
    prompt: Annotated[str, Field(min_length=1, max_length=4000)]
    period: Period
    filters: AnalyticsFilters
    template: Literal["access-summary", "alerts-summary", "period-comparison"] | None = None


class MetricReference(ContractModel):
    metric_id: Text
    source_ref: str
    snapshot_id: UUID


class ReportResult(ContractModel):
    title: str
    summary: str
    findings: list[str]
    metric_refs: list[MetricReference]
    limitations: list[str]
    suggested_checks: list[str]
    snapshot_id: UUID
    data_as_of: AwareDatetime
    model_id: str
    model_version: str
    output_kind: Literal["model_report", "data_summary"]


class ReportView(ContractModel):
    report_id: UUID
    owner_id: UUID
    status: Literal[
        "QUEUED",
        "RUNNING",
        "VALIDATING",
        "COMPLETED",
        "FAILED",
        "CANCEL_REQUESTED",
        "CANCELED",
    ]
    created_at: AwareDatetime
    expires_at: AwareDatetime
    last_sequence: int = Field(ge=0)
    result: ReportResult | None
    error_code: str | None
    artifact_available: bool


class ReportEvent(ContractModel):
    schema_version: Literal["1.0"]
    report_id: UUID
    sequence: int = Field(ge=1)
    stage: Literal[
        "QUEUED",
        "RUNNING",
        "VALIDATING",
        "COMPLETED",
        "FAILED",
        "CANCEL_REQUESTED",
        "CANCELED",
    ]
    occurred_at: AwareDatetime
    terminal: bool


class ErrorDetail(ContractModel):
    code: str
    message: str
    details: dict[str, JsonValue]


class ErrorEnvelope(ContractModel):
    error: ErrorDetail
