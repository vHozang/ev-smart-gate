from __future__ import annotations

import asyncio
from typing import Any

import httpx


class SmartGateClient:
    """Gửi multipart request và giữ nguyên event_id khi retry lỗi mạng."""

    def __init__(self, api_url: str, device_key: str, timeout_seconds: float) -> None:
        self.api_url = api_url.rstrip("/")
        self.device_key = device_key
        self._client = httpx.AsyncClient(timeout=timeout_seconds)

    async def verify(
        self,
        *,
        workflow: str,
        event_id: str,
        gate_id: str,
        plate_image: bytes,
        face_image: bytes,
        slip_image: bytes | None = None,
    ) -> dict[str, Any]:
        endpoint = f"{self.api_url}/api/v1/gates/{workflow}/verifications"
        files = {
            "plate_image": ("plate.jpg", plate_image, "image/jpeg"),
            "face_image": ("face.jpg", face_image, "image/jpeg"),
        }
        if slip_image is not None:
            files["slip_image"] = ("slip.jpg", slip_image, "image/jpeg")
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                response = await self._client.post(
                    endpoint,
                    data={"event_id": event_id, "gate_id": gate_id},
                    files=files,
                    headers={"X-Device-Key": self.device_key},
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as exc:
                last_error = exc
                if attempt < 2:
                    await asyncio.sleep(2**attempt)
        raise RuntimeError("Không gửi được yêu cầu xác minh sau ba lần thử") from last_error

    async def close(self) -> None:
        await self._client.aclose()
