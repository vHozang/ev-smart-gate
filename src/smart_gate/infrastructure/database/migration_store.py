from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from smart_gate.domain.core_access import (
    AccessPointConfig,
    CaptureBundleRecord,
    EmployeeRecord,
    FactorEvaluation,
    PedestrianGrantRecord,
    VerificationRecord,
)
from smart_gate.infrastructure.database.client import MongoDatabase

DEFAULT_ACCESS_POINTS: tuple[AccessPointConfig, ...] = (
    AccessPointConfig(
        id="GATE-VEH-01",
        name="Cổng phương tiện chính 01",
        supported_modes=["motorcycle", "car", "truck"],
        directions=["ENTRY", "EXIT"],
        calibration_version="cal-veh-2026-v1",
        strict_capture_ready=True,
    ),
    AccessPointConfig(
        id="GATE-VEH-02",
        name="Cổng phương tiện phụ 02",
        supported_modes=["motorcycle", "car", "truck"],
        directions=["ENTRY", "EXIT"],
        calibration_version="cal-veh-2026-v1",
        strict_capture_ready=True,
    ),
    AccessPointConfig(
        id="PED-TURNSTILE-01",
        name="Cổng xoay nhân viên đi bộ 01",
        supported_modes=["pedestrian"],
        directions=["ENTRY", "EXIT"],
        calibration_version="cal-ped-2026-v1",
        strict_capture_ready=True,
    ),
    AccessPointConfig(
        id="gate-in-01",
        name="Cổng vào 01 (Edge Simulator)",
        supported_modes=["motorcycle", "car", "truck"],
        directions=["ENTRY", "EXIT"],
        calibration_version="cal-veh-2026-v1",
        strict_capture_ready=True,
    ),
)


def _default_device_configs() -> list[dict[str, Any]]:
    now = datetime(2026, 10, 20, 0, 0, tzinfo=UTC)
    return [
        {
            "id": uuid5(NAMESPACE_URL, "ev-smart-gate/device-config/cameras/cam-face-01"),
            "group": "cameras",
            "name": "Camera khuôn mặt Làn vào 01",
            "access_point_ref": "GATE-VEH-01",
            "lane_ref": "lane-entry-01",
            "direction": "ENTRY",
            "saved_version": 1,
            "applied_version": 1,
            "status": "APPLIED",
            "restart_required": False,
            "settings": {
                "purpose": "FACE",
                "connection_profile_ref": "profile-cam-face-01",
                "calibration_version": "cal-veh-2026-v1",
            },
            "updated_at": now,
        },
        {
            "id": uuid5(NAMESPACE_URL, "ev-smart-gate/device-config/models/model-face-sface"),
            "group": "models",
            "name": "Mô hình nhận diện khuôn mặt SFace",
            "access_point_ref": "GATE-VEH-01",
            "lane_ref": "lane-entry-01",
            "direction": "ENTRY",
            "saved_version": 1,
            "applied_version": 1,
            "status": "APPLIED",
            "restart_required": True,
            "settings": {
                "model_ref": "sface-2026-int8",
                "model_version": "v1.0.0",
                "task": "FACE_VERIFICATION",
            },
            "updated_at": now,
        },
        {
            "id": uuid5(NAMESPACE_URL, "ev-smart-gate/device-config/barriers/barrier-veh-01"),
            "group": "barriers",
            "name": "Barrier cổng phương tiện chính 01",
            "access_point_ref": "GATE-VEH-01",
            "lane_ref": "lane-entry-01",
            "direction": "ENTRY",
            "saved_version": 1,
            "applied_version": 1,
            "status": "APPLIED",
            "restart_required": False,
            "settings": {
                "connection_profile_ref": "profile-barrier-01",
                "timeout_ms": 3000,
            },
            "updated_at": now,
        },
        {
            "id": uuid5(NAMESPACE_URL, "ev-smart-gate/device-config/readers/reader-rfid-01"),
            "group": "readers",
            "name": "Đầu đọc thẻ RFID Làn vào 01",
            "access_point_ref": "GATE-VEH-01",
            "lane_ref": "lane-entry-01",
            "direction": "ENTRY",
            "saved_version": 1,
            "applied_version": 1,
            "status": "APPLIED",
            "restart_required": False,
            "settings": {
                "connection_profile_ref": "profile-reader-01",
                "debounce_ms": 1500,
            },
            "updated_at": now,
        },
        {
            "id": uuid5(NAMESPACE_URL, "ev-smart-gate/device-config/bindings/binding-veh-01"),
            "group": "bindings",
            "name": "Liên kết Làn vào Ô tô Cổng 01",
            "access_point_ref": "GATE-VEH-01",
            "lane_ref": "lane-entry-01",
            "direction": "ENTRY",
            "saved_version": 1,
            "applied_version": 1,
            "status": "APPLIED",
            "restart_required": False,
            "settings": {
                "access_mode": "CAR",
                "face_camera_ref": "cam-face-01",
                "plate_camera_ref": "cam-plate-01",
                "reader_ref": "reader-rfid-01",
                "barrier_ref": "barrier-veh-01",
            },
            "updated_at": now,
        },
        {
            "id": uuid5(NAMESPACE_URL, "ev-smart-gate/device-config/gates/gate-veh-01"),
            "group": "gates",
            "name": "Cổng phương tiện chính 01",
            "access_point_ref": "GATE-VEH-01",
            "lane_ref": "lane-entry-01",
            "direction": "ENTRY",
            "saved_version": 1,
            "applied_version": 1,
            "status": "APPLIED",
            "restart_required": False,
            "settings": {
                "supported_modes": ["motorcycle", "car", "truck"],
                "strict_capture_ready": True,
            },
            "updated_at": now,
        },
    ]


