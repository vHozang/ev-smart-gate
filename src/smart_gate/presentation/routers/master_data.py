from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile, status

from smart_gate.application.dto import (
    CreateAuthorizationInput,
    CreateDriverInput,
    CreateVehicleInput,
    UpdateDriverInput,
    UpdateVehicleInput,
)
from smart_gate.bootstrap.container import Container
from smart_gate.domain.entities import User
from smart_gate.domain.enums import UserRole
from smart_gate.presentation.dependencies import get_container, require_roles
from smart_gate.presentation.schemas import (
    AuthorizationRequest,
    AuthorizationResponse,
    DriverResponse,
    MessageResponse,
    VehicleRequest,
    VehicleResponse,
    VehicleUpdateRequest,
)
from smart_gate.presentation.upload import read_upload

router = APIRouter(prefix="/api/v1", tags=["Dữ liệu nền"])


def _driver_response(driver) -> DriverResponse:
    return DriverResponse.model_validate(driver)


def _vehicle_response(vehicle) -> VehicleResponse:
    return VehicleResponse.model_validate(vehicle)


@router.post("/drivers", response_model=DriverResponse, status_code=status.HTTP_201_CREATED)
async def create_driver(
    full_name: str = Form(...),
    employee_code: str | None = Form(None),
    phone: str | None = Form(None),
    face_image: UploadFile = File(...),
    user: User = Depends(require_roles(UserRole.ADMIN, csrf=True)),
    container: Container = Depends(get_container),
) -> DriverResponse:
    image = await read_upload(face_image, container.settings.upload_max_bytes)
    driver = await container.registration.create_driver(
        CreateDriverInput(full_name=full_name, employee_code=employee_code, phone=phone),
        image,
    )
    return _driver_response(driver)


@router.get("/drivers", response_model=list[DriverResponse])
async def list_drivers(
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> list[DriverResponse]:
    return [_driver_response(item) for item in await container.registration.list_drivers()]


@router.get("/drivers/{driver_id}", response_model=DriverResponse)
async def get_driver(
    driver_id: UUID,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> DriverResponse:
    return _driver_response(await container.registration.get_driver(driver_id))


@router.patch("/drivers/{driver_id}", response_model=DriverResponse)
async def update_driver(
    driver_id: UUID,
    full_name: str | None = Form(None),
    employee_code: str | None = Form(None),
    phone: str | None = Form(None),
    face_image: UploadFile | None = File(None),
    user: User = Depends(require_roles(UserRole.ADMIN, csrf=True)),
    container: Container = Depends(get_container),
) -> DriverResponse:
    values = {
        key: value
        for key, value in {
            "full_name": full_name,
            "employee_code": employee_code,
            "phone": phone,
        }.items()
        if value is not None
    }
    image = (
        await read_upload(face_image, container.settings.upload_max_bytes)
        if face_image is not None
        else None
    )
    driver = await container.registration.update_driver(
        driver_id, UpdateDriverInput(**values), image
    )
    return _driver_response(driver)


@router.delete("/drivers/{driver_id}", response_model=DriverResponse)
async def deactivate_driver(
    driver_id: UUID,
    user: User = Depends(require_roles(UserRole.ADMIN, csrf=True)),
    container: Container = Depends(get_container),
) -> DriverResponse:
    return _driver_response(await container.registration.deactivate_driver(driver_id))


@router.post("/vehicles", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
async def create_vehicle(
    payload: VehicleRequest,
    user: User = Depends(require_roles(UserRole.ADMIN, csrf=True)),
    container: Container = Depends(get_container),
) -> VehicleResponse:
    vehicle = await container.registration.create_vehicle(
        CreateVehicleInput(**payload.model_dump())
    )
    return _vehicle_response(vehicle)


@router.get("/vehicles", response_model=list[VehicleResponse])
async def list_vehicles(
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> list[VehicleResponse]:
    return [_vehicle_response(item) for item in await container.registration.list_vehicles()]


@router.get("/vehicles/{vehicle_id}", response_model=VehicleResponse)
async def get_vehicle(
    vehicle_id: UUID,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> VehicleResponse:
    return _vehicle_response(await container.registration.get_vehicle(vehicle_id))


@router.patch("/vehicles/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(
    vehicle_id: UUID,
    payload: VehicleUpdateRequest,
    user: User = Depends(require_roles(UserRole.ADMIN, csrf=True)),
    container: Container = Depends(get_container),
) -> VehicleResponse:
    vehicle = await container.registration.update_vehicle(
        vehicle_id, UpdateVehicleInput(**payload.model_dump(exclude_unset=True))
    )
    return _vehicle_response(vehicle)


@router.delete("/vehicles/{vehicle_id}", response_model=VehicleResponse)
async def deactivate_vehicle(
    vehicle_id: UUID,
    user: User = Depends(require_roles(UserRole.ADMIN, csrf=True)),
    container: Container = Depends(get_container),
) -> VehicleResponse:
    return _vehicle_response(await container.registration.deactivate_vehicle(vehicle_id))


@router.post(
    "/driver-vehicle-authorizations",
    response_model=AuthorizationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_authorization(
    payload: AuthorizationRequest,
    user: User = Depends(require_roles(UserRole.ADMIN, csrf=True)),
    container: Container = Depends(get_container),
) -> AuthorizationResponse:
    authorization = await container.registration.authorize(
        CreateAuthorizationInput(**payload.model_dump())
    )
    return AuthorizationResponse.model_validate(authorization)


@router.get("/driver-vehicle-authorizations", response_model=list[AuthorizationResponse])
async def list_authorizations(
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> list[AuthorizationResponse]:
    return [
        AuthorizationResponse.model_validate(item)
        for item in await container.registration.list_authorizations()
    ]


@router.delete(
    "/driver-vehicle-authorizations/{driver_id}/{vehicle_id}",
    response_model=MessageResponse,
)
async def revoke_authorization(
    driver_id: UUID,
    vehicle_id: UUID,
    user: User = Depends(require_roles(UserRole.ADMIN, csrf=True)),
    container: Container = Depends(get_container),
) -> MessageResponse:
    await container.registration.revoke_authorization(driver_id, vehicle_id)
    return MessageResponse(message="Đã thu hồi ủy quyền")
