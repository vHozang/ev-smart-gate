from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from smart_gate.application.dto import (
    CreateAuthorizationInput,
    CreateDriverInput,
    CreateVehicleInput,
    UpdateAuthorizationInput,
    UpdateDriverInput,
    UpdateVehicleInput,
)
from smart_gate.config import Settings
from smart_gate.domain.entities import Driver, DriverVehicleAuthorization, Vehicle
from smart_gate.domain.enums import RecordStatus
from smart_gate.domain.exceptions import ConflictError, NotFoundError, SmartGateError
from smart_gate.domain.ports import (
    AuthorizationRepository,
    DriverRepository,
    FaceGateway,
    VehicleRepository,
)
from smart_gate.domain.services import FaceMatchingService, normalize_plate


class RegistrationService:
    def __init__(
        self,
        settings: Settings,
        drivers: DriverRepository,
        vehicles: VehicleRepository,
        authorizations: AuthorizationRepository,
        face_gateway: FaceGateway,
    ) -> None:
        self.settings = settings
        self.drivers = drivers
        self.vehicles = vehicles
        self.authorizations = authorizations
        self.face_gateway = face_gateway

    async def create_driver(self, payload: CreateDriverInput, face_image: bytes) -> Driver:
        observation = await self.face_gateway.extract(face_image)
        if observation.detector_confidence < self.settings.face_detector_threshold:
            raise SmartGateError("FACE_LOW_CONFIDENCE", "Chất lượng khuôn mặt đăng ký quá thấp")
        if self.settings.require_liveness and not observation.is_live:
            raise SmartGateError("FACE_SPOOF", "Ảnh đăng ký không vượt qua kiểm tra liveness")
        await self._ensure_face_unique(observation.embedding)
        now = datetime.now(UTC)
        emp_code = (
            payload.employee_code.strip()
            if payload.employee_code and payload.employee_code.strip()
            else None
        )
        phone_val = payload.phone.strip() if payload.phone and payload.phone.strip() else None
        return await self.drivers.add(
            Driver(
                full_name=payload.full_name,
                employee_code=emp_code,
                phone=phone_val,
                face_embedding=observation.embedding,
                face_model=observation.model_version,
                enrolled_at=now,
                created_at=now,
                updated_at=now,
            )
        )

    async def create_vehicle(self, payload: CreateVehicleInput) -> Vehicle:
        plate_normalized = normalize_plate(payload.plate_number)
        if len(plate_normalized) < 4:
            raise SmartGateError("PLATE_FORMAT_INVALID", "Định dạng biển số không hợp lệ")
        now = datetime.now(UTC)
        return await self.vehicles.add(
            Vehicle(
                plate_number=payload.plate_number.upper(),
                plate_normalized=plate_normalized,
                vehicle_type=payload.vehicle_type,
                make=payload.make,
                model=payload.model,
                color=payload.color,
                metadata=payload.metadata,
                created_at=now,
                updated_at=now,
            )
        )

    async def authorize(self, payload: CreateAuthorizationInput) -> DriverVehicleAuthorization:
        if await self.drivers.get(payload.driver_id) is None:
            raise NotFoundError("DRIVER_NOT_FOUND", "Không tìm thấy tài xế")
        if await self.vehicles.get(payload.vehicle_id) is None:
            raise NotFoundError("VEHICLE_NOT_FOUND", "Không tìm thấy phương tiện")
        return await self.authorizations.add(
            DriverVehicleAuthorization(
                driver_id=payload.driver_id,
                vehicle_id=payload.vehicle_id,
                valid_from=payload.valid_from,
                valid_until=payload.valid_until,
            )
        )

    async def get_driver(self, driver_id: UUID) -> Driver:
        driver = await self.drivers.get(driver_id)
        if driver is None:
            raise NotFoundError("DRIVER_NOT_FOUND", "Không tìm thấy tài xế")
        return driver

    async def list_drivers(self) -> list[Driver]:
        return await self.drivers.list_all()

    async def update_driver(
        self,
        driver_id: UUID,
        payload: UpdateDriverInput,
        face_image: bytes | None = None,
    ) -> Driver:
        driver = await self.get_driver(driver_id)
        changes = payload.model_dump(exclude_unset=True)
        for field_name, value in changes.items():
            if field_name in {"employee_code", "phone"} and isinstance(value, str):
                value = value.strip() or None
            setattr(driver, field_name, value)
        if face_image is not None:
            observation = await self.face_gateway.extract(face_image)
            if observation.detector_confidence < self.settings.face_detector_threshold:
                raise SmartGateError(
                    "FACE_LOW_CONFIDENCE", "Chất lượng khuôn mặt cập nhật quá thấp"
                )
            if self.settings.require_liveness and not observation.is_live:
                raise SmartGateError("FACE_SPOOF", "Ảnh cập nhật không vượt qua kiểm tra liveness")
            await self._ensure_face_unique(observation.embedding, excluded_driver_id=driver.id)
            driver.face_embedding = observation.embedding
            driver.face_model = observation.model_version
            driver.embedding_version = str(int(driver.embedding_version) + 1)
            driver.enrolled_at = datetime.now(UTC)
        driver.updated_at = datetime.now(UTC)
        return await self.drivers.update(driver)

    async def deactivate_driver(self, driver_id: UUID) -> Driver:
        driver = await self.get_driver(driver_id)
        driver.status = RecordStatus.INACTIVE
        driver.updated_at = datetime.now(UTC)
        return await self.drivers.update(driver)

    async def delete_driver(self, driver_id: UUID) -> None:
        if not await self.drivers.delete(driver_id):
            raise NotFoundError("DRIVER_NOT_FOUND", "Không tìm thấy tài xế")

    async def get_vehicle(self, vehicle_id: UUID) -> Vehicle:
        vehicle = await self.vehicles.get(vehicle_id)
        if vehicle is None:
            raise NotFoundError("VEHICLE_NOT_FOUND", "Không tìm thấy phương tiện")
        return vehicle

    async def list_vehicles(self) -> list[Vehicle]:
        return await self.vehicles.list_all()

    async def update_vehicle(self, vehicle_id: UUID, payload: UpdateVehicleInput) -> Vehicle:
        vehicle = await self.get_vehicle(vehicle_id)
        changes = payload.model_dump(exclude_unset=True)
        if "plate_number" in changes:
            plate_normalized = normalize_plate(changes["plate_number"])
            if len(plate_normalized) < 4:
                raise SmartGateError("PLATE_FORMAT_INVALID", "Định dạng biển số không hợp lệ")
            changes["plate_number"] = changes["plate_number"].upper()
            changes["plate_normalized"] = plate_normalized
        for field_name, value in changes.items():
            setattr(vehicle, field_name, value)
        vehicle.updated_at = datetime.now(UTC)
        return await self.vehicles.update(vehicle)

    async def deactivate_vehicle(self, vehicle_id: UUID) -> Vehicle:
        vehicle = await self.get_vehicle(vehicle_id)
        vehicle.status = RecordStatus.INACTIVE
        vehicle.updated_at = datetime.now(UTC)
        return await self.vehicles.update(vehicle)

    async def delete_vehicle(self, vehicle_id: UUID) -> None:
        if not await self.vehicles.delete(vehicle_id):
            raise NotFoundError("VEHICLE_NOT_FOUND", "Không tìm thấy phương tiện")

    async def list_authorizations(self) -> list[DriverVehicleAuthorization]:
        return await self.authorizations.list_all()

    async def update_authorization(
        self, authorization_id: UUID, payload: UpdateAuthorizationInput
    ) -> DriverVehicleAuthorization:
        auth = await self.authorizations.get(authorization_id)
        if auth is None:
            raise NotFoundError("AUTHORIZATION_NOT_FOUND", "Không tìm thấy quan hệ ủy quyền")
        changes = payload.model_dump(exclude_unset=True)
        for field_name, value in changes.items():
            setattr(auth, field_name, value)
        if auth.valid_until is not None and auth.valid_until <= auth.valid_from:
            raise SmartGateError(
                "AUTHORIZATION_WINDOW_INVALID", "valid_until phải lớn hơn valid_from"
            )
        if await self.drivers.get(auth.driver_id) is None:
            raise NotFoundError("DRIVER_NOT_FOUND", "Không tìm thấy tài xế")
        if await self.vehicles.get(auth.vehicle_id) is None:
            raise NotFoundError("VEHICLE_NOT_FOUND", "Không tìm thấy phương tiện")
        return await self.authorizations.update(auth)

    async def delete_authorization(self, authorization_id: UUID) -> None:
        if not await self.authorizations.delete(authorization_id):
            raise NotFoundError("AUTHORIZATION_NOT_FOUND", "Không tìm thấy quan hệ ủy quyền")

    async def revoke_authorization(self, driver_id: UUID, vehicle_id: UUID) -> None:
        if not await self.authorizations.revoke(driver_id, vehicle_id):
            raise NotFoundError("AUTHORIZATION_NOT_FOUND", "Không tìm thấy quan hệ ủy quyền")

    async def _ensure_face_unique(
        self,
        embedding: tuple[float, ...],
        *,
        excluded_driver_id: UUID | None = None,
    ) -> None:
        matcher = FaceMatchingService(self.settings.face_similarity_threshold)
        for existing in await self.drivers.list_active():
            if existing.id == excluded_driver_id:
                continue
            if matcher.cosine_similarity(embedding, existing.face_embedding) >= (
                self.settings.face_similarity_threshold
            ):
                raise ConflictError(
                    "FACE_ALREADY_ENROLLED",
                    "Khuôn mặt đã được đăng ký cho một tài xế khác",
                )
