from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import ValidationError

from smart_gate.application.dto import (
    ParkingGateVerificationInput,
    VerificationOutput,
)
from smart_gate.bootstrap.container import Container
from smart_gate.domain.entities import DeviceCredential, User
from smart_gate.domain.enums import Direction, UserRole
from smart_gate.domain.exceptions import SmartGateError
from smart_gate.presentation.dependencies import get_container, require_device_or_roles
from smart_gate.presentation.upload import read_upload

router = APIRouter(prefix="/api/v1/gates", tags=["Xác minh cổng"])


def _build_verification_input(
    direction: Direction,
    event_id: str,
    gate_id: str,
    card_uid: str,
    plate_payload: bytes,
    face_payload: bytes,
) -> ParkingGateVerificationInput:
    cleaned_uid = card_uid.strip()
    if len(cleaned_uid) < 4 or len(cleaned_uid) > 128:
        raise SmartGateError(
            code="CARD_UID_INVALID",
            message="UID thẻ không hợp lệ",
            status_code=422,
        )
    try:
        return ParkingGateVerificationInput(
            direction=direction,
            event_id=event_id,
            gate_id=gate_id,
            card_uid=cleaned_uid,
            plate_image=plate_payload,
            face_image=face_payload,
        )
    except ValidationError:
        raise SmartGateError(
            code="CARD_UID_INVALID",
            message="UID thẻ không hợp lệ",
            status_code=422,
        ) from None


@router.post("/entry/verifications", response_model=VerificationOutput)
async def verify_entry(
    event_id: str = Form(..., min_length=8, max_length=128),
    gate_id: str = Form(..., min_length=1, max_length=128),
    card_uid: str = Form(...),
    plate_image: UploadFile = File(...),
    face_image: UploadFile = File(...),
    actor: DeviceCredential | User = Depends(
        require_device_or_roles("gate:entry", UserRole.ADMIN, UserRole.SECURITY)
    ),
    container: Container = Depends(get_container),
) -> VerificationOutput:
    cleaned_uid = card_uid.strip()
    if len(cleaned_uid) < 4 or len(cleaned_uid) > 128:
        raise SmartGateError(
            code="CARD_UID_INVALID",
            message="UID thẻ không hợp lệ",
            status_code=422,
        )
    plate_payload, face_payload = await _read_pair(container, plate_image, face_image)
    payload = _build_verification_input(
        direction=Direction.ENTRY,
        event_id=event_id,
        gate_id=gate_id,
        card_uid=cleaned_uid,
        plate_payload=plate_payload,
        face_payload=face_payload,
    )
    return await container.verify_parking_gate.execute(payload)


@router.post("/exit/verifications", response_model=VerificationOutput)
async def verify_exit(
    event_id: str = Form(..., min_length=8, max_length=128),
    gate_id: str = Form(..., min_length=1, max_length=128),
    card_uid: str = Form(...),
    plate_image: UploadFile = File(...),
    face_image: UploadFile = File(...),
    actor: DeviceCredential | User = Depends(
        require_device_or_roles("gate:exit", UserRole.ADMIN, UserRole.SECURITY)
    ),
    container: Container = Depends(get_container),
) -> VerificationOutput:
    cleaned_uid = card_uid.strip()
    if len(cleaned_uid) < 4 or len(cleaned_uid) > 128:
        raise SmartGateError(
            code="CARD_UID_INVALID",
            message="UID thẻ không hợp lệ",
            status_code=422,
        )
    plate_payload, face_payload = await _read_pair(container, plate_image, face_image)
    payload = _build_verification_input(
        direction=Direction.EXIT,
        event_id=event_id,
        gate_id=gate_id,
        card_uid=cleaned_uid,
        plate_payload=plate_payload,
        face_payload=face_payload,
    )
    return await container.verify_parking_gate.execute(payload)


async def _read_pair(
    container: Container, first: UploadFile, second: UploadFile
) -> tuple[bytes, bytes]:
    first_payload = await read_upload(first, container.settings.upload_max_bytes)
    second_payload = await read_upload(second, container.settings.upload_max_bytes)
    return first_payload, second_payload
