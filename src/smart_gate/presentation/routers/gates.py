from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile

from smart_gate.application.dto import (
    ExitVerificationInput,
    GateVerificationInput,
    VerificationOutput,
)
from smart_gate.bootstrap.container import Container
from smart_gate.domain.entities import DeviceCredential, User
from smart_gate.domain.enums import UserRole
from smart_gate.presentation.dependencies import get_container, require_device_or_roles
from smart_gate.presentation.upload import read_upload

router = APIRouter(prefix="/api/v1/gates", tags=["Xác minh cổng"])


@router.post("/entry/verifications", response_model=VerificationOutput)
async def verify_entry(
    event_id: str = Form(..., min_length=8, max_length=128),
    gate_id: str = Form(..., min_length=1, max_length=128),
    plate_image: UploadFile = File(...),
    face_image: UploadFile = File(...),
    actor: DeviceCredential | User = Depends(
        require_device_or_roles("gate:entry", UserRole.ADMIN, UserRole.SECURITY)
    ),
    container: Container = Depends(get_container),
) -> VerificationOutput:
    plate_payload, face_payload = await _read_pair(container, plate_image, face_image)
    return await container.verify_entry.execute(
        GateVerificationInput(
            event_id=event_id,
            gate_id=gate_id,
            plate_image=plate_payload,
            face_image=face_payload,
        )
    )


@router.post("/exit/verifications", response_model=VerificationOutput)
async def verify_exit(
    event_id: str = Form(..., min_length=8, max_length=128),
    gate_id: str = Form(..., min_length=1, max_length=128),
    plate_image: UploadFile = File(...),
    face_image: UploadFile = File(...),
    slip_image: UploadFile = File(...),
    actor: DeviceCredential | User = Depends(
        require_device_or_roles("gate:exit", UserRole.ADMIN, UserRole.SECURITY)
    ),
    container: Container = Depends(get_container),
) -> VerificationOutput:
    plate_payload = await read_upload(plate_image, container.settings.upload_max_bytes)
    face_payload = await read_upload(face_image, container.settings.upload_max_bytes)
    slip_payload = await read_upload(slip_image, container.settings.upload_max_bytes)
    return await container.verify_exit.execute(
        ExitVerificationInput(
            event_id=event_id,
            gate_id=gate_id,
            plate_image=plate_payload,
            face_image=face_payload,
            slip_image=slip_payload,
        )
    )


async def _read_pair(
    container: Container, first: UploadFile, second: UploadFile
) -> tuple[bytes, bytes]:
    first_payload = await read_upload(first, container.settings.upload_max_bytes)
    second_payload = await read_upload(second, container.settings.upload_max_bytes)
    return first_payload, second_payload
