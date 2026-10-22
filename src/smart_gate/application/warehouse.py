from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

from smart_gate.application.dto import (
    CaptureDockInput,
    CargoDetectionOutput,
    CreateOrderInput,
    DockCaptureOutput,
    DockDetailOutput,
    DockOutput,
    FinalizeDockInput,
    OrderOutput,
    SlipOutput,
    UpdateOrderInput,
)
from smart_gate.config import Settings
from smart_gate.domain.entities import DockCapture, DockInspection, WarehouseExitOrder
from smart_gate.domain.enums import CargoState, DockStatus, OrderStatus, RecordStatus
from smart_gate.domain.exceptions import ConflictError, NotFoundError, SmartGateError
from smart_gate.domain.ports import (
    AuthorizationRepository,
    CargoGateway,
    DockRepository,
    DriverRepository,
    EvidenceStorageGateway,
    ExitSlipGateway,
    GateLogRepository,
    OrderRepository,
    SecretHashGateway,
    UnitOfWork,
    VehicleRepository,
)
from smart_gate.domain.services import OrderStateService


class WarehouseService:
    """Điều phối vòng đời lệnh xuất kho, kiểm tra dock và phiếu QR đã ký."""

    def __init__(
        self,
        settings: Settings,
        orders: OrderRepository,
        docks: DockRepository,
        drivers: DriverRepository,
        vehicles: VehicleRepository,
        authorizations: AuthorizationRepository,
        gate_logs: GateLogRepository,
        evidence: EvidenceStorageGateway,
        cargo: CargoGateway,
        slips: ExitSlipGateway,
        secret_hasher: SecretHashGateway,
        state_service: OrderStateService,
        unit_of_work: UnitOfWork,
    ) -> None:
        self.settings = settings
        self.orders = orders
        self.docks = docks
        self.drivers = drivers
        self.vehicles = vehicles
        self.authorizations = authorizations
        self.gate_logs = gate_logs
        self.evidence = evidence
        self.cargo = cargo
        self.slips = slips
        self.secret_hasher = secret_hasher
        self.state_service = state_service
        self.unit_of_work = unit_of_work

    async def create_order(self, payload: CreateOrderInput) -> OrderOutput:
        driver = await self.drivers.get(payload.assigned_driver_id)
        vehicle = await self.vehicles.get(payload.assigned_vehicle_id)
        if driver is None or driver.status != RecordStatus.ACTIVE:
            raise NotFoundError("DRIVER_NOT_FOUND", "Không tìm thấy tài xế đang hoạt động")
        if vehicle is None or vehicle.status != RecordStatus.ACTIVE:
            raise NotFoundError("VEHICLE_NOT_FOUND", "Không tìm thấy phương tiện đang hoạt động")
        if not await self.authorizations.is_authorized(driver.id, vehicle.id, payload.valid_from):
            raise ConflictError(
                "DRIVER_VEHICLE_NOT_AUTHORIZED",
                "Cặp tài xế và phương tiện chưa được ủy quyền tại thời điểm hiệu lực",
            )
        now = datetime.now(UTC)
        order = await self.orders.add(
            WarehouseExitOrder(
                order_id=payload.order_id,
                assigned_driver_id=driver.id,
                assigned_vehicle_id=vehicle.id,
                cargo_metadata=payload.cargo_metadata,
                valid_from=payload.valid_from,
                valid_until=payload.valid_until,
                created_at=now,
                updated_at=now,
            )
        )
        return self.order_output(order)

    async def list_orders(self) -> list[OrderOutput]:
        return [self.order_output(order) for order in await self.orders.list_all()]

    async def get_order(self, order_id: str) -> WarehouseExitOrder:
        order = await self.orders.get_by_order_id(order_id)
        if order is None:
            raise NotFoundError("ORDER_NOT_FOUND", "Không tìm thấy lệnh xuất kho")
        return order

    async def update_order(self, order_id: str, payload: UpdateOrderInput) -> OrderOutput:
        order = await self.get_order(order_id)
        if order.status != OrderStatus.PENDING:
            raise ConflictError(
                "ORDER_STATE_INVALID", "Chỉ được sửa lệnh xuất kho ở trạng thái PENDING"
            )
        changes = payload.model_dump(exclude_unset=True)
        for field_name, value in changes.items():
            if value is not None:
                setattr(order, field_name, value)
        if order.valid_until <= order.valid_from:
            raise SmartGateError("ORDER_VALIDITY_INVALID", "valid_until phải lớn hơn valid_from")
        driver = await self.drivers.get(order.assigned_driver_id)
        vehicle = await self.vehicles.get(order.assigned_vehicle_id)
        if driver is None or vehicle is None:
            raise NotFoundError(
                "ORDER_MASTER_DATA_MISSING", "Không tìm thấy tài xế hoặc phương tiện được gán"
            )
        if not await self.authorizations.is_authorized(driver.id, vehicle.id, order.valid_from):
            raise ConflictError(
                "DRIVER_VEHICLE_NOT_AUTHORIZED",
                "Cặp tài xế và phương tiện chưa được ủy quyền tại thời điểm hiệu lực",
            )
        order.updated_at = datetime.now(UTC)
        return self.order_output(await self.orders.update(order))

    async def cancel_order(self, order_id: str) -> OrderOutput:
        order = await self.get_order(order_id)
        order.status = self.state_service.transition(order.status, OrderStatus.CANCELLED)
        order.exit_event_id = None
        order.updated_at = datetime.now(UTC)
        return self.order_output(await self.orders.update(order))

    async def delete_order(self, order_id: str) -> None:
        if not await self.orders.delete(order_id):
            raise NotFoundError("ORDER_NOT_FOUND", "Không tìm thấy lệnh xuất kho")

    async def start_dock(self, order_id: str) -> DockOutput:
        order = await self.get_order(order_id)
        now = datetime.now(UTC)
        if order.status != OrderStatus.PENDING:
            raise ConflictError("ORDER_STATE_INVALID", "Lệnh xuất kho không ở trạng thái PENDING")
        if not order.valid_from <= now < order.valid_until:
            raise ConflictError(
                "ORDER_NOT_EFFECTIVE", "Lệnh xuất kho chưa hiệu lực hoặc đã hết hạn"
            )
        entry_log = await self.gate_logs.latest_passed_entry(
            order.assigned_driver_id, order.assigned_vehicle_id
        )
        if entry_log is None or entry_log.occurred_at is None:
            raise ConflictError(
                "PASSED_ENTRY_REQUIRED",
                "Không tìm thấy lượt Gate In PASSED của đúng cặp tài xế và phương tiện",
            )
        if entry_log.occurred_at < order.valid_from or entry_log.occurred_at >= order.valid_until:
            raise ConflictError(
                "ENTRY_OUTSIDE_ORDER_WINDOW",
                "Lượt Gate In không nằm trong thời gian hiệu lực của lệnh xuất kho",
            )
        async with self.unit_of_work.transaction():
            inspection = await self.docks.add(
                DockInspection(
                    order_id=order.order_id,
                    entry_gate_log_id=entry_log.id,
                    created_at=now,
                )
            )
            order.status = self.state_service.transition(order.status, OrderStatus.LOADING)
            order.dock_session_id = inspection.id
            order.updated_at = now
            await self.orders.update(order)
        return self.dock_output(inspection)

    async def capture_dock(self, payload: CaptureDockInput) -> DockOutput:
        inspection = await self.docks.get(payload.inspection_id)
        if inspection is None:
            raise NotFoundError("DOCK_SESSION_NOT_FOUND", "Không tìm thấy phiên kiểm tra dock")
        if inspection.status not in {DockStatus.ACTIVE, DockStatus.REVIEW_REQUIRED}:
            raise ConflictError("DOCK_SESSION_CLOSED", "Phiên kiểm tra dock đã kết thúc")
        order = await self.get_order(inspection.order_id)
        if order.status != OrderStatus.LOADING:
            raise ConflictError("ORDER_STATE_INVALID", "Lệnh xuất kho không ở trạng thái LOADING")

        evidence_ref, detections = await asyncio.gather(
            self.evidence.store(
                payload.image,
                category="dock-capture",
                correlation_id=str(inspection.id),
                content_type="image/jpeg",
                extension="jpg",
            ),
            self.cargo.detect(payload.image),
        )
        cargo_state = payload.cargo_state or self._infer_cargo_state(inspection, len(detections))
        captured_at = datetime.now(UTC)
        inspection.captures.append(
            DockCapture(
                captured_at=captured_at,
                cargo_state=cargo_state,
                evidence_ref=evidence_ref,
                detections=detections,
            )
        )
        inspection.current_cargo_state = cargo_state
        inspection.status = (
            DockStatus.REVIEW_REQUIRED if cargo_state == CargoState.ANOMALY else DockStatus.ACTIVE
        )
        inspection = await self.docks.update(inspection)
        return self.dock_output(inspection)

    async def get_dock(self, inspection_id: UUID) -> DockDetailOutput:
        inspection = await self.docks.get(inspection_id)
        if inspection is None:
            raise NotFoundError("DOCK_SESSION_NOT_FOUND", "Không tìm thấy phiên kiểm tra dock")
        return self.dock_detail_output(inspection)

    async def list_docks(self, limit: int = 100) -> list[DockDetailOutput]:
        return [
            self.dock_detail_output(inspection)
            for inspection in await self.docks.list_recent(limit)
        ]

    async def read_dock_capture(self, inspection_id: UUID, capture_index: int) -> bytes:
        inspection = await self.docks.get(inspection_id)
        if inspection is None:
            raise NotFoundError("DOCK_SESSION_NOT_FOUND", "Không tìm thấy phiên kiểm tra dock")
        if capture_index < 0 or capture_index >= len(inspection.captures):
            raise NotFoundError("DOCK_CAPTURE_NOT_FOUND", "Không tìm thấy ảnh kiểm tra hàng")
        return await self.evidence.read(inspection.captures[capture_index].evidence_ref)

    async def finalize_dock(self, payload: FinalizeDockInput) -> DockOutput:
        inspection = await self.docks.get(payload.inspection_id)
        if inspection is None:
            raise NotFoundError("DOCK_SESSION_NOT_FOUND", "Không tìm thấy phiên kiểm tra dock")
        if inspection.status not in {DockStatus.ACTIVE, DockStatus.REVIEW_REQUIRED}:
            raise ConflictError("DOCK_SESSION_CLOSED", "Phiên kiểm tra dock đã kết thúc")
        if not inspection.captures:
            raise ConflictError("DOCK_CAPTURE_REQUIRED", "Cần ít nhất một ảnh kiểm tra hàng hóa")

        inspection.operator_note = payload.operator_note
        inspection.current_cargo_state = payload.final_cargo_state
        if payload.final_cargo_state == CargoState.ANOMALY:
            inspection.status = DockStatus.REVIEW_REQUIRED
            return self.dock_output(await self.docks.update(inspection))

        order = await self.get_order(inspection.order_id)
        order.status = self.state_service.transition(order.status, OrderStatus.READY_FOR_EXIT)
        now = datetime.now(UTC)
        order.updated_at = now
        inspection.status = DockStatus.APPROVED
        inspection.completed_at = now
        async with self.unit_of_work.transaction():
            await self.orders.update(order)
            inspection = await self.docks.update(inspection)
        return self.dock_output(inspection)

    async def issue_slip(self, order_id: str, *, reissue: bool = False) -> SlipOutput:
        order = await self.get_order(order_id)
        if order.status == OrderStatus.SLIP_ISSUED and not reissue:
            raise ConflictError(
                "SLIP_ALREADY_ISSUED", "Phiếu đã được phát hành; dùng thao tác reissue để cấp lại"
            )
        if order.status not in {OrderStatus.READY_FOR_EXIT, OrderStatus.SLIP_ISSUED}:
            raise ConflictError(
                "ORDER_NOT_READY_FOR_SLIP", "Lệnh xuất kho chưa sẵn sàng phát hành phiếu"
            )
        now = datetime.now(UTC)
        expires_at = min(
            order.valid_until,
            now + timedelta(hours=self.settings.slip_max_valid_hours),
        )
        if expires_at <= now:
            raise ConflictError("ORDER_EXPIRED", "Lệnh xuất kho đã hết hạn")
        driver = await self.drivers.get(order.assigned_driver_id)
        vehicle = await self.vehicles.get(order.assigned_vehicle_id)
        if driver is None or vehicle is None:
            raise SmartGateError(
                "ORDER_MASTER_DATA_MISSING", "Thiếu hồ sơ tài xế hoặc phương tiện của lệnh xuất kho"
            )

        artifacts = await self.slips.issue(order, driver, vehicle, expires_at)
        refs_list = await asyncio.gather(
            self.evidence.store(
                artifacts.qr_png,
                category="exit-slip-qr",
                correlation_id=order.order_id,
                content_type="image/png",
                extension="png",
            ),
            self.evidence.store(
                artifacts.html,
                category="exit-slip-html",
                correlation_id=order.order_id,
                content_type="text/html; charset=utf-8",
                extension="html",
            ),
            self.evidence.store(
                artifacts.pdf,
                category="exit-slip-pdf",
                correlation_id=order.order_id,
                content_type="application/pdf",
                extension="pdf",
            ),
        )
        order.slip_version = artifacts.claims.slip_version
        order.slip_jti_hash = self.secret_hasher.hash(artifacts.claims.jti)
        order.slip_token_hash = self.secret_hasher.hash(artifacts.token)
        order.slip_refs = dict(zip(("qr", "html", "pdf"), refs_list, strict=True))
        order.slip_issued_at = artifacts.claims.issued_at
        order.status = self.state_service.transition(order.status, OrderStatus.SLIP_ISSUED)
        order.updated_at = now
        await self.orders.update(order)
        return SlipOutput(
            order_id=order.order_id,
            slip_version=order.slip_version,
            expires_at=artifacts.claims.expires_at,
            refs=order.slip_refs,
        )

    async def read_slip_artifact(self, order_id: str, artifact_type: str) -> tuple[bytes, str]:
        order = await self.get_order(order_id)
        object_key = order.slip_refs.get(artifact_type)
        if object_key is None:
            raise NotFoundError("SLIP_ARTIFACT_NOT_FOUND", "Không tìm thấy tệp phiếu xuất kho")
        content_types = {
            "qr": "image/png",
            "html": "text/html; charset=utf-8",
            "pdf": "application/pdf",
        }
        return await self.evidence.read(object_key), content_types[artifact_type]

    @staticmethod
    def _infer_cargo_state(inspection: DockInspection, detection_count: int) -> CargoState:
        if detection_count == 0:
            return CargoState.EMPTY
        if inspection.current_cargo_state in {CargoState.UNKNOWN, CargoState.EMPTY}:
            return CargoState.LOADING
        return CargoState.LOADED

    @staticmethod
    def order_output(order: WarehouseExitOrder) -> OrderOutput:
        return OrderOutput(
            id=order.id,
            order_id=order.order_id,
            assigned_driver_id=order.assigned_driver_id,
            assigned_vehicle_id=order.assigned_vehicle_id,
            cargo_metadata=order.cargo_metadata,
            status=order.status,
            valid_from=order.valid_from,
            valid_until=order.valid_until,
            dock_session_id=order.dock_session_id,
            slip_version=order.slip_version,
            slip_refs=order.slip_refs,
        )

    @staticmethod
    def dock_output(inspection: DockInspection) -> DockOutput:
        return DockOutput(
            id=inspection.id,
            order_id=inspection.order_id,
            entry_gate_log_id=inspection.entry_gate_log_id,
            status=inspection.status,
            current_cargo_state=inspection.current_cargo_state,
            capture_count=len(inspection.captures),
            operator_note=inspection.operator_note,
            completed_at=inspection.completed_at,
        )

    @classmethod
    def dock_detail_output(cls, inspection: DockInspection) -> DockDetailOutput:
        summary = cls.dock_output(inspection)
        return DockDetailOutput(
            **summary.model_dump(),
            captures=[
                DockCaptureOutput(
                    index=index,
                    captured_at=capture.captured_at,
                    cargo_state=capture.cargo_state,
                    detections=[
                        CargoDetectionOutput(
                            class_name=detection.class_name,
                            confidence=detection.confidence,
                            bounding_box=detection.bounding_box,
                            model_version=detection.model_version,
                        )
                        for detection in capture.detections
                    ],
                )
                for index, capture in enumerate(inspection.captures)
            ],
        )
