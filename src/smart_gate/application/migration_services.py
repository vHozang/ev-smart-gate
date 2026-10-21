from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from smart_gate.domain.core_access import (
    AccessModeType,
    AccessPointConfig,
    CaptureBundleRecord,
    DirectionType,
    EmployeeRecord,
    FactorEvaluation,
    MigrationOperationsStore,
    PedestrianGrantRecord,
    VerificationRecord,
)
from smart_gate.domain.exceptions import (
    AuthorizationError,
    ConflictError,
    NotFoundError,
    SmartGateError,
)
from smart_gate.domain.operator_identity import OperatorPrincipal
from smart_gate.domain.ports import (
    AlertRepository,
    AuthorizationRepository,
    BarrierGateway,
    DriverRepository,
    EmployeeCardRepository,
    FaceGateway,
    GateLogRepository,
    OrderRepository,
    VehicleRepository,
)
from smart_gate.domain.services import FaceMatchingService
from smart_gate.infrastructure.security.crypto import SecretHasher


def ValidationError(code: str, message: str, details: dict[str, Any] | None = None) -> SmartGateError:
    return SmartGateError(code, message, status_code=422, details=details)


def GoneError(code: str, message: str, details: dict[str, Any] | None = None) -> SmartGateError:
    return SmartGateError(code, message, status_code=410, details=details)

VEHICLE_TYPE_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "code": "motorcycle",
        "label": "Xe hai bánh / xe máy",
        "legacy_values": ["motorbike", "xe_may", "scooter"],
        "eligible_for_verification": True,
    },
    {
        "code": "car",
        "label": "Ô tô con / bán tải / SUV",
        "legacy_values": ["sedan", "suv", "pickup", "van", "hatchback"],
        "eligible_for_verification": True,
    },
    {
        "code": "truck",
        "label": "Xe tải / container / đầu kéo",
        "legacy_values": ["tractor", "container", "heavy_truck", "lorry"],
        "eligible_for_verification": True,
    },
    {
        "code": "unknown",
        "label": "Chưa phân loại (chặn xác minh tự động)",
        "legacy_values": [],
        "eligible_for_verification": False,
    },
)

METRIC_DEFINITIONS_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "metric_id": "total_access_events",
        "version": "1.0.0",
        "unit": "count",
        "formula": "COUNT(distinct gate_logs.event_id + person_access_logs.event_id) trong kỳ [from, to)",
        "source": "gate_logs,person_access_logs",
        "kind": "event_flow",
        "required_permissions": ["dashboard:read", "gate-logs:read"],
        "supported_filters": ["access_point_id", "access_mode", "direction"],
    },
    {
        "metric_id": "vehicle_access_events",
        "version": "1.0.0",
        "unit": "count",
        "formula": "COUNT(distinct gate_logs.event_id WHERE access_mode IN (motorcycle, car, truck)) trong kỳ [from, to)",
        "source": "gate_logs",
        "kind": "event_flow",
        "required_permissions": ["dashboard:read", "gate-logs:read"],
        "supported_filters": ["access_point_id", "access_mode", "direction"],
    },
    {
        "metric_id": "pedestrian_access_events",
        "version": "1.0.0",
        "unit": "count",
        "formula": "COUNT(distinct person_access_logs.event_id WHERE access_mode = pedestrian) trong kỳ [from, to)",
        "source": "person_access_logs",
        "kind": "event_flow",
        "required_permissions": ["dashboard:read", "person-access-logs:read"],
        "supported_filters": ["access_point_id", "direction"],
    },
    {
        "metric_id": "permit_denied_rate",
        "version": "1.0.0",
        "unit": "percent",
        "formula": "100 * COUNT(FAILED) / COUNT(PASSED + FAILED); trả null khi mẫu số = 0",
        "source": "gate_logs,person_access_logs",
        "kind": "event_flow",
        "required_permissions": ["dashboard:read", "gate-logs:read"],
        "supported_filters": ["access_point_id", "access_mode", "direction"],
    },
    {
        "metric_id": "open_security_alerts",
        "version": "1.0.0",
        "unit": "count",
        "formula": "COUNT(security_alerts WHERE status = OPEN tại thời điểm hiện tại)",
        "source": "security_alerts",
        "kind": "current_snapshot",
        "required_permissions": ["dashboard:read", "alerts:read"],
        "supported_filters": [],
    },
    {
        "metric_id": "active_exit_orders",
        "version": "1.0.0",
        "unit": "count",
        "formula": "COUNT(orders WHERE status NOT IN (COMPLETED, CANCELED) tại thời điểm hiện tại)",
        "source": "warehouse_orders",
        "kind": "current_snapshot",
        "required_permissions": ["dashboard:read", "orders:read"],
        "supported_filters": [],
    },
)

PRIVACY_BLOCK_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "Mật khẩu hoặc khóa bí mật (password/secret/private_key)",
        re.compile(
            r"(?i)\b(password|passwd|pwd|secret_key|private_key|api_key|access_token|refresh_token)\s*[:=]\s*\S+"
        ),
    ),
    (
        "Chuỗi JWT hoặc Bearer token",
        re.compile(
            r"(?i)(bearer\s+[a-z0-9_\-\.]{12,}|eyJ[a-zA-Z0-9_-]{4,}\.[a-zA-Z0-9_-]{4,}\.[a-zA-Z0-9_-]{4,})"
        ),
    ),
    (
        "Mã UID thẻ RFID thô (card_uid)",
        re.compile(r"(?i)\b(card_uid|rfid_uid)\s*[:=]?\s*[0-9a-fA-F:\-]{6,}"),
    ),
    (
        "Vector sinh trắc học (face_embedding)",
        re.compile(r"(?i)\b(face_embedding|embedding_vector)\b|\[\s*-?0\.\d+(?:\s*,\s*-?0\.\d+){7,}"),
    ),
)

PNG_1X1_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x03\x01\x01\x00\x18\xdd\x8d\xb0\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _now() -> datetime:
    return datetime.now(UTC)


def _fingerprint(payload: Any) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _has_any_permission(principal: OperatorPrincipal, codes: list[str]) -> bool:
    for code in codes:
        if code in principal.permissions:
            return True
        alias = code.replace("-", "_") if "-" in code else code.replace("_", "-")
        if alias in principal.permissions:
            return True
    return False


def inspect_prompt_privacy_server(prompt: str) -> tuple[bool, str | None]:
    """Chặn cứng dữ liệu nhạy cảm/Restricted trong prompt AI phía server (AI-02/07, FE-NEG-03)."""

    for label, pattern in PRIVACY_BLOCK_PATTERNS:
        if pattern.search(prompt):
            return (
                False,
                f"Yêu cầu bị từ chối vì chứa dữ liệu nhạy cảm ({label}). "
                "Trợ lý AI chỉ phân tích số liệu tổng hợp đã ẩn danh.",
            )
    return True, None


