from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal, Protocol
from uuid import UUID

AccessModeType = Literal["pedestrian", "motorcycle", "car", "truck"]
DirectionType = Literal["ENTRY", "EXIT"]
AccessMode = AccessModeType
Direction = DirectionType


@dataclass(frozen=True, slots=True)
class EmployeeRecord:
    """Thực thể liên kết hồ sơ nhận diện (Driver/Person) với mã nhân viên nội bộ."""

    employee_id: UUID
    person_id: UUID
    employee_code: str
    is_active: bool
    version: int
    created_at: datetime


@dataclass(frozen=True, slots=True)
class AccessPointConfig:
    """Cấu hình điểm kiểm soát cổng phương tiện hoặc cổng xoay người đi bộ."""

    id: str
    name: str
    supported_modes: list[AccessModeType]
    directions: list[DirectionType]
    calibration_version: str | None
    strict_capture_ready: bool


@dataclass(frozen=True, slots=True)
class PedestrianGrantRecord:
    """Quyền ra vào cổng đi bộ có thời hạn và kiểm soát phiên bản."""

    id: UUID
    employee_id: UUID
    access_point_ids: list[str]
    directions: list[DirectionType]
    valid_from: datetime
    valid_until: datetime
    reason: str
    status: Literal["ACTIVE", "REVOKED"]
    version: int
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(frozen=True, slots=True)
class CaptureBundleRecord:
    """Gói thu nhận hình ảnh và thẻ từ thiết bị edge đã xác thực."""

    capture_bundle_id: UUID
    schema_version: Literal["1.0"]
    encounter_id: str
    access_point_id: str
    lane_id: str
    access_mode: AccessModeType
    received_at: datetime
    expires_at: datetime
    calibration_version: str
    face_sha256: str
    plate_sha256: str | None
    card_uid_hash: str
    face_bytes: bytes = b""
    plate_bytes: bytes | None = None


@dataclass(frozen=True, slots=True)
class FactorEvaluation:
    """Kết quả quan sát từng nhân tố xác minh, tách biệt với quyết định mở cổng."""

    factor: Literal["card", "face", "plate", "authorization", "employee", "grant", "capture"]
    status: Literal["PASSED", "FAILED", "NOT_RUN", "ERROR"]
    reason_code: str | None
    score: float | None


FactorObservation = FactorEvaluation


@dataclass(frozen=True, slots=True)
class VerificationRecord:
    """Bản ghi kết quả xác minh và trạng thái phản hồi thiết bị barrier."""

    operation_id: UUID
    event_id: str
    gate_id: str
    access_mode: AccessModeType
    direction: DirectionType
    status: Literal["PROCESSING", "COMPLETED", "OUTCOME_UNKNOWN"]
    verification_status: Literal["PASSED", "FAILED"] | None
    permit_granted: bool
    barrier_status: Literal["NOT_REQUESTED", "PENDING", "OPENED", "FAILED", "UNKNOWN"]
    command_id: str | None
    factors: list[FactorEvaluation]
    reason_codes: list[str]
    received_at: datetime
    verification_completed_at: datetime | None
    command_sent_at: datetime | None
    acknowledged_at: datetime | None
    capture_bundle_id: UUID
    person_id: UUID | None = None
    employee_id: UUID | None = None
    snapshot_bytes: list[bytes] = field(default_factory=list)


AccessVerificationRecord = VerificationRecord


class MigrationOperationsStore(Protocol):
    """Port lưu trữ phục vụ các use case M3, M4, M5 và FE-G08."""

    async def initialize(self) -> None: ...
    async def get_idempotency(self, key: str) -> dict[str, Any] | None: ...
    async def set_idempotency(self, key: str, value: dict[str, Any]) -> None: ...
    async def list_access_points(
        self, cursor: str | None = None, limit: int = 50
    ) -> tuple[list[AccessPointConfig], str | None, bool, int]: ...
    async def get_access_point(self, access_point_id: str) -> AccessPointConfig | None: ...
    async def list_employees(
        self,
        cursor: str | None = None,
        limit: int = 50,
        search: str | None = None,
        is_active: bool | None = None,
    ) -> tuple[list[EmployeeRecord], str | None, bool, int]: ...
    async def get_employee(self, employee_id: UUID) -> EmployeeRecord | None: ...
    async def get_employee_by_code(self, employee_code: str) -> EmployeeRecord | None: ...
    async def save_employee(self, record: EmployeeRecord) -> EmployeeRecord: ...
    async def delete_employee(self, employee_id: UUID) -> bool: ...
    async def list_grants(
        self,
        cursor: str | None = None,
        limit: int = 50,
        status: str | None = None,
        employee_id: UUID | None = None,
        access_point_id: str | None = None,
        direction: str | None = None,
    ) -> tuple[list[PedestrianGrantRecord], str | None, bool, int]: ...
    async def get_grant(self, grant_id: UUID) -> PedestrianGrantRecord | None: ...
    async def save_grant(self, record: PedestrianGrantRecord) -> PedestrianGrantRecord: ...
    async def delete_grant(self, grant_id: UUID) -> bool: ...
    async def save_capture_bundle(self, bundle: CaptureBundleRecord) -> CaptureBundleRecord: ...
    async def get_capture_bundle(self, capture_bundle_id: UUID) -> CaptureBundleRecord | None: ...
    async def save_verification(self, record: VerificationRecord) -> VerificationRecord: ...
    async def get_verification_by_event_id(self, event_id: str) -> VerificationRecord | None: ...
    async def list_all_verifications(
        self,
        from_: datetime | None = None,
        to: datetime | None = None,
    ) -> list[VerificationRecord]: ...
    async def list_person_logs(
        self,
        cursor: str | None = None,
        limit: int = 50,
        from_: datetime | None = None,
        to: datetime | None = None,
        employee_id: UUID | None = None,
        access_point_id: str | None = None,
        direction: str | None = None,
    ) -> tuple[list[VerificationRecord], str | None, bool, int]: ...
    async def get_person_log(self, log_id: UUID) -> VerificationRecord | None: ...
    async def save_dashboard_snapshot(self, snapshot: dict[str, Any]) -> None: ...
    async def get_dashboard_snapshot(self, snapshot_id: UUID) -> dict[str, Any] | None: ...
    async def save_report(self, report_doc: dict[str, Any]) -> dict[str, Any]: ...
    async def get_report(self, report_id: UUID) -> dict[str, Any] | None: ...
    async def list_reports(
        self,
        owner_id: UUID,
        cursor: str | None = None,
        limit: int = 50,
        status: str | None = None,
    ) -> tuple[list[dict[str, Any]], str | None, bool, int]: ...
    async def list_device_configs(self, group: str) -> list[dict[str, Any]]: ...
    async def get_device_config(self, group: str, config_id: UUID) -> dict[str, Any] | None: ...
    async def save_device_config(self, doc: dict[str, Any]) -> dict[str, Any]: ...
    async def delete_device_config(self, group: str, config_id: UUID) -> bool: ...
    async def save_device_operation(self, op_doc: dict[str, Any]) -> dict[str, Any]: ...
    async def get_device_operation(self, operation_id: UUID) -> dict[str, Any] | None: ...
    async def append_device_audit_log(self, audit_doc: dict[str, Any]) -> None: ...
    async def list_device_audit_logs(
        self, cursor: str | None = None, limit: int = 50
    ) -> tuple[list[dict[str, Any]], str | None, bool, int]: ...
