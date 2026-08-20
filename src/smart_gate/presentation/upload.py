from __future__ import annotations

from fastapi import UploadFile

from smart_gate.domain.exceptions import SmartGateError


async def read_upload(upload: UploadFile, max_bytes: int) -> bytes:
    """Đọc upload có giới hạn để ngăn request chiếm dụng bộ nhớ không kiểm soát."""

    payload = await upload.read(max_bytes + 1)
    await upload.close()
    if not payload or len(payload) > max_bytes:
        raise SmartGateError(
            "IMAGE_SIZE_INVALID", "Kích thước tệp tải lên không hợp lệ", status_code=413
        )
    return payload