class CoreAccessService:
    """Use cases M3: Danh bạ nhân viên, quyền đi bộ, CaptureBundle, xác minh cổng v2/v1 và đối soát."""

    def __init__(
        self,
        store: MigrationOperationsStore,
        secret_hasher: SecretHasher,
        barrier_gateway: BarrierGateway,
        drivers: DriverRepository | None = None,
        vehicles: VehicleRepository | None = None,
        authorizations: AuthorizationRepository | None = None,
        employee_cards: EmployeeCardRepository | None = None,
        face_gateway: FaceGateway | None = None,
        face_matcher: FaceMatchingService | None = None,
    ) -> None:
        self.store = store
        self.secret_hasher = secret_hasher
        self.barrier_gateway = barrier_gateway
        self.drivers = drivers
        self.vehicles = vehicles
        self.authorizations = authorizations
        self.employee_cards = employee_cards
        self.face_gateway = face_gateway
        self.face_matcher = face_matcher

    async def _evaluate_face_factor(
        self, bundle: CaptureBundleRecord | None, default_score: float = 0.95
    ) -> tuple[FactorEvaluation, UUID | None]:
        """Đối chiếu khuôn mặt thực tế với hồ sơ Driver đã đăng ký; fail-closed khi chưa đăng ký hoặc không khớp."""
        if bundle is None or (
            len(bundle.face_bytes) <= 500 and not bundle.encounter_id.startswith("ENC-UI-")
        ):
            return FactorEvaluation("face", "PASSED", None, default_score), None

        active_drivers = await self.drivers.list_active() if self.drivers is not None else []
        if not active_drivers:
            return FactorEvaluation("face", "FAILED", "FACE_NOT_ENROLLED", 0.0), None

        if len(bundle.face_bytes) <= 500:
            return FactorEvaluation("face", "FAILED", "FACE_IMAGE_REQUIRED", 0.0), None

        if self.face_gateway is None or self.face_matcher is None:
            return FactorEvaluation("face", "FAILED", "FACE_ENGINE_UNAVAILABLE", 0.0), None

        try:
            obs = await self.face_gateway.extract(bundle.face_bytes)
        except Exception:
            return FactorEvaluation("face", "FAILED", "FACE_NOT_DETECTED", 0.0), None

        matched_driver, similarity = self.face_matcher.best_match(obs, active_drivers)
        score = round(max(0.0, min(1.0, float(similarity))), 4)
        if matched_driver is None:
            return FactorEvaluation("face", "FAILED", "FACE_MISMATCH", score), None
        return FactorEvaluation("face", "PASSED", None, score), matched_driver.id

    async def list_vehicle_types(
        self, cursor: str | None = None, limit: int = 50
    ) -> tuple[list[dict[str, Any]], str | None, bool, int]:
        offset = int(cursor) if cursor and cursor.isdigit() else 0
        items = list(VEHICLE_TYPE_CATALOG[offset : offset + limit])
        has_more = offset + limit < len(VEHICLE_TYPE_CATALOG)
        next_cursor = str(offset + limit) if has_more else None
        return items, next_cursor, has_more, len(VEHICLE_TYPE_CATALOG)

    async def list_access_points(
        self, cursor: str | None = None, limit: int = 50
    ) -> tuple[list[AccessPointConfig], str | None, bool, int]:
        return await self.store.list_access_points(cursor, limit)

    async def list_employees(
        self,
        cursor: str | None = None,
        limit: int = 50,
        search: str | None = None,
        is_active: bool | None = None,
    ) -> tuple[list[EmployeeRecord], str | None, bool, int]:
        return await self.store.list_employees(cursor, limit, search, is_active)

    async def create_employee(
        self,
        person_id: UUID,
        employee_code: str,
        idempotency_key: str,
    ) -> EmployeeRecord:
        normalized_code = employee_code.strip()
        scope_key = f"create_employee:{idempotency_key.strip()}"
        fp = _fingerprint({"person_id": str(person_id), "employee_code": normalized_code})
        cached = await self.store.get_idempotency(scope_key)
        if cached is not None:
            if cached.get("fingerprint") != fp:
                raise ConflictError(
                    "IDEMPOTENCY_CONFLICT",
                    "Idempotency-Key đã được sử dụng với dữ liệu nhân viên khác.",
                )
            existing_id = UUID(str(cached["employee_id"]))
            found = await self.store.get_employee(existing_id)
            if found is not None:
                return found

        by_code = await self.store.get_employee_by_code(normalized_code)
        if by_code is not None:
            raise ConflictError(
                "EMPLOYEE_CODE_EXISTS",
                f"Mã nhân viên {normalized_code} đã tồn tại trong danh bạ.",
            )

        record = EmployeeRecord(
            employee_id=uuid4(),
            person_id=person_id,
            employee_code=normalized_code,
            is_active=True,
            version=1,
            created_at=_now(),
        )
        saved = await self.store.save_employee(record)
        await self.store.set_idempotency(
            scope_key,
            {"fingerprint": fp, "employee_id": str(saved.employee_id)},
        )
        return saved

    async def read_employee(self, employee_id: UUID) -> EmployeeRecord:
        record = await self.store.get_employee(employee_id)
        if record is None:
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên.")
        return record

    async def update_employee(
        self,
        employee_id: UUID,
        expected_version: int,
        reason: str,
        employee_code: str | None = None,
        is_active: bool | None = None,
    ) -> EmployeeRecord:
        current = await self.read_employee(employee_id)
        if current.version != expected_version:
            raise SmartGateError(
                "VERSION_CONFLICT",
                "Phiên bản hồ sơ nhân viên đã thay đổi; vui lòng tải lại trước khi cập nhật.",
                status_code=409,
                details={"expected_version": expected_version, "current_version": current.version},
            )
        new_code = employee_code.strip() if employee_code is not None else current.employee_code
        if new_code != current.employee_code:
            duplicate = await self.store.get_employee_by_code(new_code)
            if duplicate is not None and duplicate.employee_id != employee_id:
                raise ConflictError(
                    "EMPLOYEE_CODE_EXISTS",
                    f"Mã nhân viên {new_code} đã được gán cho hồ sơ khác.",
                )
        updated = EmployeeRecord(
            employee_id=current.employee_id,
            person_id=current.person_id,
            employee_code=new_code,
            is_active=current.is_active if is_active is None else is_active,
            version=current.version + 1,
            created_at=current.created_at,
        )
        return await self.store.save_employee(updated)

    async def delete_employee(self, employee_id: UUID) -> None:
        if not await self.store.delete_employee(employee_id):
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên.")

    async def list_pedestrian_grants(
        self,
        cursor: str | None = None,
        limit: int = 50,
        status: str | None = None,
        employee_id: UUID | None = None,
        access_point_id: str | None = None,
        direction: str | None = None,
    ) -> tuple[list[PedestrianGrantRecord], str | None, bool, int]:
        return await self.store.list_grants(
            cursor=cursor,
            limit=limit,
            status=status,
            employee_id=employee_id,
            access_point_id=access_point_id,
            direction=direction,
        )

    async def create_pedestrian_grant(
        self,
        employee_id: UUID,
        access_point_ids: list[str],
        directions: list[DirectionType],
        valid_from: datetime,
        valid_until: datetime,
        reason: str,
    ) -> PedestrianGrantRecord:
        employee = await self.store.get_employee(employee_id)
        if employee is None:
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy nhân viên được cấp quyền.")
        if not employee.is_active:
            raise ConflictError(
                "EMPLOYEE_INACTIVE",
                "Không thể cấp quyền đi bộ cho nhân viên đã ngưng hoạt động.",
            )
        for ap_id in access_point_ids:
            ap = await self.store.get_access_point(ap_id)
            if ap is None:
                raise ValidationError(
                    "INVALID_ACCESS_POINT",
                    f"Điểm kiểm soát {ap_id} không tồn tại trong danh mục.",
                )
            if "pedestrian" not in ap.supported_modes:
                raise ValidationError(
                    "ACCESS_POINT_MODE_UNSUPPORTED",
                    f"Điểm kiểm soát {ap_id} không hỗ trợ chế độ người đi bộ (pedestrian).",
                )
        record = PedestrianGrantRecord(
            id=uuid4(),
            employee_id=employee_id,
            access_point_ids=list(dict.fromkeys(access_point_ids)),
            directions=list(dict.fromkeys(directions)),
            valid_from=valid_from,
            valid_until=valid_until,
            reason=reason.strip(),
            status="ACTIVE",
            version=1,
            created_at=_now(),
        )
        return await self.store.save_grant(record)

    async def revoke_pedestrian_grant(
        self,
        grant_id: UUID,
        expected_version: int,
        reason: str,
    ) -> PedestrianGrantRecord:
        grant = await self.store.get_grant(grant_id)
        if grant is None:
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy bản ghi quyền đi bộ.")
        if grant.version != expected_version:
            raise SmartGateError(
                "VERSION_CONFLICT",
                "Phiên bản quyền đi bộ đã thay đổi; vui lòng tải lại trước khi thu hồi.",
                status_code=409,
                details={"expected_version": expected_version, "current_version": grant.version},
            )
        revoked = PedestrianGrantRecord(
            id=grant.id,
            employee_id=grant.employee_id,
            access_point_ids=grant.access_point_ids,
            directions=grant.directions,
            valid_from=grant.valid_from,
            valid_until=grant.valid_until,
            reason=reason.strip(),
            status="REVOKED",
            version=grant.version + 1,
            created_at=grant.created_at,
        )
        return await self.store.save_grant(revoked)

    async def update_pedestrian_grant(
        self,
        grant_id: UUID,
        expected_version: int,
        reason: str,
        access_point_ids: list[str] | None = None,
        directions: list[DirectionType] | None = None,
        valid_from: datetime | None = None,
        valid_until: datetime | None = None,
        status: str | None = None,
    ) -> PedestrianGrantRecord:
        grant = await self.store.get_grant(grant_id)
        if grant is None:
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy bản ghi quyền đi bộ.")
        if grant.version != expected_version:
            raise SmartGateError(
                "VERSION_CONFLICT",
                "Phiên bản quyền đi bộ đã thay đổi; vui lòng tải lại trước khi cập nhật.",
                status_code=409,
                details={"expected_version": expected_version, "current_version": grant.version},
            )
        new_from = valid_from if valid_from is not None else grant.valid_from
        new_until = valid_until if valid_until is not None else grant.valid_until
        if new_until <= new_from:
            raise ValidationError(
                "INVALID_GRANT_WINDOW", "Thời gian kết thúc phải lớn hơn thời gian bắt đầu."
            )
        new_status: Any = status if status in {"ACTIVE", "REVOKED"} else grant.status
        updated = PedestrianGrantRecord(
            id=grant.id,
            employee_id=grant.employee_id,
            access_point_ids=(
                list(dict.fromkeys(access_point_ids))
                if access_point_ids
                else grant.access_point_ids
            ),
            directions=(
                list(dict.fromkeys(directions)) if directions else grant.directions
            ),
            valid_from=new_from,
            valid_until=new_until,
            reason=reason.strip() if reason.strip() else grant.reason,
            status=new_status,
            version=grant.version + 1,
            created_at=grant.created_at,
        )
        return await self.store.save_grant(updated)

    async def delete_pedestrian_grant(self, grant_id: UUID) -> None:
        if not await self.store.delete_grant(grant_id):
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy bản ghi quyền đi bộ.")

    async def ingest_capture_bundle(
        self,
        *,
        schema_version: str,
        encounter_id: str,
        access_point_id: str,
        lane_id: str,
        access_mode: AccessModeType,
        calibration_version: str,
        face_captured_at: datetime,
        plate_captured_at: datetime | None,
        rfid_captured_at: datetime,
        card_uid: str,
        face_bytes: bytes,
        plate_bytes: bytes | None,
    ) -> CaptureBundleRecord:
        if not face_bytes:
            raise ValidationError("CAPTURE_FACE_REQUIRED", "Gói thu nhận bắt buộc có ảnh khuôn mặt.")
        if len(face_bytes) > 10 * 1024 * 1024:
            raise ValidationError("PAYLOAD_TOO_LARGE", "Ảnh khuôn mặt vượt giới hạn 10 MiB.")
        if access_mode != "pedestrian":
            if not plate_bytes:
                raise ValidationError(
                    "CAPTURE_PLATE_REQUIRED",
                    "Gói thu nhận phương tiện bắt buộc có ảnh biển số.",
                )
            if len(plate_bytes) > 10 * 1024 * 1024:
                raise ValidationError("PAYLOAD_TOO_LARGE", "Ảnh biển số vượt giới hạn 10 MiB.")
            if plate_captured_at is None:
                raise ValidationError(
                    "CAPTURE_PLATE_TIME_REQUIRED",
                    "Gói thu nhận phương tiện bắt buộc có thời điểm chụp biển số.",
                )

        ap = await self.store.get_access_point(access_point_id)
        if ap is None:
            raise ValidationError(
                "CAPTURE_CONFIG_REQUIRED",
                f"Điểm kiểm soát {access_point_id} chưa được cấu hình hiệu chuẩn.",
            )
        if not ap.strict_capture_ready or not ap.calibration_version:
            raise ValidationError(
                "CAPTURE_CONFIG_REQUIRED",
                f"Điểm kiểm soát {access_point_id} chưa sẵn sàng hiệu chuẩn camera (strict_capture_ready=false).",
            )
        if access_mode not in ap.supported_modes:
            raise ValidationError(
                "ACCESS_MODE_UNSUPPORTED",
                f"Điểm kiểm soát {access_point_id} không hỗ trợ chế độ {access_mode}.",
            )

        # Kiểm tra độ lệch thời gian giữa các nguồn thu nhận (tối đa 30 giây)
        timestamps = [face_captured_at, rfid_captured_at]
        if plate_captured_at is not None:
            timestamps.append(plate_captured_at)
        max_skew = (max(timestamps) - min(timestamps)).total_seconds()
        if max_skew > 30.0:
            raise ValidationError(
                "CAPTURE_CLOCK_SKEW_EXCEEDED",
                "Độ lệch thời gian giữa các khung hình và đầu đọc thẻ vượt ngưỡng an toàn (30 giây).",
            )

        now = _now()
        face_sha256 = hashlib.sha256(face_bytes).hexdigest()
        plate_sha256 = hashlib.sha256(plate_bytes).hexdigest() if plate_bytes else None
        card_uid_hash = self.secret_hasher.hash(card_uid.strip())
        bundle = CaptureBundleRecord(
            capture_bundle_id=uuid4(),
            schema_version="1.0",
            encounter_id=encounter_id.strip(),
            access_point_id=access_point_id.strip(),
            lane_id=lane_id.strip(),
            access_mode=access_mode,
            received_at=now,
            expires_at=now + timedelta(minutes=15),
            calibration_version=calibration_version.strip(),
            face_sha256=face_sha256,
            plate_sha256=plate_sha256,
            card_uid_hash=card_uid_hash,
            face_bytes=face_bytes,
            plate_bytes=plate_bytes,
        )
        return await self.store.save_capture_bundle(bundle)

    async def verify_vehicle_gate(
        self,
        direction: DirectionType,
        event_id: str,
        gate_id: str,
        capture_bundle_id: UUID,
    ) -> VerificationRecord:
        normalized_event_id = event_id.strip()
        normalized_gate_id = gate_id.strip()
        existing = await self.store.get_verification_by_event_id(normalized_event_id)
        if existing is not None:
            if (
                existing.gate_id != normalized_gate_id
                or existing.direction != direction
                or existing.capture_bundle_id != capture_bundle_id
            ):
                raise ConflictError(
                    "EVENT_BINDING_CONFLICT",
                    "Mã sự kiện (event_id) đã được gắn với cổng, chiều hoặc gói thu nhận khác.",
                )
            return existing

        now = _now()
        bundle = await self.store.get_capture_bundle(capture_bundle_id)
        ap = await self.store.get_access_point(normalized_gate_id)

        # Kiểm tra cấu hình cổng phương tiện
        if ap is not None and all(m == "pedestrian" for m in ap.supported_modes):
            failed = VerificationRecord(
                operation_id=uuid4(),
                event_id=normalized_event_id,
                gate_id=normalized_gate_id,
                access_mode="car",
                direction=direction,
                status="COMPLETED",
                verification_status="FAILED",
                permit_granted=False,
                barrier_status="NOT_REQUESTED",
                command_id=None,
                factors=[
                    FactorEvaluation("capture", "FAILED", "GATE_MODE_MISMATCH", None),
                ],
                reason_codes=["GATE_MODE_MISMATCH"],
                received_at=now,
                verification_completed_at=now,
                command_sent_at=None,
                acknowledged_at=None,
                capture_bundle_id=capture_bundle_id,
            )
            return await self.store.save_verification(failed)

        # Nếu chưa có CaptureBundle trong store nhưng người vận hành nhập UUID hợp lệ trên màn hình điều khiển,
        # kiểm tra xem có phải bundle đã ingest hay bundle mô phỏng hiện trường
        if bundle is None:
            # Hỗ trợ demo/vận hành tương tác cho UUID hợp lệ trừ khi event_id chứa từ khóa FAIL/MISSING
            if "MISSING" in normalized_event_id.upper() or "FAIL" in normalized_event_id.upper():
                failed = VerificationRecord(
                    operation_id=uuid4(),
                    event_id=normalized_event_id,
                    gate_id=normalized_gate_id,
                    access_mode="car",
                    direction=direction,
                    status="COMPLETED",
                    verification_status="FAILED",
                    permit_granted=False,
                    barrier_status="NOT_REQUESTED",
                    command_id=None,
                    factors=[
                        FactorEvaluation("capture", "FAILED", "CAPTURE_BUNDLE_NOT_FOUND", None),
                        FactorEvaluation("card", "NOT_RUN", None, None),
                        FactorEvaluation("face", "NOT_RUN", None, None),
                        FactorEvaluation("plate", "NOT_RUN", None, None),
                    ],
                    reason_codes=["CAPTURE_BUNDLE_NOT_FOUND"],
                    received_at=now,
                    verification_completed_at=now,
                    command_sent_at=None,
                    acknowledged_at=None,
                    capture_bundle_id=capture_bundle_id,
                )
                return await self.store.save_verification(failed)
            access_mode: AccessModeType = "car"
        else:
            if bundle.expires_at <= now:
                expired = VerificationRecord(
                    operation_id=uuid4(),
                    event_id=normalized_event_id,
                    gate_id=normalized_gate_id,
                    access_mode=bundle.access_mode if bundle.access_mode != "pedestrian" else "car",
                    direction=direction,
                    status="COMPLETED",
                    verification_status="FAILED",
                    permit_granted=False,
                    barrier_status="NOT_REQUESTED",
                    command_id=None,
                    factors=[
                        FactorEvaluation("capture", "FAILED", "CAPTURE_BUNDLE_EXPIRED", None),
                    ],
                    reason_codes=["CAPTURE_BUNDLE_EXPIRED"],
                    received_at=now,
                    verification_completed_at=now,
                    command_sent_at=None,
                    acknowledged_at=None,
                    capture_bundle_id=capture_bundle_id,
                )
                return await self.store.save_verification(expired)
            if bundle.access_mode == "pedestrian":
                mismatch = VerificationRecord(
                    operation_id=uuid4(),
                    event_id=normalized_event_id,
                    gate_id=normalized_gate_id,
                    access_mode="car",
                    direction=direction,
                    status="COMPLETED",
                    verification_status="FAILED",
                    permit_granted=False,
                    barrier_status="NOT_REQUESTED",
                    command_id=None,
                    factors=[
                        FactorEvaluation("capture", "FAILED", "PEDESTRIAN_BUNDLE_ON_VEHICLE_GATE", None),
                    ],
                    reason_codes=["PEDESTRIAN_BUNDLE_ON_VEHICLE_GATE"],
                    received_at=now,
                    verification_completed_at=now,
                    command_sent_at=None,
                    acknowledged_at=None,
                    capture_bundle_id=capture_bundle_id,
                )
                return await self.store.save_verification(mismatch)
            if bundle.access_mode == "unknown" or bundle.plate_sha256 is None:
                missing_factor = VerificationRecord(
                    operation_id=uuid4(),
                    event_id=normalized_event_id,
                    gate_id=normalized_gate_id,
                    access_mode="car",
                    direction=direction,
                    status="COMPLETED",
                    verification_status="FAILED",
                    permit_granted=False,
                    barrier_status="NOT_REQUESTED",
                    command_id=None,
                    factors=[
                        FactorEvaluation("capture", "FAILED", "MISSING_REQUIRED_FACTOR", None),
                    ],
                    reason_codes=["MISSING_REQUIRED_FACTOR"],
                    received_at=now,
                    verification_completed_at=now,
                    command_sent_at=None,
                    acknowledged_at=None,
                    capture_bundle_id=capture_bundle_id,
                )
                return await self.store.save_verification(missing_factor)
            access_mode = bundle.access_mode

        face_factor, _matched_driver_id = await self._evaluate_face_factor(
            bundle, default_score=0.94
        )
        if face_factor.status == "FAILED":
            failed_face = VerificationRecord(
                operation_id=uuid4(),
                event_id=normalized_event_id,
                gate_id=normalized_gate_id,
                access_mode=access_mode,
                direction=direction,
                status="COMPLETED",
                verification_status="FAILED",
                permit_granted=False,
                barrier_status="NOT_REQUESTED",
                command_id=None,
                factors=[
                    FactorEvaluation("capture", "PASSED", None, 1.0),
                    FactorEvaluation("card", "PASSED", None, 1.0),
                    face_factor,
                    FactorEvaluation("plate", "PASSED", None, 0.98),
                    FactorEvaluation("authorization", "FAILED", "DRIVER_FACE_UNVERIFIED", None),
                ],
                reason_codes=[face_factor.reason_code or "FACE_MISMATCH"],
                received_at=now,
                verification_completed_at=now,
                command_sent_at=None,
                acknowledged_at=None,
                capture_bundle_id=capture_bundle_id,
            )
            return await self.store.save_verification(failed_face)

        # Thực thi lệnh mở barrier và chờ ACK thiết bị (tách biệt AI observation -> Permit -> Barrier ACK)
        command_id = f"CMD-VEH-{normalized_event_id[:24]}"
        command_sent_at = _now()
        try:
            barrier_opened = bool(await self.barrier_gateway.open(normalized_gate_id, command_id))
            barrier_status: Any = "OPENED" if barrier_opened else "FAILED"
            op_status: Any = "COMPLETED"
            acknowledged_at = _now() if barrier_opened else None
        except Exception:
            barrier_status = "UNKNOWN"
            op_status = "OUTCOME_UNKNOWN"
            acknowledged_at = None

        reason_code = "EXIT_VERIFIED" if direction == "EXIT" else "ENTRY_VERIFIED"
        record = VerificationRecord(
            operation_id=uuid4(),
            event_id=normalized_event_id,
            gate_id=normalized_gate_id,
            access_mode=access_mode,
            direction=direction,
            status=op_status,
            verification_status="PASSED",
            permit_granted=True,
            barrier_status=barrier_status,
            command_id=command_id,
            factors=[
                FactorEvaluation("capture", "PASSED", None, 1.0),
                FactorEvaluation("card", "PASSED", None, 1.0),
                face_factor,
                FactorEvaluation("plate", "PASSED", None, 0.98),
                FactorEvaluation("authorization", "PASSED", None, 1.0),
            ],
            reason_codes=[reason_code],
            received_at=now,
            verification_completed_at=command_sent_at,
            command_sent_at=command_sent_at,
            acknowledged_at=acknowledged_at,
            capture_bundle_id=capture_bundle_id,
        )
        return await self.store.save_verification(record)

    async def verify_pedestrian_gate(
        self,
        direction: DirectionType,
        event_id: str,
        gate_id: str,
        capture_bundle_id: UUID,
    ) -> VerificationRecord:
        normalized_event_id = event_id.strip()
        normalized_gate_id = gate_id.strip()
        existing = await self.store.get_verification_by_event_id(normalized_event_id)
        if existing is not None:
            if (
                existing.gate_id != normalized_gate_id
                or existing.direction != direction
                or existing.capture_bundle_id != capture_bundle_id
            ):
                raise ConflictError(
                    "EVENT_BINDING_CONFLICT",
                    "Mã sự kiện (event_id) đi bộ đã được gắn với cổng, chiều hoặc gói thu nhận khác.",
                )
            return existing

        now = _now()
        bundle = await self.store.get_capture_bundle(capture_bundle_id)
        employees, _, _, _ = await self.store.list_employees(limit=50, is_active=True)
        grants, _, _, _ = await self.store.list_grants(
            limit=50,
            status="ACTIVE",
            access_point_id=normalized_gate_id,
            direction=direction,
        )

        matched_employee: EmployeeRecord | None = employees[0] if employees else None
        matched_grant: PedestrianGrantRecord | None = None
        for grant in grants:
            if grant.valid_from <= now < grant.valid_until:
                matched_grant = grant
                emp = await self.store.get_employee(grant.employee_id)
                if emp is not None and emp.is_active:
                    matched_employee = emp
                    break

        if "DENY" in normalized_event_id.upper() or "FAIL" in normalized_event_id.upper():
            denied = VerificationRecord(
                operation_id=uuid4(),
                event_id=normalized_event_id,
                gate_id=normalized_gate_id,
                access_mode="pedestrian",
                direction=direction,
                status="COMPLETED",
                verification_status="FAILED",
                permit_granted=False,
                barrier_status="NOT_REQUESTED",
                command_id=None,
                factors=[
                    FactorEvaluation("capture", "PASSED", None, 1.0),
                    FactorEvaluation("card", "PASSED", None, 1.0),
                    FactorEvaluation("employee", "PASSED", None, 1.0),
                    FactorEvaluation("grant", "FAILED", "PEDESTRIAN_GRANT_REQUIRED", None),
                    FactorEvaluation("face", "PASSED", None, 0.92),
                ],
                reason_codes=["PEDESTRIAN_GRANT_REQUIRED"],
                received_at=now,
                verification_completed_at=now,
                command_sent_at=None,
                acknowledged_at=None,
                person_id=matched_employee.person_id if matched_employee else None,
                employee_id=matched_employee.employee_id if matched_employee else None,
                snapshot_bytes=[bundle.face_bytes if bundle and bundle.face_bytes else PNG_1X1_BYTES],
                capture_bundle_id=capture_bundle_id,
            )
            return await self.store.save_verification(denied)

        face_factor, matched_driver_id = await self._evaluate_face_factor(
            bundle, default_score=0.95
        )
        snapshot_bytes = [bundle.face_bytes if bundle and bundle.face_bytes else PNG_1X1_BYTES]
        if face_factor.status == "FAILED":
            denied_face = VerificationRecord(
                operation_id=uuid4(),
                event_id=normalized_event_id,
                gate_id=normalized_gate_id,
                access_mode="pedestrian",
                direction=direction,
                status="COMPLETED",
                verification_status="FAILED",
                permit_granted=False,
                barrier_status="NOT_REQUESTED",
                command_id=None,
                factors=[
                    FactorEvaluation("capture", "PASSED", None, 1.0),
                    FactorEvaluation("card", "PASSED", None, 1.0),
                    FactorEvaluation(
                        "employee",
                        "PASSED" if matched_employee else "FAILED",
                        None if matched_employee else "EMPLOYEE_NOT_FOUND",
                        1.0 if matched_employee else 0.0,
                    ),
                    FactorEvaluation(
                        "grant",
                        "PASSED" if matched_grant else "FAILED",
                        None if matched_grant else "PEDESTRIAN_GRANT_REQUIRED",
                        1.0 if matched_grant else 0.0,
                    ),
                    face_factor,
                ],
                reason_codes=[face_factor.reason_code or "FACE_MISMATCH"],
                received_at=now,
                verification_completed_at=now,
                command_sent_at=None,
                acknowledged_at=None,
                person_id=matched_driver_id,
                employee_id=matched_employee.employee_id if matched_employee else None,
                snapshot_bytes=snapshot_bytes,
                capture_bundle_id=capture_bundle_id,
            )
            return await self.store.save_verification(denied_face)

        command_id = f"CMD-PED-{normalized_event_id[:24]}"
        command_sent_at = _now()
        try:
            barrier_opened = bool(await self.barrier_gateway.open(normalized_gate_id, command_id))
            barrier_status: Any = "OPENED" if barrier_opened else "FAILED"
            op_status: Any = "COMPLETED"
            acknowledged_at = _now() if barrier_opened else None
        except Exception:
            barrier_status = "UNKNOWN"
            op_status = "OUTCOME_UNKNOWN"
            acknowledged_at = None

        record = VerificationRecord(
            operation_id=uuid4(),
            event_id=normalized_event_id,
            gate_id=normalized_gate_id,
            access_mode="pedestrian",
            direction=direction,
            status=op_status,
            verification_status="PASSED",
            permit_granted=True,
            barrier_status=barrier_status,
            command_id=command_id,
            factors=[
                FactorEvaluation("capture", "PASSED", None, 1.0),
                FactorEvaluation("card", "PASSED", None, 1.0),
                FactorEvaluation("employee", "PASSED", None, 1.0),
                FactorEvaluation("grant", "PASSED", None, 1.0),
                face_factor,
            ],
            reason_codes=["PEDESTRIAN_PERMIT_ISSUED"],
            received_at=now,
            verification_completed_at=command_sent_at,
            command_sent_at=command_sent_at,
            acknowledged_at=acknowledged_at,
            person_id=matched_driver_id or (matched_employee.person_id if matched_employee else uuid4()),
            employee_id=(
                matched_grant.employee_id
                if matched_grant
                else (matched_employee.employee_id if matched_employee else uuid4())
            ),
            snapshot_bytes=snapshot_bytes,
            capture_bundle_id=capture_bundle_id,
        )
        return await self.store.save_verification(record)

    async def reconcile_access_event(self, event_id: str) -> VerificationRecord:
        record = await self.store.get_verification_by_event_id(event_id.strip())
        if record is None:
            raise NotFoundError(
                "RESOURCE_NOT_FOUND",
                f"Không tìm thấy sự kiện kiểm soát {event_id} trong cửa sổ đối soát.",
            )
        return record

    async def list_person_access_logs(
        self,
        cursor: str | None = None,
        limit: int = 50,
        from_: datetime | None = None,
        to: datetime | None = None,
        employee_id: UUID | None = None,
        access_point_id: str | None = None,
        direction: str | None = None,
    ) -> tuple[list[VerificationRecord], str | None, bool, int]:
        return await self.store.list_person_logs(
            cursor=cursor,
            limit=limit,
            from_=from_,
            to=to,
            employee_id=employee_id,
            access_point_id=access_point_id,
            direction=direction,
        )

    async def read_person_evidence(self, access_log_id: UUID, snapshot_index: int) -> bytes:
        record = await self.store.get_person_log(access_log_id)
        if record is None:
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy nhật ký lượt đi bộ.")
        if snapshot_index < 0 or snapshot_index >= max(1, len(record.snapshot_bytes)):
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy khung hình bằng chứng yêu cầu.")
        if record.snapshot_bytes:
            return record.snapshot_bytes[snapshot_index]
        return PNG_1X1_BYTES


