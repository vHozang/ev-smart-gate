from __future__ import annotations

import asyncio

import cv2
import httpx


class ImageSource:
    """Đọc HTTP snapshot hoặc một frame từ RTSP bằng OpenCV."""

    def __init__(self, timeout_seconds: float, jpeg_quality: int) -> None:
        self.timeout_seconds = timeout_seconds
        self.jpeg_quality = jpeg_quality
        self._http = httpx.AsyncClient(timeout=timeout_seconds)

    async def capture(self, source: str) -> bytes:
        if source.lower().startswith(("http://", "https://")):
            response = await self._http.get(source)
            response.raise_for_status()
            return response.content
        return await asyncio.to_thread(self._capture_opencv, source)

    def _capture_opencv(self, source: str) -> bytes:
        camera = cv2.VideoCapture(source)
        try:
            ok, frame = camera.read()
            if not ok or frame is None:
                raise RuntimeError("Không đọc được frame từ nguồn camera")
            encoded, buffer = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality]
            )
            if not encoded:
                raise RuntimeError("Không mã hóa được frame camera")
            return buffer.tobytes()
        finally:
            camera.release()

    async def close(self) -> None:
        await self._http.aclose()
