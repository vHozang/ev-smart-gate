from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Path, Query, UploadFile, status
from fastapi.responses import Response

from smart_gate.application.dto import (
    CaptureDockInput,
    CreateOrderInput,
    DockDetailOutput,
    DockOutput,
    FinalizeDockInput,
    OrderOutput,
    SlipOutput,
    UpdateOrderInput,
)
from smart_gate.bootstrap.container import Container
from smart_gate.domain.entities import DeviceCredential, User
from smart_gate.domain.enums import CargoState, UserRole
from smart_gate.presentation.dependencies import (
    get_container,
    require_device_or_roles,
    require_roles,
)
from smart_gate.presentation.schemas import (
    CreateOrderRequest,
    FinalizeDockRequest,
    UpdateOrderRequest,
)
from smart_gate.presentation.upload import read_upload

router = APIRouter(prefix="/api/v1/warehouse", tags=["Kho xuất hàng"])


@router.post(
    "/orders",
    response_model=OrderOutput,
    status_code=status.HTTP_201_CREATED,
)
async def create_order(
    payload: CreateOrderRequest,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, csrf=True)),
    container: Container = Depends(get_container),
) -> OrderOutput:
    return await container.warehouse.create_order(CreateOrderInput(**payload.model_dump()))


@router.get("/orders", response_model=list[OrderOutput])
async def list_orders(
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> list[OrderOutput]:
    return await container.warehouse.list_orders()


@router.get("/orders/{order_id}", response_model=OrderOutput)
async def get_order(
    order_id: str,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> OrderOutput:
    order = await container.warehouse.get_order(order_id)
    return container.warehouse.order_output(order)


@router.patch("/orders/{order_id}", response_model=OrderOutput)
async def update_order(
    order_id: str,
    payload: UpdateOrderRequest,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, csrf=True)),
    container: Container = Depends(get_container),
) -> OrderOutput:
    return await container.warehouse.update_order(
        order_id, UpdateOrderInput(**payload.model_dump(exclude_unset=True))
    )


@router.delete("/orders/{order_id}", response_model=OrderOutput)
async def cancel_order(
    order_id: str,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, csrf=True)),
    container: Container = Depends(get_container),
) -> OrderOutput:
    return await container.warehouse.cancel_order(order_id)


@router.post(
    "/orders/{order_id}/dock-sessions",
    response_model=DockOutput,
    status_code=status.HTTP_201_CREATED,
)
async def start_dock(
    order_id: str,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, csrf=True)),
    container: Container = Depends(get_container),
) -> DockOutput:
    return await container.warehouse.start_dock(order_id)


@router.post("/dock-sessions/{inspection_id}/captures", response_model=DockOutput)
async def capture_dock(
    inspection_id: UUID,
    image: UploadFile = File(...),
    cargo_state: CargoState | None = Form(None),
    actor: DeviceCredential | User = Depends(
        require_device_or_roles("dock:capture", UserRole.ADMIN, UserRole.WAREHOUSE)
    ),
    container: Container = Depends(get_container),
) -> DockOutput:
    payload = await read_upload(image, container.settings.upload_max_bytes)
    return await container.warehouse.capture_dock(
        CaptureDockInput(
            inspection_id=inspection_id,
            image=payload,
            cargo_state=cargo_state,
        )
    )


@router.get("/dock-sessions", response_model=list[DockDetailOutput])
async def list_docks(
    limit: int = Query(100, ge=1, le=500),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> list[DockDetailOutput]:
    return await container.warehouse.list_docks(limit=min(max(limit, 1), 500))


@router.get("/dock-sessions/{inspection_id}", response_model=DockDetailOutput)
async def get_dock(
    inspection_id: UUID,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> DockDetailOutput:
    return await container.warehouse.get_dock(inspection_id)


@router.get(
    "/dock-sessions/{inspection_id}/captures/{capture_index}/image",
    response_class=Response,
    responses={200: {"content": {"image/jpeg": {}}, "description": "Ảnh kiểm tra hàng"}},
)
async def read_dock_capture(
    inspection_id: UUID,
    capture_index: int = Path(ge=0),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> Response:
    payload = await container.warehouse.read_dock_capture(inspection_id, capture_index)
    return Response(content=payload, media_type="image/jpeg")


@router.post("/dock-sessions/{inspection_id}/finalize", response_model=DockOutput)
async def finalize_dock(
    inspection_id: UUID,
    payload: FinalizeDockRequest,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, csrf=True)),
    container: Container = Depends(get_container),
) -> DockOutput:
    return await container.warehouse.finalize_dock(
        FinalizeDockInput(
            inspection_id=inspection_id,
            operator_note=payload.operator_note,
            final_cargo_state=payload.final_cargo_state,
        )
    )


@router.post("/orders/{order_id}/exit-slip", response_model=SlipOutput)
async def issue_slip(
    order_id: str,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, csrf=True)),
    container: Container = Depends(get_container),
) -> SlipOutput:
    return await container.warehouse.issue_slip(order_id)


@router.post("/orders/{order_id}/exit-slip/reissue", response_model=SlipOutput)
async def reissue_slip(
    order_id: str,
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, csrf=True)),
    container: Container = Depends(get_container),
) -> SlipOutput:
    return await container.warehouse.issue_slip(order_id, reissue=True)


@router.get(
    "/orders/{order_id}/exit-slip/{artifact_type}",
    response_class=Response,
    responses={
        200: {
            "description": "Tệp phiếu xuất kho đã được xác thực quyền truy cập",
            "content": {
                "image/png": {},
                "text/html": {},
                "application/pdf": {},
            },
        }
    },
)
async def download_slip(
    order_id: str,
    artifact_type: Literal["qr", "html", "pdf"],
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.SECURITY)),
    container: Container = Depends(get_container),
) -> Response:
    payload, content_type = await container.warehouse.read_slip_artifact(order_id, artifact_type)
    return Response(content=payload, media_type=content_type)
