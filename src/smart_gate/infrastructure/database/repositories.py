from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from typing import Any
from uuid import UUID

from pymongo import DESCENDING, ReturnDocument
from pymongo.errors import DuplicateKeyError, OperationFailure

from smart_gate.domain.entities import (
    AuthSession,
    CargoDetection,
    DeviceCredential,
    DockCapture,
    DockInspection,
    Driver,
    DriverVehicleAuthorization,
    EmployeeCard,
    GateCommand,
    GateLog,
    SecurityAlert,
    User,
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
from smart_gate.infrastructure.database.documents import (
    AuthSessionDocument,
    CargoDetectionModel,
    DeviceCredentialDocument,
    DockCaptureModel,
    DockInspectionDocument,
    DriverDocument,
    DriverVehicleAuthorizationDocument,
    EmployeeCardDocument,
    GateCommandDocument,
    GateLogDocument,
    SecurityAlertDocument,
    SequenceCounterDocument,
    UserDocument,
    VehicleDocument,
    WarehouseExitOrderDocument,
    utc_now,
)
from smart_gate.infrastructure.database.unit_of_work import current_session
from smart_gate.infrastructure.security.crypto import EmbeddingCipher


def _omit_none_defaults(payload: dict[str, Any], *field_names: str) -> dict[str, Any]:
    for field_name in field_names:
        if payload.get(field_name) is None:
            payload.pop(field_name, None)
    return payload


def _driver_from_document(document: DriverDocument, cipher: EmbeddingCipher) -> Driver:
    return Driver(
        id=document.id,
        full_name=document.full_name,
        employee_code=document.employee_code,
        phone=document.phone,
        status=document.status,
        face_embedding=cipher.decrypt(document.face_embedding_ciphertext, str(document.id)),
        face_model=document.face_model,
        embedding_version=document.embedding_version,
        enrolled_at=document.enrolled_at,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


def _vehicle_from_document(document: VehicleDocument) -> Vehicle:
    return Vehicle(
        id=document.id,
        plate_number=document.plate_number,
        plate_normalized=document.plate_normalized,
        vehicle_type=document.vehicle_type,
        make=document.make,
        model=document.model,
        color=document.color,
        metadata=document.metadata,
        status=document.status,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


def _gate_log_from_document(document: GateLogDocument) -> GateLog:
    return GateLog(
        id=document.id,
        event_id=document.event_id,
        direction=document.direction,
        verification_status=document.verification_status,
        observed_plate=document.observed_plate,
        plate_score=document.plate_score,
        plate_match_type=document.plate_match_type,
        face_similarity=document.face_similarity,
        verification_score=document.verification_score,
        reason_codes=document.reason_codes,
        driver_id=document.driver_id,
        vehicle_id=document.vehicle_id,
        order_id=document.order_id,
        snapshot_refs=document.snapshot_refs,
        barrier_status=document.barrier_status,
        model_versions=document.model_versions,
        threshold_version=document.threshold_version,
        occurred_at=document.occurred_at,
        completed_at=document.completed_at,
        card_id=document.card_id,
        card_status=document.card_status,
        card_verified=document.card_verified,
        face_verified=document.face_verified,
        plate_verified=document.plate_verified,
        authorization_verified=document.authorization_verified,
        vehicle_type=document.vehicle_type,
    )


def _order_from_document(document: WarehouseExitOrderDocument) -> WarehouseExitOrder:
    return WarehouseExitOrder(
        id=document.id,
        order_id=document.order_id,
        assigned_driver_id=document.assigned_driver_id,
        assigned_vehicle_id=document.assigned_vehicle_id,
        cargo_metadata=document.cargo_metadata,
        valid_from=document.valid_from,
        valid_until=document.valid_until,
        status=document.status,
        dock_session_id=document.dock_session_id,
        slip_version=document.slip_version,
        slip_jti_hash=document.slip_jti_hash,
        slip_token_hash=document.slip_token_hash,
        slip_refs=document.slip_refs,
        slip_issued_at=document.slip_issued_at,
        exit_event_id=document.exit_event_id,
        completed_at=document.completed_at,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


def _dock_from_document(document: DockInspectionDocument) -> DockInspection:
    return DockInspection(
        id=document.id,
        order_id=document.order_id,
        entry_gate_log_id=document.entry_gate_log_id,
        status=document.status,
        current_cargo_state=document.current_cargo_state,
        captures=[
            DockCapture(
                captured_at=capture.captured_at,
                cargo_state=capture.cargo_state,
                evidence_ref=capture.evidence_ref,
                detections=[
                    CargoDetection(
                        class_name=detection.class_name,
                        confidence=detection.confidence,
                        bounding_box=detection.bounding_box,
                        model_version=detection.model_version,
                    )
                    for detection in capture.detections
                ],
            )
            for capture in document.captures
        ],
        operator_note=document.operator_note,
        created_at=document.created_at,
        completed_at=document.completed_at,
    )


def _employee_card_from_document(document: EmployeeCardDocument) -> EmployeeCard:
    return EmployeeCard(
        id=document.id,
        card_uid=document.card_uid,
        card_uid_normalized=document.card_uid_normalized,
        driver_id=document.driver_id,
        status=document.status,
        status_reason=document.status_reason,
        replaces_card_id=document.replaces_card_id,
        replaced_by_card_id=document.replaced_by_card_id,
        metadata=document.metadata,
        issued_at=document.issued_at,
        updated_at=document.updated_at,
    )


_CARD_UID_KEY_PATTERN = {"card_uid_normalized": 1}
_CARD_DRIVER_ACTIVE_KEY_PATTERN = {"driver_id": 1}


def _card_conflict_from_duplicate_key(
    exc: DuplicateKeyError, *, replace: bool = False
) -> ConflictError:
    key_pattern = exc.details.get("keyPattern", {}) if exc.details else {}
    if key_pattern == _CARD_UID_KEY_PATTERN:
        return ConflictError("CARD_UID_ALREADY_EXISTS", "UID thẻ đã tồn tại trong hệ thống")
    if key_pattern == _CARD_DRIVER_ACTIVE_KEY_PATTERN:
        if replace:
            return ConflictError("CARD_REPLACEMENT_CONFLICT", "Tài xế đã có thẻ đang hoạt động")
        return ConflictError("ACTIVE_CARD_ALREADY_EXISTS", "Tài xế đã có thẻ đang hoạt động")
    return ConflictError("CARD_REPLACEMENT_CONFLICT", "Thẻ đang hoạt động đã thay đổi")


class BeanieEmployeeCardRepository:
    async def add(self, card: EmployeeCard) -> EmployeeCard:
        document = EmployeeCardDocument(
            id=card.id,
            card_uid=card.card_uid,
            card_uid_normalized=card.card_uid_normalized,
            driver_id=card.driver_id,
            status=card.status,
            status_reason=card.status_reason,
            replaces_card_id=card.replaces_card_id,
            replaced_by_card_id=card.replaced_by_card_id,
            metadata=card.metadata,
            issued_at=card.issued_at or utc_now(),
            updated_at=card.updated_at or utc_now(),
        )
        try:
            await document.insert(session=current_session())
        except DuplicateKeyError as exc:
            raise _card_conflict_from_duplicate_key(exc) from exc
        return _employee_card_from_document(document)

    async def get(self, card_id: UUID) -> EmployeeCard | None:
        document = await EmployeeCardDocument.get(card_id)
        return _employee_card_from_document(document) if document else None

    async def get_by_uid(self, card_uid_normalized: str) -> EmployeeCard | None:
        document = await EmployeeCardDocument.find_one(
            EmployeeCardDocument.card_uid_normalized == card_uid_normalized
        )
        return _employee_card_from_document(document) if document else None

    async def get_active_by_driver(self, driver_id: UUID) -> EmployeeCard | None:
        document = await EmployeeCardDocument.find_one(
            EmployeeCardDocument.driver_id == driver_id,
            EmployeeCardDocument.status == CardStatus.ACTIVE,
        )
        return _employee_card_from_document(document) if document else None

    async def list_by_driver(self, driver_id: UUID) -> list[EmployeeCard]:
        documents = (
            await EmployeeCardDocument.find(EmployeeCardDocument.driver_id == driver_id)
            .sort([("issued_at", DESCENDING), ("_id", DESCENDING)])
            .to_list()
        )
        return [_employee_card_from_document(document) for document in documents]

    async def list_all(self) -> list[EmployeeCard]:
        documents = (
            await EmployeeCardDocument.find_all()
            .sort([("issued_at", DESCENDING), ("_id", DESCENDING)])
            .to_list()
        )
        return [_employee_card_from_document(document) for document in documents]

    async def change_active_status(
        self,
        card_id: UUID,
        target: CardStatus,
        status_reason: str,
        updated_at: datetime,
    ) -> EmployeeCard | None:
        collection = EmployeeCardDocument.get_pymongo_collection()
        try:
            payload = await collection.find_one_and_update(
                {"_id": card_id, "status": CardStatus.ACTIVE.value},
                {
                    "$set": {
                        "status": target.value,
                        "status_reason": status_reason,
                        "updated_at": updated_at,
                    }
                },
                return_document=ReturnDocument.AFTER,
                session=current_session(),
            )
        except OperationFailure as exc:
            if exc.code == 112:
                raise ConflictError(
                    "CARD_REPLACEMENT_CONFLICT", "Thẻ đang hoạt động đã thay đổi"
                ) from exc
            raise
        if payload is None:
            return None
        return _employee_card_from_document(EmployeeCardDocument.model_validate(payload))

    async def replace_active(
        self,
        replacement: EmployeeCard,
        expected_active_card_id: UUID | None,
        replaced_at: datetime,
        status_reason: str,
    ) -> tuple[EmployeeCard, EmployeeCard | None]:
        collection = EmployeeCardDocument.get_pymongo_collection()
        old: EmployeeCard | None = None

        if expected_active_card_id is not None:
            try:
                payload = await collection.find_one_and_update(
                    {
                        "_id": expected_active_card_id,
                        "driver_id": replacement.driver_id,
                        "status": CardStatus.ACTIVE.value,
                    },
                    {
                        "$set": {
                            "status": CardStatus.REPLACED.value,
                            "status_reason": status_reason,
                            "replaced_by_card_id": replacement.id,
                            "updated_at": replaced_at,
                        }
                    },
                    return_document=ReturnDocument.AFTER,
                    session=current_session(),
                )
            except OperationFailure as exc:
                if exc.code == 112:
                    raise ConflictError(
                        "CARD_REPLACEMENT_CONFLICT", "Thẻ đang hoạt động đã thay đổi"
                    ) from exc
                raise
            if payload is None:
                raise ConflictError("CARD_REPLACEMENT_CONFLICT", "Thẻ đang hoạt động đã thay đổi")
            old = _employee_card_from_document(EmployeeCardDocument.model_validate(payload))
            replacement.replaces_card_id = old.id
        else:
            existing = await collection.find_one(
                {"driver_id": replacement.driver_id, "status": CardStatus.ACTIVE.value},
                session=current_session(),
            )
            if existing is not None:
                raise ConflictError("CARD_REPLACEMENT_CONFLICT", "Thẻ đang hoạt động đã thay đổi")

        document = EmployeeCardDocument(
            id=replacement.id,
            card_uid=replacement.card_uid,
            card_uid_normalized=replacement.card_uid_normalized,
            driver_id=replacement.driver_id,
            status=CardStatus.ACTIVE,
            status_reason=None,
            replaces_card_id=replacement.replaces_card_id,
            replaced_by_card_id=None,
            metadata=replacement.metadata,
            issued_at=replacement.issued_at or replaced_at,
            updated_at=replacement.updated_at or replaced_at,
        )
        try:
            await document.insert(session=current_session())
        except DuplicateKeyError as exc:
            raise _card_conflict_from_duplicate_key(exc, replace=True) from exc
        except OperationFailure as exc:
            if exc.code == 112:
                raise ConflictError(
                    "CARD_REPLACEMENT_CONFLICT", "Thẻ đang hoạt động đã thay đổi"
                ) from exc
            raise
        return _employee_card_from_document(document), old


class BeanieDriverRepository:
    def __init__(self, cipher: EmbeddingCipher) -> None:
        self.cipher = cipher

    async def add(self, driver: Driver) -> Driver:
        document = DriverDocument(
            id=driver.id,
            full_name=driver.full_name,
            employee_code=driver.employee_code,
            phone=driver.phone,
            status=driver.status,
            face_embedding_ciphertext=self.cipher.encrypt(driver.face_embedding, str(driver.id)),
            embedding_dimension=len(driver.face_embedding),
            face_model=driver.face_model,
            embedding_version=driver.embedding_version,
            enrolled_at=driver.enrolled_at or utc_now(),
        )
        try:
            await document.insert()
        except DuplicateKeyError as exc:
            raise ConflictError("DRIVER_ALREADY_EXISTS", "Mã nhân viên đã được đăng ký") from exc
        return _driver_from_document(document, self.cipher)

    async def get(self, driver_id: UUID) -> Driver | None:
        document = await DriverDocument.get(driver_id)
        return _driver_from_document(document, self.cipher) if document else None

    async def list_active(self) -> list[Driver]:
        documents = await DriverDocument.find(
            DriverDocument.status == RecordStatus.ACTIVE
        ).to_list()
        return [_driver_from_document(document, self.cipher) for document in documents]

    async def list_all(self) -> list[Driver]:
        documents = await DriverDocument.find_all().sort("-created_at").to_list()
        return [_driver_from_document(document, self.cipher) for document in documents]

    async def update(self, driver: Driver) -> Driver:
        document = await DriverDocument.get(driver.id)
        if document is None:
            return driver
        document.full_name = driver.full_name
        document.employee_code = driver.employee_code
        document.phone = driver.phone
        document.status = driver.status
        document.face_embedding_ciphertext = self.cipher.encrypt(
            driver.face_embedding, str(driver.id)
        )
        document.embedding_dimension = len(driver.face_embedding)
        document.face_model = driver.face_model
        document.embedding_version = driver.embedding_version
        document.updated_at = utc_now()
        try:
            await document.save()
        except DuplicateKeyError as exc:
            raise ConflictError("DRIVER_ALREADY_EXISTS", "Mã nhân viên đã được đăng ký") from exc
        return _driver_from_document(document, self.cipher)


class BeanieVehicleRepository:
    async def add(self, vehicle: Vehicle) -> Vehicle:
        document = VehicleDocument(
            id=vehicle.id,
            plate_number=vehicle.plate_number,
            plate_normalized=vehicle.plate_normalized,
            vehicle_type=vehicle.vehicle_type,
            make=vehicle.make,
            model=vehicle.model,
            color=vehicle.color,
            metadata=vehicle.metadata,
            status=vehicle.status,
        )
        try:
            await document.insert()
        except DuplicateKeyError as exc:
            raise ConflictError("VEHICLE_ALREADY_EXISTS", "Biển số xe đã được đăng ký") from exc
        return _vehicle_from_document(document)

    async def get(self, vehicle_id: UUID) -> Vehicle | None:
        document = await VehicleDocument.get(vehicle_id)
        return _vehicle_from_document(document) if document else None

    async def get_by_plate(self, plate_normalized: str) -> Vehicle | None:
        document = await VehicleDocument.find_one(
            VehicleDocument.plate_normalized == plate_normalized
        )
        return _vehicle_from_document(document) if document else None

    async def list_active(self) -> list[Vehicle]:
        documents = await VehicleDocument.find(
            VehicleDocument.status == RecordStatus.ACTIVE
        ).to_list()
        return [_vehicle_from_document(document) for document in documents]

    async def list_all(self) -> list[Vehicle]:
        documents = await VehicleDocument.find_all().sort("-created_at").to_list()
        return [_vehicle_from_document(document) for document in documents]

    async def update(self, vehicle: Vehicle) -> Vehicle:
        document = await VehicleDocument.get(vehicle.id)
        if document is None:
            return vehicle
        document.plate_number = vehicle.plate_number
        document.plate_normalized = vehicle.plate_normalized
        document.vehicle_type = vehicle.vehicle_type
        document.make = vehicle.make
        document.model = vehicle.model
        document.color = vehicle.color
        document.metadata = vehicle.metadata
        document.status = vehicle.status
        document.updated_at = utc_now()
        try:
            await document.save()
        except DuplicateKeyError as exc:
            raise ConflictError("VEHICLE_ALREADY_EXISTS", "Biển số xe đã được đăng ký") from exc
        return _vehicle_from_document(document)


class BeanieAuthorizationRepository:
    async def add(self, authorization: DriverVehicleAuthorization) -> DriverVehicleAuthorization:
        if authorization.status == RecordStatus.ACTIVE:
            overlap_filter: dict[str, object] = {
                "driver_id": authorization.driver_id,
                "vehicle_id": authorization.vehicle_id,
                "status": RecordStatus.ACTIVE,
                "$or": [
                    {"valid_until": None},
                    {"valid_until": {"$gte": authorization.valid_from}},
                ],
            }
            if authorization.valid_until is not None:
                overlap_filter["valid_from"] = {"$lte": authorization.valid_until}

            overlapping = await DriverVehicleAuthorizationDocument.find_one(overlap_filter)
            if overlapping is not None:
                raise ConflictError(
                    "AUTHORIZATION_PERIOD_OVERLAP",
                    "Khoảng hiệu lực ủy quyền bị chồng lấn với bản ghi đang hoạt động",
                )

        document = DriverVehicleAuthorizationDocument(
            id=authorization.id,
            driver_id=authorization.driver_id,
            vehicle_id=authorization.vehicle_id,
            valid_from=authorization.valid_from,
            valid_until=authorization.valid_until,
            status=authorization.status,
        )
        try:
            await document.insert()
        except DuplicateKeyError as exc:
            raise ConflictError(
                "AUTHORIZATION_ALREADY_EXISTS", "Cặp tài xế và phương tiện đã được ủy quyền"
            ) from exc
        return authorization

    async def is_authorized(self, driver_id: UUID, vehicle_id: UUID, at: datetime) -> bool:
        document = await DriverVehicleAuthorizationDocument.find_one(
            {
                "driver_id": driver_id,
                "vehicle_id": vehicle_id,
                "status": RecordStatus.ACTIVE,
                "valid_from": {"$lte": at},
                "$or": [{"valid_until": None}, {"valid_until": {"$gte": at}}],
            }
        )
        return document is not None

    async def revoke(self, driver_id: UUID, vehicle_id: UUID) -> bool:
        document = await DriverVehicleAuthorizationDocument.find_one(
            DriverVehicleAuthorizationDocument.driver_id == driver_id,
            DriverVehicleAuthorizationDocument.vehicle_id == vehicle_id,
            DriverVehicleAuthorizationDocument.status == RecordStatus.ACTIVE,
            sort=[("valid_from", DESCENDING), ("created_at", DESCENDING)],
        )
        if document is None:
            return False
        document.status = RecordStatus.INACTIVE
        await document.save()
        return True

    async def list_all(self) -> list[DriverVehicleAuthorization]:
        documents = (
            await DriverVehicleAuthorizationDocument.find_all().sort("-created_at").to_list()
        )
        return [
            DriverVehicleAuthorization(
                id=document.id,
                driver_id=document.driver_id,
                vehicle_id=document.vehicle_id,
                valid_from=document.valid_from,
                valid_until=document.valid_until,
                status=document.status,
            )
            for document in documents
        ]


class BeanieGateLogRepository:
    async def add(self, gate_log: GateLog) -> GateLog:
        document = GateLogDocument(**_omit_none_defaults(asdict(gate_log), "occurred_at"))
        try:
            await document.insert(session=current_session())
        except DuplicateKeyError:
            existing = await self.get_by_event_id(gate_log.event_id)
            if existing is not None:
                return existing
            raise
        return _gate_log_from_document(document)

    async def get_by_event_id(self, event_id: str) -> GateLog | None:
        document = await GateLogDocument.find_one(GateLogDocument.event_id == event_id)
        return _gate_log_from_document(document) if document else None

    async def get(self, gate_log_id: UUID) -> GateLog | None:
        document = await GateLogDocument.get(gate_log_id)
        return _gate_log_from_document(document) if document else None

    async def update(self, gate_log: GateLog) -> GateLog:
        document = await GateLogDocument.get(gate_log.id)
        if document is None:
            return gate_log
        for field_name, value in asdict(gate_log).items():
            setattr(document, field_name, value)
        await document.save()
        return _gate_log_from_document(document)

    async def list_recent(
        self,
        limit: int = 100,
        direction: Direction | None = None,
        verification_status: VerificationStatus | None = None,
    ) -> list[GateLog]:
        filters: dict[str, object] = {}
        if direction is not None:
            filters["direction"] = direction
        if verification_status is not None:
            filters["verification_status"] = verification_status
        documents = await GateLogDocument.find(filters).sort("-occurred_at").limit(limit).to_list()
        return [_gate_log_from_document(document) for document in documents]

    async def latest_passed_entry(self, driver_id: UUID, vehicle_id: UUID) -> GateLog | None:
        document = await GateLogDocument.find_one(
            {
                "direction": "ENTRY",
                "verification_status": VerificationStatus.PASSED,
                "driver_id": driver_id,
                "vehicle_id": vehicle_id,
            },
            sort=[("occurred_at", DESCENDING)],
        )
        return _gate_log_from_document(document) if document else None


class BeanieOrderRepository:
    async def add(self, order: WarehouseExitOrder) -> WarehouseExitOrder:
        document = WarehouseExitOrderDocument(
            **_omit_none_defaults(asdict(order), "created_at", "updated_at")
        )
        try:
            await document.insert()
        except DuplicateKeyError as exc:
            raise ConflictError("ORDER_ALREADY_EXISTS", "Mã lệnh xuất kho đã tồn tại") from exc
        return _order_from_document(document)

    async def get_by_order_id(self, order_id: str) -> WarehouseExitOrder | None:
        document = await WarehouseExitOrderDocument.find_one(
            WarehouseExitOrderDocument.order_id == order_id
        )
        return _order_from_document(document) if document else None

    async def list_all(self) -> list[WarehouseExitOrder]:
        documents = await WarehouseExitOrderDocument.find_all().sort("-created_at").to_list()
        return [_order_from_document(document) for document in documents]

    async def update(self, order: WarehouseExitOrder) -> WarehouseExitOrder:
        document = await WarehouseExitOrderDocument.get(order.id, session=current_session())
        if document is None:
            return order
        for field_name, value in asdict(order).items():
            setattr(document, field_name, value)
        document.updated_at = utc_now()
        await document.save(session=current_session())
        return _order_from_document(document)

    async def claim_exit(self, order_id: str, event_id: str) -> WarehouseExitOrder | None:
        collection = WarehouseExitOrderDocument.get_pymongo_collection()
        payload = await collection.find_one_and_update(
            {
                "order_id": order_id,
                "status": OrderStatus.SLIP_ISSUED,
                "$or": [{"exit_event_id": None}, {"exit_event_id": event_id}],
            },
            {"$set": {"exit_event_id": event_id, "updated_at": utc_now()}},
            return_document=ReturnDocument.AFTER,
            session=current_session(),
        )
        if payload is None:
            return None
        return _order_from_document(WarehouseExitOrderDocument.model_validate(payload))

    async def release_exit(self, order_id: str, event_id: str) -> None:
        collection = WarehouseExitOrderDocument.get_pymongo_collection()
        await collection.update_one(
            {
                "order_id": order_id,
                "status": OrderStatus.SLIP_ISSUED,
                "exit_event_id": event_id,
            },
            {"$set": {"exit_event_id": None, "updated_at": utc_now()}},
            session=current_session(),
        )

    async def complete_exit(
        self, order_id: str, event_id: str, completed_at: datetime
    ) -> WarehouseExitOrder | None:
        collection = WarehouseExitOrderDocument.get_pymongo_collection()
        payload = await collection.find_one_and_update(
            {
                "order_id": order_id,
                "status": OrderStatus.SLIP_ISSUED,
                "exit_event_id": event_id,
            },
            {
                "$set": {
                    "status": OrderStatus.COMPLETED,
                    "completed_at": completed_at,
                    "updated_at": completed_at,
                }
            },
            return_document=ReturnDocument.AFTER,
            session=current_session(),
        )
        if payload is None:
            return None
        return _order_from_document(WarehouseExitOrderDocument.model_validate(payload))


class BeanieDockRepository:
    async def add(self, inspection: DockInspection) -> DockInspection:
        document = DockInspectionDocument(
            id=inspection.id,
            order_id=inspection.order_id,
            entry_gate_log_id=inspection.entry_gate_log_id,
            status=inspection.status,
            current_cargo_state=inspection.current_cargo_state,
            captures=[],
        )
        try:
            await document.insert(session=current_session())
        except DuplicateKeyError as exc:
            raise ConflictError(
                "DOCK_SESSION_ALREADY_EXISTS", "Order đã có phiên kiểm tra kho"
            ) from exc
        return _dock_from_document(document)

    async def get(self, inspection_id: UUID) -> DockInspection | None:
        document = await DockInspectionDocument.get(inspection_id)
        return _dock_from_document(document) if document else None

    async def list_recent(self, limit: int = 100) -> list[DockInspection]:
        documents = (
            await DockInspectionDocument.find_all().sort("-created_at").limit(limit).to_list()
        )
        return [_dock_from_document(document) for document in documents]

    async def update(self, inspection: DockInspection) -> DockInspection:
        document = await DockInspectionDocument.get(inspection.id, session=current_session())
        if document is None:
            return inspection
        document.status = inspection.status
        document.current_cargo_state = inspection.current_cargo_state
        document.operator_note = inspection.operator_note
        document.completed_at = inspection.completed_at
        document.captures = [
            DockCaptureModel(
                captured_at=capture.captured_at,
                cargo_state=capture.cargo_state,
                evidence_ref=capture.evidence_ref,
                detections=[
                    CargoDetectionModel(
                        class_name=detection.class_name,
                        confidence=detection.confidence,
                        bounding_box=detection.bounding_box,
                        model_version=detection.model_version,
                    )
                    for detection in capture.detections
                ],
            )
            for capture in inspection.captures
        ]
        await document.save(session=current_session())
        return _dock_from_document(document)


class BeanieAlertRepository:
    async def add(self, alert: SecurityAlert) -> SecurityAlert:
        document = SecurityAlertDocument(**_omit_none_defaults(asdict(alert), "occurred_at"))
        await document.insert()
        return alert

    async def list_after(self, sequence: int, limit: int = 200) -> list[SecurityAlert]:
        documents = (
            await SecurityAlertDocument.find(SecurityAlertDocument.sequence > sequence)
            .sort("sequence")
            .limit(limit)
            .to_list()
        )
        return [self._from_document(document) for document in documents]

    async def get(self, alert_id: UUID) -> SecurityAlert | None:
        document = await SecurityAlertDocument.get(alert_id)
        return self._from_document(document) if document else None

    async def update_status(self, alert_id: UUID, status: AlertStatus) -> SecurityAlert | None:
        document = await SecurityAlertDocument.get(alert_id)
        if document is None:
            return None
        document.status = status
        document.resolved_at = (
            utc_now() if status in {AlertStatus.RESOLVED, AlertStatus.FALSE_POSITIVE} else None
        )
        await document.save()
        return self._from_document(document)

    @staticmethod
    def _from_document(document: SecurityAlertDocument) -> SecurityAlert:
        return SecurityAlert(
            id=document.id,
            event_id=document.event_id,
            sequence=document.sequence,
            alert_type=document.alert_type,
            severity=document.severity,
            status=document.status,
            message=document.message,
            data=document.data,
            occurred_at=document.occurred_at,
            resolved_at=document.resolved_at,
        )


class MongoSequenceRepository:
    async def next(self, name: str) -> int:
        collection = SequenceCounterDocument.get_pymongo_collection()
        document = await collection.find_one_and_update(
            {"_id": name},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if document is None:
            raise RuntimeError("Không thể tăng sequence MongoDB")
        return int(document["value"])


class BeanieGateCommandRepository:
    async def add(self, command: GateCommand) -> GateCommand:
        document = GateCommandDocument(**_omit_none_defaults(asdict(command), "issued_at"))
        try:
            await document.insert()
        except DuplicateKeyError:
            existing = await self.get_by_command_id(command.command_id)
            if existing is not None:
                return existing
            raise
        return command

    async def get_by_command_id(self, command_id: str) -> GateCommand | None:
        document = await GateCommandDocument.find_one(GateCommandDocument.command_id == command_id)
        if document is None:
            return None
        return GateCommand(
            id=document.id,
            command_id=document.command_id,
            gate_log_id=document.gate_log_id,
            gate_id=document.gate_id,
            status=document.status,
            error_code=document.error_code,
            issued_at=document.issued_at,
            acknowledged_at=document.acknowledged_at,
        )

    async def update(self, command: GateCommand) -> GateCommand:
        document = await GateCommandDocument.get(command.id)
        if document is None:
            return command
        document.status = command.status
        document.error_code = command.error_code
        document.acknowledged_at = command.acknowledged_at
        await document.save()
        return command


class BeanieUserRepository:
    async def add(self, user: User) -> User:
        document = UserDocument(**_omit_none_defaults(asdict(user), "created_at"))
        try:
            await document.insert()
        except DuplicateKeyError as exc:
            raise ConflictError("USER_ALREADY_EXISTS", "Tên đăng nhập đã tồn tại") from exc
        return user

    async def get(self, user_id: UUID) -> User | None:
        document = await UserDocument.get(user_id)
        return self._from_document(document) if document else None

    async def get_by_username(self, username: str) -> User | None:
        document = await UserDocument.find_one(UserDocument.username == username)
        return self._from_document(document) if document else None

    @staticmethod
    def _from_document(document: UserDocument) -> User:
        return User(
            id=document.id,
            username=document.username,
            password_hash=document.password_hash,
            role=document.role,
            is_active=document.is_active,
            created_at=document.created_at,
        )


class BeanieAuthSessionRepository:
    async def add(self, session: AuthSession) -> AuthSession:
        document = AuthSessionDocument(**_omit_none_defaults(asdict(session), "created_at"))
        await document.insert()
        return session

    async def get_by_token_hash(self, token_hash: str, at: datetime) -> AuthSession | None:
        document = await AuthSessionDocument.find_one(
            AuthSessionDocument.token_hash == token_hash,
            AuthSessionDocument.expires_at > at,
        )
        if document is None:
            return None
        return AuthSession(
            id=document.id,
            user_id=document.user_id,
            token_hash=document.token_hash,
            csrf_hash=document.csrf_hash,
            expires_at=document.expires_at,
            created_at=document.created_at,
        )

    async def delete_by_token_hash(self, token_hash: str) -> bool:
        result = await AuthSessionDocument.find_one(
            AuthSessionDocument.token_hash == token_hash
        ).delete()
        return result is not None and result.deleted_count > 0


class BeanieDeviceCredentialRepository:
    async def add(self, credential: DeviceCredential) -> DeviceCredential:
        document = DeviceCredentialDocument(**_omit_none_defaults(asdict(credential), "created_at"))
        try:
            await document.insert()
        except DuplicateKeyError as exc:
            raise ConflictError(
                "DEVICE_CREDENTIAL_ALREADY_EXISTS", "Thông tin xác thực thiết bị đã tồn tại"
            ) from exc
        return credential

    async def get_by_key_hash(self, key_hash: str) -> DeviceCredential | None:
        document = await DeviceCredentialDocument.find_one(
            DeviceCredentialDocument.key_hash == key_hash,
            DeviceCredentialDocument.is_active == True,  # noqa: E712
        )
        if document is None:
            return None
        return DeviceCredential(
            id=document.id,
            name=document.name,
            key_hash=document.key_hash,
            scopes=document.scopes,
            is_active=document.is_active,
            created_at=document.created_at,
        )

    async def upsert(self, credential: DeviceCredential) -> DeviceCredential:
        document = await DeviceCredentialDocument.find_one(
            DeviceCredentialDocument.name == credential.name
        )
        if document is None:
            return await self.add(credential)
        document.key_hash = credential.key_hash
        document.scopes = credential.scopes
        document.is_active = True
        try:
            await document.save()
        except DuplicateKeyError as exc:
            raise ConflictError(
                "DEVICE_KEY_ALREADY_IN_USE", "Khóa thiết bị đã được gán cho credential khác"
            ) from exc
        credential.id = document.id
        credential.created_at = document.created_at
        return credential
