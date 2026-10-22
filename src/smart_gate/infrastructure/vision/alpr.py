from __future__ import annotations

import statistics
import threading
from typing import Any

from smart_gate.config import Settings
from smart_gate.domain.entities import PlateObservation
from smart_gate.domain.exceptions import InfrastructureError, SmartGateError
from smart_gate.domain.services import normalize_plate
from smart_gate.infrastructure.vision.common import BoundedExecutor, decode_image


class FastAlprGateway:
    def __init__(self, settings: Settings, executor: BoundedExecutor) -> None:
        self.settings = settings
        self.executor = executor
        self._alpr: Any | None = None
        self._lock = threading.Lock()

    def load(self) -> None:
        try:
            from fast_alpr import ALPR

            self._alpr = ALPR(
                detector_model=self.settings.alpr_detector_model,
                ocr_model=self.settings.alpr_ocr_model,
            )
        except Exception as exc:
            raise InfrastructureError("ALPR_LOAD_FAILED", "Không thể nạp model FastALPR") from exc

    async def recognize(self, image: bytes) -> PlateObservation:
        return await self.executor.run(self._recognize_sync, image)

    def _recognize_sync(self, image: bytes) -> PlateObservation:
        if self._alpr is None:
            self.load()
        alpr = self._alpr
        if alpr is None:
            raise InfrastructureError("ALPR_LOAD_FAILED", "Model FastALPR chưa sẵn sàng")
        frame = decode_image(image, self.settings.upload_max_bytes)
        try:
            with self._lock:
                results = alpr.predict(frame)
        except Exception as exc:
            raise InfrastructureError(
                "ALPR_INFERENCE_FAILED", "FastALPR xử lý ảnh thất bại"
            ) from exc
        candidates: list[PlateObservation] = []
        for result in results:
            if result.ocr is None:
                continue
            confidence_value = result.ocr.confidence
            ocr_confidence = (
                float(statistics.mean(confidence_value))
                if isinstance(confidence_value, list) and confidence_value
                else float(confidence_value or 0.0)
            )
            detector_confidence = float(result.detection.confidence)
            text = normalize_plate(result.ocr.text or "")
            if text:
                candidates.append(
                    PlateObservation(
                        text=text,
                        confidence=min(detector_confidence, ocr_confidence),
                        model_version=(
                            f"fastalpr:{self.settings.alpr_detector_model}:"
                            f"{self.settings.alpr_ocr_model}"
                        ),
                    )
                )
        if not candidates:
            raise SmartGateError("PLATE_NOT_FOUND", "Không phát hiện được biển số", status_code=422)
        return max(candidates, key=lambda candidate: candidate.confidence)


class PaddleOcrPlateGateway:
    """Adapter PaddleOCR dự phòng khi không dùng FastALPR detector tích hợp."""

    def __init__(self, settings: Settings, executor: BoundedExecutor) -> None:
        self.settings = settings
        self.executor = executor
        self._ocr: Any | None = None

    def load(self) -> None:
        try:
            from paddleocr import PaddleOCR

            self._ocr = PaddleOCR(lang="en", use_doc_orientation_classify=False)
        except Exception as exc:
            raise InfrastructureError("PADDLE_OCR_LOAD_FAILED", "Không thể nạp PaddleOCR") from exc

    async def recognize(self, image: bytes) -> PlateObservation:
        return await self.executor.run(self._recognize_sync, image)

    def _recognize_sync(self, image: bytes) -> PlateObservation:
        if self._ocr is None:
            self.load()
        ocr = self._ocr
        if ocr is None:
            raise InfrastructureError("PADDLE_OCR_LOAD_FAILED", "PaddleOCR chưa sẵn sàng")
        frame = decode_image(image, self.settings.upload_max_bytes)
        try:
            results = ocr.predict(frame)
        except Exception as exc:
            raise InfrastructureError("PADDLE_OCR_FAILED", "PaddleOCR xử lý ảnh thất bại") from exc
        candidates: list[PlateObservation] = []
        for result in results or []:
            payload = result.json if hasattr(result, "json") else {}
            texts = payload.get("res", {}).get("rec_texts", [])
            scores = payload.get("res", {}).get("rec_scores", [])
            for text, score in zip(texts, scores, strict=False):
                normalized = normalize_plate(str(text))
                if normalized:
                    candidates.append(PlateObservation(normalized, float(score), "paddleocr"))
        if not candidates:
            raise SmartGateError("PLATE_NOT_FOUND", "Không phát hiện được biển số", status_code=422)
        return max(candidates, key=lambda candidate: candidate.confidence)