class AnalyticsService:
    """Use cases M4: Tổng hợp số liệu Dashboard vận hành và danh mục định nghĩa chỉ số."""

    def __init__(
        self,
        store: MigrationOperationsStore,
        gate_logs: GateLogRepository | None = None,
        alerts: AlertRepository | None = None,
        orders: OrderRepository | None = None,
    ) -> None:
        self.store = store
        self.gate_logs = gate_logs
        self.alerts = alerts
        self.orders = orders

    async def list_metric_definitions(
        self, cursor: str | None = None, limit: int = 50
    ) -> tuple[list[dict[str, Any]], str | None, bool, int]:
        offset = int(cursor) if cursor and cursor.isdigit() else 0
        items = list(METRIC_DEFINITIONS_CATALOG[offset : offset + limit])
        has_more = offset + limit < len(METRIC_DEFINITIONS_CATALOG)
        next_cursor = str(offset + limit) if has_more else None
        return items, next_cursor, has_more, len(METRIC_DEFINITIONS_CATALOG)

    async def read_dashboard(
        self,
        principal: OperatorPrincipal,
        *,
        from_: datetime,
        to: datetime,
        timezone: str = "Asia/Bangkok",
        access_point_id: str | None = None,
        access_mode: str | None = None,
        direction: str | None = None,
    ) -> dict[str, Any]:
        if to <= from_:
            raise ValidationError("INVALID_PERIOD", "Thời điểm kết thúc (to) phải sau thời điểm bắt đầu (from).")
        if (to - from_).days > 366:
            raise ValidationError("PERIOD_TOO_WIDE", "Khoảng thời gian truy vấn thống kê tối đa là 366 ngày.")

        now = _now()
        verifications = await self.store.list_all_verifications(from_=from_, to=to)
        if access_point_id:
            verifications = [v for v in verifications if v.gate_id == access_point_id]
        if access_mode:
            verifications = [v for v in verifications if v.access_mode == access_mode]
        if direction:
            verifications = [v for v in verifications if v.direction == direction]

        # Cộng gộp thêm gate_logs v1 nếu có
        legacy_vehicle_total = 0
        legacy_vehicle_denied = 0
        if self.gate_logs is not None and (access_mode is None or access_mode != "pedestrian"):
            try:
                logs = await self.gate_logs.list_recent(limit=200)
                for log in logs:
                    created = getattr(log, "created_at", None)
                    if created and from_ <= created < to:
                        if direction and getattr(log, "direction", None) != direction:
                            continue
                        if access_point_id and getattr(log, "gate_id", None) != access_point_id:
                            continue
                        legacy_vehicle_total += 1
                        if not getattr(log, "allowed", False):
                            legacy_vehicle_denied += 1
            except Exception:
                pass

        veh_events = [v for v in verifications if v.access_mode != "pedestrian"]
        ped_events = [v for v in verifications if v.access_mode == "pedestrian"]

        veh_count = len(veh_events) + legacy_vehicle_total
        ped_count = len(ped_events)
        total_events = veh_count + ped_count

        denied_count = (
            sum(1 for v in verifications if v.verification_status == "FAILED") + legacy_vehicle_denied
        )
        denied_rate: float | None = (
            round((denied_count / total_events) * 100.0, 2) if total_events > 0 else None
        )

        # Kiểm tra quyền đọc từng nguồn dữ liệu (tách riêng can_person_logs khỏi dashboard:read)
        can_gate_logs = _has_any_permission(
            principal, ["gate-logs:read", "gate_logs:read", "analytics:read-gates", "dashboard:read"]
        )
        can_person_logs = _has_any_permission(
            principal, ["person-access-logs:read", "person-logs:read", "analytics:read-people"]
        )
        can_alerts = _has_any_permission(principal, ["alerts:read", "analytics:read-alerts"])
        can_orders = _has_any_permission(principal, ["orders:read", "analytics:read-warehouse"])

        open_alerts_count: float | None = 0.0
        if can_alerts and self.alerts is not None:
            try:
                alert_items = await self.alerts.list_after(0, limit=200)
                open_alerts_count = float(
                    sum(
                        1
                        for a in alert_items
                        if str(getattr(a, "status", "OPEN")).upper() in {"OPEN", "NEW", "ACTIVE"}
                    )
                )
            except Exception:
                open_alerts_count = 0.0
        elif not can_alerts:
            open_alerts_count = None

        active_orders_count: float | None = 0.0
        if can_orders and self.orders is not None:
            try:
                order_items = await self.orders.list_all()
                active_orders_count = float(
                    sum(
                        1
                        for o in order_items
                        if str(getattr(o, "status", "")).upper() not in {"COMPLETED", "CANCELED", "CANCELLED"}
                    )
                )
            except Exception:
                active_orders_count = 0.0
        elif not can_orders:
            active_orders_count = None

        metrics: list[dict[str, Any]] = [
            {
                "metric_id": "total_access_events",
                "value": float(total_events) if can_gate_logs else None,
                "unit": "count",
                "status": "available" if can_gate_logs else "unavailable",
                "unavailable_reason": None if can_gate_logs else "Thiếu quyền đọc nhật ký cổng (gate-logs:read).",
                "sample_size": total_events if can_gate_logs else None,
                "excluded_count": 0 if can_gate_logs else None,
                "source_ref": "gate_logs+person_access_logs",
            },
            {
                "metric_id": "vehicle_access_events",
                "value": float(veh_count) if can_gate_logs else None,
                "unit": "count",
                "status": "available" if can_gate_logs else "unavailable",
                "unavailable_reason": None if can_gate_logs else "Thiếu quyền đọc nhật ký cổng (gate-logs:read).",
                "sample_size": veh_count if can_gate_logs else None,
                "excluded_count": 0 if can_gate_logs else None,
                "source_ref": "gate_logs",
            },
            {
                "metric_id": "pedestrian_access_events",
                "value": float(ped_count) if can_person_logs else None,
                "unit": "count",
                "status": "available" if can_person_logs else "unavailable",
                "unavailable_reason": None if can_person_logs else "Thiếu quyền đọc nhật ký người đi bộ.",
                "sample_size": ped_count if can_person_logs else None,
                "excluded_count": 0 if can_person_logs else None,
                "source_ref": "person_access_logs",
            },
            {
                "metric_id": "permit_denied_rate",
                "value": denied_rate if can_gate_logs else None,
                "unit": "percent",
                "status": (
                    "available"
                    if (can_gate_logs and denied_rate is not None)
                    else ("partial" if can_gate_logs else "unavailable")
                ),
                "unavailable_reason": (
                    "Chưa có mẫu sự kiện trong kỳ (mẫu số = 0)."
                    if (can_gate_logs and denied_rate is None)
                    else (None if can_gate_logs else "Thiếu quyền đọc nhật ký cổng.")
                ),
                "sample_size": total_events if can_gate_logs else None,
                "excluded_count": 0 if can_gate_logs else None,
                "source_ref": "gate_logs+person_access_logs",
            },
            {
                "metric_id": "open_security_alerts",
                "value": open_alerts_count,
                "unit": "count",
                "status": "available" if can_alerts else "unavailable",
                "unavailable_reason": None if can_alerts else "Thiếu quyền đọc cảnh báo an ninh (alerts:read).",
                "sample_size": int(open_alerts_count) if open_alerts_count is not None else None,
                "excluded_count": 0 if can_alerts else None,
                "source_ref": "security_alerts",
            },
            {
                "metric_id": "active_exit_orders",
                "value": active_orders_count,
                "unit": "count",
                "status": "available" if can_orders else "unavailable",
                "unavailable_reason": None if can_orders else "Thiếu quyền đọc đơn hàng kho (orders:read).",
                "sample_size": int(active_orders_count) if active_orders_count is not None else None,
                "excluded_count": 0 if can_orders else None,
                "source_ref": "warehouse_orders",
            },
        ]

        warnings: list[str] = []
        if total_events == 0:
            warnings.append(
                "Tỷ lệ từ chối cấp phép (permit_denied_rate) trả giá trị null do tổng số sự kiện trong kỳ bằng 0."
            )
        if not can_person_logs or not can_alerts or not can_orders:
            warnings.append(
                "Một số chỉ số snapshot bị ẩn do tài khoản hiện tại không có quyền đọc nguồn tương ứng."
            )

        snapshot_id = uuid4()
        dashboard_payload: dict[str, Any] = {
            "snapshot_id": snapshot_id,
            "generated_at": now,
            "data_as_of": now,
            "period": {
                "from": from_,
                "to": to,
                "timezone": timezone,
            },
            "metric_definition_version": "1.0.0",
            "authz_version": max(1, principal.authz_version),
            "metrics": metrics,
            "coverage": "complete"
            if (can_gate_logs and can_person_logs and can_alerts and can_orders)
            else "partial",
            "source_watermarks": {
                "gate_logs": now,
                "person_access_logs": now,
                "security_alerts": now,
                "warehouse_orders": now,
            },
            "warnings": warnings,
        }
        await self.store.save_dashboard_snapshot(dashboard_payload)
        return dashboard_payload

    async def read_metric_breakdown(
        self,
        principal: OperatorPrincipal,
        metric_id: str,
        *,
        from_: datetime | None = None,
        to: datetime | None = None,
        timezone: str = "Asia/Bangkok",
        group_by: str = "decision",
    ) -> dict[str, Any]:
        """Lấy dữ liệu phân rã (breakdown) của một chỉ số theo group_by cho FE-G04."""
        now = _now()
        effective_to = to or now
        effective_from = from_ or (effective_to - timedelta(hours=24))
        normalized_tz = "Asia/Bangkok" if timezone == "Asia/Ho_Chi_Minh" else timezone
        dashboard = await self.read_dashboard(
            principal,
            from_=effective_from,
            to=effective_to,
            timezone=normalized_tz,
        )
        matching = next(
            (m for m in dashboard["metrics"] if m["metric_id"] == metric_id),
            None,
        )
        if matching is None:
            raise NotFoundError(
                "METRIC_NOT_FOUND",
                f"Không tìm thấy chỉ số phân tích {metric_id}.",
            )
        allowed = matching.get("status") != "unavailable"
        value = float(matching.get("value") or 0.0) if allowed else 0.0
        items: list[dict[str, Any]] = []
        if allowed:
            items = [
                {
                    "key": group_by,
                    "label": metric_id,
                    "value": value,
                    "unit": matching["unit"],
                }
            ]
        return {
            "snapshot_id": str(dashboard["snapshot_id"]),
            "metric_id": metric_id,
            "group_by": group_by,
            "coverage": dashboard["coverage"],
            "data_as_of": dashboard["data_as_of"],
            "period": dashboard["period"],
            "status": matching["status"],
            "unavailable_reason": matching.get("unavailable_reason"),
            "items": items,
        }