def _paginate_list(
    items: list[Any], cursor: str | None, limit: int
) -> tuple[list[Any], str | None, bool, int]:
    total = len(items)
    offset = int(cursor) if (cursor and cursor.isdigit()) else 0
    sliced = items[offset : offset + limit]
    has_more = offset + limit < total
    next_cursor = str(offset + limit) if has_more else None
    return sliced, next_cursor, has_more, total


def _ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class HybridMigrationStore:
    """Adapter lưu trữ MongoDB với fallback bộ nhớ cho unit test cô lập (M3, M4, M5, FE-G08)."""

    def __init__(self, database: MongoDatabase | None = None) -> None:
        self.database = database
        self._idempotency: dict[str, dict[str, Any]] = {}
        self._access_points: dict[str, AccessPointConfig] = {
            ap.id: ap for ap in DEFAULT_ACCESS_POINTS
        }
        self._employees: dict[UUID, EmployeeRecord] = {}
        self._grants: dict[UUID, PedestrianGrantRecord] = {}
        self._bundles: dict[UUID, CaptureBundleRecord] = {}
        self._verifications_by_event: dict[str, VerificationRecord] = {}
        self._verifications_by_op: dict[UUID, VerificationRecord] = {}
        self._snapshots: dict[UUID, dict[str, Any]] = {}
        self._reports: dict[UUID, dict[str, Any]] = {}
        self._device_configs: dict[tuple[str, UUID], dict[str, Any]] = {
            (str(cfg["group"]), cfg["id"]): cfg for cfg in _default_device_configs()
        }
        self._device_operations: dict[UUID, dict[str, Any]] = {}
        self._device_audit_logs: list[dict[str, Any]] = []

    def _col(self, name: str):
        if self.database is not None and self.database.client is not None:
            return self.database.client[self.database.settings.mongodb_database][name]
        return None

    async def initialize(self) -> None:
        """Khởi tạo dữ liệu danh mục điểm kiểm soát mặc định trên MongoDB nếu trống."""
        col = self._col("migration_access_points")
        if col is not None:
            for ap in DEFAULT_ACCESS_POINTS:
                await col.replace_one(
                    {"_id": ap.id},
                    {
                        "_id": ap.id,
                        "name": ap.name,
                        "supported_modes": list(ap.supported_modes),
                        "directions": list(ap.directions),
                        "calibration_version": ap.calibration_version,
                        "strict_capture_ready": ap.strict_capture_ready,
                    },
                    upsert=True,
                )

    async def get_idempotency(self, key: str) -> dict[str, Any] | None:
        if key in self._idempotency:
            return self._idempotency[key]
        col = self._col("migration_idempotency")
        if col is not None:
            doc = await col.find_one({"_id": key})
            if doc is not None:
                data = dict(doc)
                data.pop("_id", None)
                self._idempotency[key] = data
                return data
        return None

    async def set_idempotency(self, key: str, value: dict[str, Any]) -> None:
        self._idempotency[key] = dict(value)
        col = self._col("migration_idempotency")
        if col is not None:
            await col.replace_one({"_id": key}, {"_id": key, **value}, upsert=True)

    async def list_access_points(
        self, cursor: str | None = None, limit: int = 50
    ) -> tuple[list[AccessPointConfig], str | None, bool, int]:
        items = list(self._access_points.values())
        return _paginate_list(items, cursor, limit)

    async def get_access_point(self, access_point_id: str) -> AccessPointConfig | None:
        return self._access_points.get(access_point_id)

    async def list_employees(
        self,
        cursor: str | None = None,
        limit: int = 50,
        search: str | None = None,
        is_active: bool | None = None,
    ) -> tuple[list[EmployeeRecord], str | None, bool, int]:
        col = self._col("migration_employees")
        if col is not None and not self._employees:
            async for doc in col.find({}):
                emp = EmployeeRecord(
                    employee_id=doc["_id"],
                    person_id=doc["person_id"],
                    employee_code=doc["employee_code"],
                    is_active=bool(doc["is_active"]),
                    version=int(doc["version"]),
                    created_at=_ensure_utc(doc["created_at"]) or datetime.now(UTC),
                )
                self._employees[emp.employee_id] = emp
        items = sorted(self._employees.values(), key=lambda x: x.created_at, reverse=True)
        if is_active is not None:
            items = [x for x in items if x.is_active == is_active]
        if search:
            q = search.strip().lower()
            items = [x for x in items if q in x.employee_code.lower()]
        return _paginate_list(items, cursor, limit)

    async def get_employee(self, employee_id: UUID) -> EmployeeRecord | None:
        if employee_id in self._employees:
            return self._employees[employee_id]
        col = self._col("migration_employees")
        if col is not None:
            doc = await col.find_one({"_id": employee_id})
            if doc is not None:
                emp = EmployeeRecord(
                    employee_id=doc["_id"],
                    person_id=doc["person_id"],
                    employee_code=doc["employee_code"],
                    is_active=bool(doc["is_active"]),
                    version=int(doc["version"]),
                    created_at=_ensure_utc(doc["created_at"]) or datetime.now(UTC),
                )
                self._employees[emp.employee_id] = emp
                return emp
        return None

    async def get_employee_by_code(self, employee_code: str) -> EmployeeRecord | None:
        norm = employee_code.strip().upper()
        for emp in self._employees.values():
            if emp.employee_code.strip().upper() == norm:
                return emp
        col = self._col("migration_employees")
        if col is not None:
            doc = await col.find_one({"employee_code_normalized": norm})
            if doc is not None:
                emp = EmployeeRecord(
                    employee_id=doc["_id"],
                    person_id=doc["person_id"],
                    employee_code=doc["employee_code"],
                    is_active=bool(doc["is_active"]),
                    version=int(doc["version"]),
                    created_at=_ensure_utc(doc["created_at"]) or datetime.now(UTC),
                )
                self._employees[emp.employee_id] = emp
                return emp
        return None

    async def save_employee(self, record: EmployeeRecord) -> EmployeeRecord:
        self._employees[record.employee_id] = record
        col = self._col("migration_employees")
        if col is not None:
            await col.replace_one(
                {"_id": record.employee_id},
                {
                    "_id": record.employee_id,
                    "person_id": record.person_id,
                    "employee_code": record.employee_code,
                    "employee_code_normalized": record.employee_code.strip().upper(),
                    "is_active": record.is_active,
                    "version": record.version,
                    "created_at": record.created_at,
                },
                upsert=True,
            )
        return record

    async def delete_employee(self, employee_id: UUID) -> bool:
        existed = self._employees.pop(employee_id, None) is not None
        col = self._col("migration_employees")
        if col is not None:
            res = await col.delete_one({"_id": employee_id})
            existed = existed or (res.deleted_count > 0)
        return existed

    async def list_grants(
        self,
        cursor: str | None = None,
        limit: int = 50,
        status: str | None = None,
        employee_id: UUID | None = None,
        access_point_id: str | None = None,
        direction: str | None = None,
    ) -> tuple[list[PedestrianGrantRecord], str | None, bool, int]:
        col = self._col("migration_pedestrian_grants")
        if col is not None and not self._grants:
            async for doc in col.find({}):
                g = PedestrianGrantRecord(
                    id=doc["_id"],
                    employee_id=doc["employee_id"],
                    access_point_ids=list(doc["access_point_ids"]),
                    directions=list(doc["directions"]),
                    valid_from=_ensure_utc(doc["valid_from"]) or datetime.now(UTC),
                    valid_until=_ensure_utc(doc["valid_until"]) or datetime.now(UTC),
                    reason=doc["reason"],
                    status=doc["status"],
                    version=int(doc["version"]),
                    created_at=_ensure_utc(doc.get("created_at")) or datetime.now(UTC),
                )
                self._grants[g.id] = g
        items = sorted(self._grants.values(), key=lambda x: x.created_at, reverse=True)
        if status:
            items = [x for x in items if x.status == status]
        if employee_id is not None:
            items = [x for x in items if x.employee_id == employee_id]
        if access_point_id:
            items = [x for x in items if access_point_id in x.access_point_ids]
        if direction:
            items = [x for x in items if direction in x.directions]
        return _paginate_list(items, cursor, limit)

    async def get_grant(self, grant_id: UUID) -> PedestrianGrantRecord | None:
        if grant_id in self._grants:
            return self._grants[grant_id]
        col = self._col("migration_pedestrian_grants")
        if col is not None:
            doc = await col.find_one({"_id": grant_id})
            if doc is not None:
                g = PedestrianGrantRecord(
                    id=doc["_id"],
                    employee_id=doc["employee_id"],
                    access_point_ids=list(doc["access_point_ids"]),
                    directions=list(doc["directions"]),
                    valid_from=_ensure_utc(doc["valid_from"]) or datetime.now(UTC),
                    valid_until=_ensure_utc(doc["valid_until"]) or datetime.now(UTC),
                    reason=doc["reason"],
                    status=doc["status"],
                    version=int(doc["version"]),
                    created_at=_ensure_utc(doc.get("created_at")) or datetime.now(UTC),
                )
                self._grants[g.id] = g
                return g
        return None

    async def save_grant(self, record: PedestrianGrantRecord) -> PedestrianGrantRecord:
        self._grants[record.id] = record
        col = self._col("migration_pedestrian_grants")
        if col is not None:
            await col.replace_one(
                {"_id": record.id},
                {
                    "_id": record.id,
                    "employee_id": record.employee_id,
                    "access_point_ids": list(record.access_point_ids),
                    "directions": list(record.directions),
                    "valid_from": record.valid_from,
                    "valid_until": record.valid_until,
                    "reason": record.reason,
                    "status": record.status,
                    "version": record.version,
                    "created_at": record.created_at,
                },
                upsert=True,
            )
        return record

    async def delete_grant(self, grant_id: UUID) -> bool:
        existed = self._grants.pop(grant_id, None) is not None
        col = self._col("migration_pedestrian_grants")
        if col is not None:
            res = await col.delete_one({"_id": grant_id})
            existed = existed or (res.deleted_count > 0)
        return existed

    async def save_capture_bundle(self, bundle: CaptureBundleRecord) -> CaptureBundleRecord:
        self._bundles[bundle.capture_bundle_id] = bundle
        col = self._col("migration_capture_bundles")
        if col is not None:
            await col.replace_one(
                {"_id": bundle.capture_bundle_id},
                {
                    "_id": bundle.capture_bundle_id,
                    "schema_version": bundle.schema_version,
                    "encounter_id": bundle.encounter_id,
                    "access_point_id": bundle.access_point_id,
                    "lane_id": bundle.lane_id,
                    "access_mode": bundle.access_mode,
                    "received_at": bundle.received_at,
                    "expires_at": bundle.expires_at,
                    "calibration_version": bundle.calibration_version,
                    "face_sha256": bundle.face_sha256,
                    "plate_sha256": bundle.plate_sha256,
                    "card_uid_hash": bundle.card_uid_hash,
                },
                upsert=True,
            )
        return bundle

    async def get_capture_bundle(self, capture_bundle_id: UUID) -> CaptureBundleRecord | None:
        return self._bundles.get(capture_bundle_id)

    async def save_verification(self, record: VerificationRecord) -> VerificationRecord:
        self._verifications_by_event[record.event_id] = record
        self._verifications_by_op[record.operation_id] = record
        col = self._col("migration_verifications")
        if col is not None:
            await col.replace_one(
                {"_id": record.operation_id},
                {
                    "_id": record.operation_id,
                    "operation_id": record.operation_id,
                    "event_id": record.event_id,
                    "gate_id": record.gate_id,
                    "access_mode": record.access_mode,
                    "direction": record.direction,
                    "status": record.status,
                    "verification_status": record.verification_status,
                    "permit_granted": record.permit_granted,
                    "barrier_status": record.barrier_status,
                    "command_id": record.command_id,
                    "factors": [
                        {
                            "factor": f.factor,
                            "status": f.status,
                            "reason_code": f.reason_code,
                            "score": f.score,
                        }
                        for f in record.factors
                    ],
                    "reason_codes": list(record.reason_codes),
                    "received_at": record.received_at,
                    "verification_completed_at": record.verification_completed_at,
                    "command_sent_at": record.command_sent_at,
                    "acknowledged_at": record.acknowledged_at,
                    "capture_bundle_id": record.capture_bundle_id,
                    "person_id": record.person_id,
                    "employee_id": record.employee_id,
                },
                upsert=True,
            )
        return record

    async def get_verification_by_event_id(self, event_id: str) -> VerificationRecord | None:
        if event_id in self._verifications_by_event:
            return self._verifications_by_event[event_id]
        col = self._col("migration_verifications")
        if col is not None:
            doc = await col.find_one({"event_id": event_id})
            if doc is not None:
                rec = self._doc_to_verification(doc)
                self._verifications_by_event[rec.event_id] = rec
                self._verifications_by_op[rec.operation_id] = rec
                return rec
        return None

    @staticmethod
    def _doc_to_verification(doc: dict[str, Any]) -> VerificationRecord:
        return VerificationRecord(
            operation_id=doc["operation_id"],
            event_id=doc["event_id"],
            gate_id=doc["gate_id"],
            access_mode=doc["access_mode"],
            direction=doc["direction"],
            status=doc["status"],
            verification_status=doc.get("verification_status"),
            permit_granted=bool(doc["permit_granted"]),
            barrier_status=doc["barrier_status"],
            command_id=doc.get("command_id"),
            factors=[
                FactorEvaluation(
                    factor=f["factor"],
                    status=f["status"],
                    reason_code=f.get("reason_code"),
                    score=f.get("score"),
                )
                for f in doc.get("factors", [])
            ],
            reason_codes=list(doc.get("reason_codes", [])),
            received_at=_ensure_utc(doc["received_at"]) or datetime.now(UTC),
            verification_completed_at=_ensure_utc(doc.get("verification_completed_at")),
            command_sent_at=_ensure_utc(doc.get("command_sent_at")),
            acknowledged_at=_ensure_utc(doc.get("acknowledged_at")),
            capture_bundle_id=doc["capture_bundle_id"],
            person_id=doc.get("person_id"),
            employee_id=doc.get("employee_id"),
            snapshot_bytes=[],
        )

    async def list_all_verifications(
        self,
        from_: datetime | None = None,
        to: datetime | None = None,
    ) -> list[VerificationRecord]:
        items = list(self._verifications_by_op.values())
        if from_ is not None:
            items = [x for x in items if x.received_at >= from_]
        if to is not None:
            items = [x for x in items if x.received_at < to]
        return sorted(items, key=lambda x: x.received_at, reverse=True)

    async def list_person_logs(
        self,
        cursor: str | None = None,
        limit: int = 50,
        from_: datetime | None = None,
        to: datetime | None = None,
        employee_id: UUID | None = None,
        access_point_id: str | None = None,
        direction: str | None = None,
    ) -> tuple[list[VerificationRecord], str | None, bool, int]:
        items = [
            x
            for x in self._verifications_by_op.values()
            if x.access_mode == "pedestrian"
        ]
        if from_ is not None:
            items = [x for x in items if x.received_at >= from_]
        if to is not None:
            items = [x for x in items if x.received_at < to]
        if employee_id is not None:
            items = [x for x in items if x.employee_id == employee_id]
        if access_point_id:
            items = [x for x in items if x.gate_id == access_point_id]
        if direction:
            items = [x for x in items if x.direction == direction]
        items.sort(key=lambda x: x.received_at, reverse=True)
        return _paginate_list(items, cursor, limit)

    async def get_person_log(self, log_id: UUID) -> VerificationRecord | None:
        rec = self._verifications_by_op.get(log_id)
        if rec is not None and rec.access_mode == "pedestrian":
            return rec
        return None

    async def save_dashboard_snapshot(self, snapshot: dict[str, Any]) -> None:
        self._snapshots[snapshot["snapshot_id"]] = dict(snapshot)

    async def get_dashboard_snapshot(self, snapshot_id: UUID) -> dict[str, Any] | None:
        return self._snapshots.get(snapshot_id)

    async def save_report(self, report_doc: dict[str, Any]) -> dict[str, Any]:
        report_id: UUID = report_doc["report_id"]
        self._reports[report_id] = dict(report_doc)
        col = self._col("migration_assistant_reports")
        if col is not None:
            await col.replace_one(
                {"_id": report_id},
                {"_id": report_id, **report_doc},
                upsert=True,
            )
        return dict(report_doc)

    async def get_report(self, report_id: UUID) -> dict[str, Any] | None:
        if report_id in self._reports:
            return dict(self._reports[report_id])
        col = self._col("migration_assistant_reports")
        if col is not None:
            doc = await col.find_one({"_id": report_id})
            if doc is not None:
                data = dict(doc)
                data.pop("_id", None)
                self._reports[report_id] = data
                return data
        return None

    async def list_reports(
        self,
        owner_id: UUID,
        cursor: str | None = None,
        limit: int = 50,
        status: str | None = None,
    ) -> tuple[list[dict[str, Any]], str | None, bool, int]:
        items = [
            dict(r)
            for r in self._reports.values()
            if UUID(str(r["owner_id"])) == owner_id
        ]
        if status:
            items = [r for r in items if r.get("status") == status]
        items.sort(key=lambda r: r["created_at"], reverse=True)
        return _paginate_list(items, cursor, limit)

    async def list_device_configs(self, group: str) -> list[dict[str, Any]]:
        items = [
            dict(cfg)
            for (g, _), cfg in self._device_configs.items()
            if g == group
        ]
        return sorted(items, key=lambda x: str(x.get("name", "")))

    async def get_device_config(self, group: str, config_id: UUID) -> dict[str, Any] | None:
        cfg = self._device_configs.get((group, config_id))
        return dict(cfg) if cfg is not None else None

    async def save_device_config(self, doc: dict[str, Any]) -> dict[str, Any]:
        group = str(doc["group"])
        config_id = UUID(str(doc["id"]))
        self._device_configs[(group, config_id)] = dict(doc)
        return dict(doc)

    async def delete_device_config(self, group: str, config_id: UUID) -> bool:
        return self._device_configs.pop((group, config_id), None) is not None

    async def save_device_operation(self, op_doc: dict[str, Any]) -> dict[str, Any]:
        op_id = UUID(str(op_doc["operation_id"]))
        self._device_operations[op_id] = dict(op_doc)
        return dict(op_doc)

    async def get_device_operation(self, operation_id: UUID) -> dict[str, Any] | None:
        op = self._device_operations.get(operation_id)
        return dict(op) if op is not None else None

    async def append_device_audit_log(self, audit_doc: dict[str, Any]) -> None:
        self._device_audit_logs.insert(0, dict(audit_doc))

    async def list_device_audit_logs(
        self, cursor: str | None = None, limit: int = 50
    ) -> tuple[list[dict[str, Any]], str | None, bool, int]:
        return _paginate_list(list(self._device_audit_logs), cursor, limit)
