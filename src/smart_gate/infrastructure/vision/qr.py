from __future__ import annotations

import re

import cv2

from smart_gate.config import Settings
from smart_gate.domain.exceptions import SmartGateError
from smart_gate.infrastructure.vision.common import BoundedExecutor, decode_image


class QrCodeReader:
    """Đọc QR bằng PyZbar, fallback OpenCV; OCR chỉ trả gợi ý order_id."""

    def __init__(self, settings: Settings, executor: BoundedExecutor) -> None:
        self.settings = settings
        self.executor = executor

    async def read_token(self, image: bytes) -> tuple[str | None, str | None]:
        return await self.executor.run(self._read_sync, image)

    def _read_sync(self, image: bytes) -> tuple[str | None, str | None]:
        frame = decode_image(image, self.settings.upload_max_bytes)
        token = self._read_pyzbar(frame) or self._read_opencv(frame)
        if token:
            return token, None
        return None, self._ocr_hint(frame)

    @staticmethod
    def _read_pyzbar(frame) -> str | None:
        try:
            from pyzbar.pyzbar import decode

            results = decode(frame)
            return results[0].data.decode("utf-8") if results else None
        except Exception:
            return None

    @staticmethod
    def _read_opencv(frame) -> str | None:
        value, _, _ = cv2.QRCodeDetector().detectAndDecode(frame)
        return value or None

    @staticmethod
    def _ocr_hint(frame) -> str | None:
        try:
            from paddleocr import PaddleOCR

            result = PaddleOCR(lang="en", use_doc_orientation_classify=False).predict(frame)
            text = " ".join(str(item) for item in result)
            matched = re.search(r"[A-Z0-9_-]{4,128}", text.upper())
            return matched.group(0) if matched else None
        except Exception:
            return None


class RejectingQrReader:
    """Adapter fail-closed dùng khi runtime không có thư viện đọc QR."""

    async def read_token(self, image: bytes) -> tuple[str | None, str | None]:
        raise SmartGateError("QR_READER_UNAVAILABLE", "Bộ đọc QR chưa sẵn sàng", status_code=503)