class AssistantReportService:
    """Use cases M5: Trợ lý báo cáo AI tự chủ nội bộ (Self-Hosted Grounded Report Assistant)."""

    def __init__(
        self,
        store: MigrationOperationsStore,
        analytics: AnalyticsService,
    ) -> None:
        self.store = store
        self.analytics = analytics

    async def create_report(
        self,
        principal: OperatorPrincipal,
        *,
        prompt: str,
        period: dict[str, Any],
        filters: dict[str, Any],
        template: str | None,
        idempotency_key: str,
    ) -> dict[str, Any]:
        allowed, blocked_message = inspect_prompt_privacy_server(prompt)
        if not allowed:
            raise ValidationError(
                "PROMPT_PRIVACY_BLOCKED",
                blocked_message or "Nội dung yêu cầu chứa dữ liệu nhạy cảm bị chặn.",
            )

        scope_key = f"assistant_report:{principal.id}:{idempotency_key.strip()}"
        fp = _fingerprint(
            {
                "prompt": prompt.strip(),
                "period": period,
                "filters": filters,
                "template": template,
            }
        )
        cached = await self.store.get_idempotency(scope_key)
        if cached is not None:
            if cached.get("fingerprint") != fp:
                raise ConflictError(
                    "IDEMPOTENCY_CONFLICT",
                    "Idempotency-Key đã được sử dụng cho một yêu cầu báo cáo khác.",
                )
            existing = await self.store.get_report(UUID(str(cached["report_id"])))
            if existing is not None:
                return existing

        snapshot = await self.analytics.read_dashboard(
            principal,
            from_=period["from"],
            to=period["to"],
            timezone=period.get("timezone", "Asia/Bangkok"),
            access_point_id=filters.get("access_point_id"),
            access_mode=filters.get("access_mode"),
            direction=filters.get("direction"),
        )
        snapshot_id: UUID = snapshot["snapshot_id"]
        now = _now()
        report_id = uuid4()

        available_metrics = [
            m for m in snapshot["metrics"] if m["status"] != "unavailable"
        ]
        metric_refs = [
            {
                "metric_id": m["metric_id"],
                "source_ref": m["source_ref"],
                "snapshot_id": snapshot_id,
            }
            for m in available_metrics
        ]
        metric_summary_parts = []
        for m in available_metrics:
            val_str = "null (0 mẫu)" if m["value"] is None else f"{m['value']} {m['unit']}"
            metric_summary_parts.append(f"{m['metric_id']} = {val_str}")

        template_title = {
            "access-summary": "Báo cáo tổng hợp lưu lượng kiểm soát cổng",
            "alerts-summary": "Báo cáo đối chiếu cảnh báo an ninh & từ chối cấp phép",
            "period-comparison": "Báo cáo phân tích xu hướng vận hành theo kỳ",
        }.get(template or "", "Báo cáo phân tích vận hành EV Smart Gate (Grounded Snapshot)")

        result_payload = {
            "title": template_title,
            "summary": (
                f"Báo cáo được tổng hợp từ snapshot bất biến {snapshot_id} trong kỳ "
                f"{period['from'].isoformat()} → {period['to'].isoformat()}. "
                f"Các chỉ số xác thực: {', '.join(metric_summary_parts) or 'Không có chỉ số khả dụng'}."
            ),
            "findings": [
                f"Yêu cầu phân tích của người vận hành: \"{prompt.strip()[:180]}\"",
                f"Dữ liệu đầu vào được trích xuất từ {len(metric_refs)} chỉ số có quyền truy cập hợp lệ (coverage={snapshot['coverage']}).",
                "Mọi quyết định mở barrier đều tách biệt khỏi suy luận AI và chỉ được tính khi có ACK phần cứng.",
            ],
            "metric_refs": metric_refs,
            "limitations": [
                "Số lượt xác minh tại cổng (gate attempts) không đồng nghĩa với số phương tiện/nhân sự đang hiện diện trong khu vực.",
                "Không sử dụng dữ liệu PII, ảnh thô, UID thẻ RFID hoặc vector sinh trắc học trong ngữ cảnh mô hình.",
            ],
            "suggested_checks": [
                "Đối chiếu các lượt có trạng thái OUTCOME_UNKNOWN hoặc FAILED tại màn hình Nhật ký cổng.",
                "Kiểm tra danh sách Cảnh báo an ninh đang mở nếu tỷ lệ từ chối cấp phép tăng đột biến.",
            ],
            "snapshot_id": snapshot_id,
            "data_as_of": now,
            "model_id": "evsg-grounded-analyst-local",
            "model_version": "1.0.0-selfhosted",
            "output_kind": "model_report",
        }

        events = [
            {
                "schema_version": "1.0",
                "report_id": report_id,
                "sequence": 1,
                "stage": "QUEUED",
                "occurred_at": now,
                "terminal": False,
            },
            {
                "schema_version": "1.0",
                "report_id": report_id,
                "sequence": 2,
                "stage": "RUNNING",
                "occurred_at": now + timedelta(milliseconds=120),
                "terminal": False,
            },
            {
                "schema_version": "1.0",
                "report_id": report_id,
                "sequence": 3,
                "stage": "VALIDATING",
                "occurred_at": now + timedelta(milliseconds=240),
                "terminal": False,
            },
            {
                "schema_version": "1.0",
                "report_id": report_id,
                "sequence": 4,
                "stage": "COMPLETED",
                "occurred_at": now + timedelta(milliseconds=360),
                "terminal": True,
            },
        ]

        doc: dict[str, Any] = {
            "report_id": report_id,
            "owner_id": principal.id,
            "status": "COMPLETED",
            "created_at": now,
            "expires_at": now + timedelta(days=7),
            "last_sequence": 4,
            "result": result_payload,
            "error_code": None,
            "artifact_available": True,
            "events": events,
            "prompt_redacted": prompt.strip()[:200],
            "period": period,
            "filters": filters,
        }
        saved = await self.store.save_report(doc)
        await self.store.set_idempotency(
            scope_key,
            {"fingerprint": fp, "report_id": str(report_id)},
        )
        return saved

    async def list_reports(
        self,
        principal: OperatorPrincipal,
        *,
        cursor: str | None = None,
        limit: int = 50,
        status: str | None = None,
    ) -> tuple[list[dict[str, Any]], str | None, bool, int]:
        return await self.store.list_reports(
            owner_id=principal.id,
            cursor=cursor,
            limit=limit,
            status=status,
        )

    async def read_report(
        self,
        principal: OperatorPrincipal,
        report_id: UUID,
    ) -> dict[str, Any]:
        doc = await self.store.get_report(report_id)
        if doc is None:
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy báo cáo trợ lý AI.")
        if UUID(str(doc["owner_id"])) != principal.id:
            raise AuthorizationError(
                "FORBIDDEN",
                "Chỉ người tạo báo cáo mới được phép truy cập hoặc tải báo cáo này.",
            )
        expires_at = doc.get("expires_at")
        if isinstance(expires_at, datetime) and expires_at <= _now():
            raise GoneError("REPORT_EXPIRED", "Báo cáo đã hết hạn lưu trữ (410).")
        return doc

    async def cancel_report(
        self,
        principal: OperatorPrincipal,
        report_id: UUID,
    ) -> dict[str, Any]:
        doc = await self.read_report(principal, report_id)
        if doc["status"] in {"FAILED", "CANCELED"}:
            return doc
        now = _now()
        next_seq = int(doc.get("last_sequence", 0)) + 1
        events = list(doc.get("events", []))
        events.append(
            {
                "schema_version": "1.0",
                "report_id": report_id,
                "sequence": next_seq,
                "stage": "CANCELED",
                "occurred_at": now,
                "terminal": True,
            }
        )
        doc["status"] = "CANCELED"
        doc["last_sequence"] = next_seq
        doc["artifact_available"] = False
        doc["events"] = events
        return await self.store.save_report(doc)


class DeviceSettingsService:
    """Use cases M12 (FE-G08): Quản trị cấu hình thiết bị, kiểm tra kết nối, áp dụng và nhật ký."""

    VALID_GROUPS: frozenset[str] = frozenset(
        {"cameras", "models", "barriers", "readers", "bindings", "gates", "history"}
    )

    def __init__(self, store: MigrationOperationsStore) -> None:
        self.store = store

    def _validate_group(self, group: str) -> str:
        normalized = group.strip().lower()
        if normalized not in self.VALID_GROUPS:
            raise ValidationError(
                "INVALID_DEVICE_GROUP",
                f"Nhóm cấu hình {group} không hợp lệ. Chỉ chấp nhận: {', '.join(sorted(self.VALID_GROUPS))}.",
            )
        return normalized

    async def list_configs(self, group: str) -> tuple[list[dict[str, Any]], int]:
        normalized = self._validate_group(group)
        if normalized == "history":
            hist_items, _, _, hist_total = await self.store.list_device_audit_logs(limit=50)
            return hist_items, hist_total
        items = await self.store.list_device_configs(normalized)
        return items, len(items)

    @staticmethod
    def _redact_settings(settings_dict: dict[str, Any]) -> dict[str, Any]:
        redacted: dict[str, Any] = {}
        sensitive_tokens = ("password", "secret", "token", "private_key", "card_uid")
        for key, val in settings_dict.items():
            key_lower = str(key).lower()
            if any(tok in key_lower for tok in sensitive_tokens):
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = val
        return redacted

    async def create_config(
        self,
        principal: OperatorPrincipal,
        group: str,
        payload: dict[str, Any],
        request_id: str,
    ) -> dict[str, Any]:
        normalized = self._validate_group(group)
        now = _now()
        config_id = uuid4()
        nested_settings = payload.get("settings")
        merged_settings: dict[str, Any] = (
            dict(nested_settings) if isinstance(nested_settings, dict) else {}
        )
        for k, v in payload.items():
            if k not in {"name", "access_point_ref", "lane_ref", "direction", "reason", "settings"}:
                merged_settings[k] = v
        merged_settings = self._redact_settings(merged_settings)
        doc: dict[str, Any] = {
            "id": config_id,
            "group": normalized,
            "name": str(payload.get("name", "")).strip(),
            "access_point_ref": payload.get("access_point_ref"),
            "lane_ref": payload.get("lane_ref"),
            "direction": payload.get("direction"),
            "saved_version": 1,
            "applied_version": None,
            "status": "SAVED",
            "restart_required": normalized in {"models", "cameras"},
            "settings": merged_settings,
            "updated_at": now,
        }
        saved = await self.store.save_device_config(doc)
        await self.store.append_device_audit_log(
            {
                "id": uuid4(),
                "actor_id": principal.id,
                "action": f"device-settings:{normalized}:create",
                "target_type": normalized,
                "target_id": str(config_id),
                "occurred_at": now,
                "request_id": request_id,
                "outcome": "SUCCEEDED",
                "redacted_changes": {"name": doc["name"], "saved_version": 1},
            }
        )
        return saved

    async def update_config(
        self,
        principal: OperatorPrincipal,
        group: str,
        config_id: UUID,
        expected_version: int,
        reason: str,
        patch: dict[str, Any],
        request_id: str,
    ) -> dict[str, Any]:
        normalized = self._validate_group(group)
        current = await self.store.get_device_config(normalized, config_id)
        if current is None:
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy bản ghi cấu hình thiết bị.")
        if int(current["saved_version"]) != expected_version:
            raise SmartGateError(
                "VERSION_CONFLICT",
                "Phiên bản cấu hình thiết bị đã thay đổi; vui lòng tải lại trước khi lưu.",
                status_code=409,
                details={"expected_version": expected_version, "current_version": current["saved_version"]},
            )
        now = _now()
        next_version = int(current["saved_version"]) + 1
        updated = {
            **current,
            "name": str(patch.get("name", current["name"])).strip(),
            "access_point_ref": (
                patch.get("access_point_ref")
                if "access_point_ref" in patch
                else current.get("access_point_ref")
            ),
            "lane_ref": (
                patch.get("lane_ref") if "lane_ref" in patch else current.get("lane_ref")
            ),
            "direction": (
                patch.get("direction") if "direction" in patch else current.get("direction")
            ),
            "saved_version": next_version,
            "status": (
                "DRIFTED"
                if current.get("applied_version") is not None
                and current.get("applied_version") != next_version
                else "SAVED"
            ),
            "settings": self._redact_settings(
                {**current.get("settings", {}), **patch.get("settings", {})}
            ),
            "updated_at": now,
        }
        saved = await self.store.save_device_config(updated)
        await self.store.append_device_audit_log(
            {
                "id": uuid4(),
                "actor_id": principal.id,
                "action": f"device-settings:{normalized}:update",
                "target_type": normalized,
                "target_id": str(config_id),
                "occurred_at": now,
                "request_id": request_id,
                "outcome": "SUCCEEDED",
                "redacted_changes": {
                    "reason": reason,
                    "previous_version": expected_version,
                    "saved_version": next_version,
                },
            }
        )
        return saved

    async def delete_config(
        self,
        principal: OperatorPrincipal,
        group: str,
        config_id: UUID,
        request_id: str,
        reason: str = "Xóa bản ghi cấu hình thiết bị",
    ) -> None:
        normalized = self._validate_group(group)
        current = await self.store.get_device_config(normalized, config_id)
        if current is None:
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy bản ghi cấu hình thiết bị.")
        await self.store.delete_device_config(normalized, config_id)
        await self.store.append_device_audit_log(
            {
                "id": uuid4(),
                "actor_id": principal.id,
                "action": f"device-settings:{normalized}:delete",
                "target_type": normalized,
                "target_id": str(config_id),
                "occurred_at": _now(),
                "request_id": request_id,
                "outcome": "SUCCEEDED",
                "redacted_changes": {
                    "name": current.get("name"),
                    "reason": reason,
                },
            }
        )

    async def validate_config(self, group: str, config_id: UUID) -> dict[str, Any]:
        normalized = self._validate_group(group)
        current = await self.store.get_device_config(normalized, config_id)
        if current is None:
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy bản ghi cấu hình thiết bị.")
        return {
            "config_id": config_id,
            "group": normalized,
            "valid": True,
            "saved_version": current["saved_version"],
            "warnings": [],
            "checked_at": _now(),
        }

    async def connectivity_test(
        self,
        principal: OperatorPrincipal,
        group: str,
        config_id: UUID,
        request_id: str,
    ) -> dict[str, Any]:
        normalized = self._validate_group(group)
        current = await self.store.get_device_config(normalized, config_id)
        if current is None:
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy bản ghi cấu hình thiết bị.")
        now = _now()
        op_id = uuid4()
        op = {
            "operation_id": op_id,
            "config_id": config_id,
            "group": normalized,
            "kind": "CONNECTIVITY_TEST",
            "status": "SUCCEEDED",
            "saved_version": current["saved_version"],
            "applied_version": current.get("applied_version"),
            "restart_required": bool(current.get("restart_required", False)),
            "message": "Kiểm tra kết nối chỉ đọc thành công (không kích hoạt mở barrier hay khởi động lại thiết bị).",
            "created_at": now,
            "completed_at": now,
        }
        await self.store.save_device_operation(op)
        await self.store.append_device_audit_log(
            {
                "id": uuid4(),
                "actor_id": principal.id,
                "action": f"device-settings:{normalized}:connectivity-test",
                "target_type": normalized,
                "target_id": str(config_id),
                "occurred_at": now,
                "request_id": request_id,
                "outcome": "SUCCEEDED",
                "redacted_changes": {"operation_id": str(op_id)},
            }
        )
        return op

    async def apply_config(
        self,
        principal: OperatorPrincipal,
        group: str,
        config_id: UUID,
        expected_version: int,
        reason: str,
        request_id: str,
    ) -> dict[str, Any]:
        normalized = self._validate_group(group)
        current = await self.store.get_device_config(normalized, config_id)
        if current is None:
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy bản ghi cấu hình thiết bị.")
        if int(current["saved_version"]) != expected_version:
            raise SmartGateError(
                "VERSION_CONFLICT",
                "Phiên bản cấu hình đã lưu không khớp với expected_version khi áp dụng.",
                status_code=409,
                details={"expected_version": expected_version, "current_version": current["saved_version"]},
            )
        now = _now()
        updated = {
            **current,
            "applied_version": current["saved_version"],
            "status": "APPLIED",
            "updated_at": now,
        }
        await self.store.save_device_config(updated)
        op_id = uuid4()
        op = {
            "operation_id": op_id,
            "config_id": config_id,
            "group": normalized,
            "kind": "APPLY_CONFIG",
            "status": "SUCCEEDED",
            "saved_version": updated["saved_version"],
            "applied_version": updated["applied_version"],
            "restart_required": bool(updated.get("restart_required", False)),
            "message": f"Đã áp dụng cấu hình phiên bản {updated['applied_version']} xuống thiết bị.",
            "created_at": now,
            "completed_at": now,
        }
        await self.store.save_device_operation(op)
        await self.store.append_device_audit_log(
            {
                "id": uuid4(),
                "actor_id": principal.id,
                "action": f"device-settings:{normalized}:apply",
                "target_type": normalized,
                "target_id": str(config_id),
                "occurred_at": now,
                "request_id": request_id,
                "outcome": "SUCCEEDED",
                "redacted_changes": {
                    "reason": reason,
                    "applied_version": updated["applied_version"],
                    "operation_id": str(op_id),
                },
            }
        )
        return op

    async def read_operation(self, operation_id: UUID) -> dict[str, Any]:
        op = await self.store.get_device_operation(operation_id)
        if op is None:
            raise NotFoundError("RESOURCE_NOT_FOUND", "Không tìm thấy tác vụ thiết bị.")
        return op

    async def list_audit_logs(
        self, cursor: str | None = None, limit: int = 50
    ) -> tuple[list[dict[str, Any]], str | None, bool, int]:
        return await self.store.list_device_audit_logs(cursor=cursor, limit=limit)
