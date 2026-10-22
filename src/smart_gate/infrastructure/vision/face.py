from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from smart_gate.config import Settings
from smart_gate.domain.entities import FaceObservation
from smart_gate.domain.exceptions import InfrastructureError, SmartGateError
from smart_gate.infrastructure.vision.common import BoundedExecutor, decode_image
from smart_gate.infrastructure.vision.model_integrity import verify_model_checksum


class SFaceGateway:
    """YuNet + SFace và MiniFASNet Apache-2.0 với hợp đồng fail-closed."""

    def __init__(self, settings: Settings, executor: BoundedExecutor) -> None:
        self.settings = settings
        self.executor = executor
        self._detector: Any | None = None
        self._recognizer: Any | None = None
        self._liveness_net: Any | None = None
        self._lock = threading.Lock()

    def load(self) -> None:
        model_dir = Path(self.settings.face_model_dir)
        try:
            verify_model_checksum(model_dir / "yunet.onnx", self.settings.model_manifest_path)
            verify_model_checksum(model_dir / "sface.onnx", self.settings.model_manifest_path)
            self._detector = cv2.FaceDetectorYN.create(
                str(model_dir / "yunet.onnx"),
                "",
                (320, 320),
                self.settings.face_detector_threshold,
                0.3,
                5000,
            )
            self._recognizer = cv2.FaceRecognizerSF.create(str(model_dir / "sface.onnx"), "")
            liveness_path = model_dir / "minifasnet.onnx"
            if liveness_path.is_file():
                verify_model_checksum(liveness_path, self.settings.model_manifest_path)
                self._liveness_net = cv2.dnn.readNetFromONNX(str(liveness_path))
            elif self.settings.require_liveness:
                raise FileNotFoundError(str(liveness_path))
        except Exception as exc:
            raise InfrastructureError("FACE_LOAD_FAILED", "Không thể nạp model SFace") from exc

    async def extract(self, image: bytes) -> FaceObservation:
        return await self.executor.run(self._extract_sync, image)

    def _extract_sync(self, image: bytes) -> FaceObservation:
        if self._detector is None or self._recognizer is None:
            self.load()
        detector = self._detector
        recognizer = self._recognizer
        if detector is None or recognizer is None:
            raise InfrastructureError("FACE_LOAD_FAILED", "Model khuôn mặt chưa sẵn sàng")
        frame = decode_image(image, self.settings.upload_max_bytes)
        height, width = frame.shape[:2]
        with self._lock:
            detector.setInputSize((width, height))
            _, faces = detector.detect(frame)
            if faces is None or len(faces) == 0:
                raise SmartGateError(
                    "FACE_NOT_FOUND", "Không phát hiện được khuôn mặt", status_code=422
                )
            row = max(faces, key=lambda item: float(item[2] * item[3]))
            aligned = recognizer.alignCrop(frame, row)
            feature = recognizer.feature(aligned)
        vector = np.asarray(feature, dtype=np.float32).reshape(-1)
        norm = float(np.linalg.norm(vector))
        if norm <= 0:
            raise SmartGateError("FACE_EMBEDDING_INVALID", "Embedding khuôn mặt không hợp lệ")
        vector = vector / norm
        liveness_score = self._liveness(frame, row)
        is_live = (
            liveness_score >= self.settings.liveness_threshold
            if self.settings.require_liveness
            else True
        )
        return FaceObservation(
            embedding=tuple(float(value) for value in vector),
            detector_confidence=float(row[-1]),
            liveness_score=liveness_score,
            is_live=is_live,
            model_version="opencv-sface-2021dec",
        )

    def _liveness(self, frame: np.ndarray, face_row: np.ndarray) -> float:
        if self._liveness_net is None:
            return 1.0 if not self.settings.require_liveness else 0.0
        x, y, width, height = [int(value) for value in face_row[:4]]
        crop = frame[max(0, y) : max(1, y + height), max(0, x) : max(1, x + width)]
        if crop.size == 0:
            return 0.0
        crop = cv2.resize(crop, (80, 80), interpolation=cv2.INTER_AREA)
        blob = cv2.dnn.blobFromImage(
            crop,
            scalefactor=1 / 128.0,
            size=(80, 80),
            mean=(127.5, 127.5, 127.5),
            swapRB=True,
        )
        with self._lock:
            self._liveness_net.setInput(blob)
            output = np.asarray(self._liveness_net.forward()).reshape(-1)
        if output.size == 0:
            return 0.0
        output = output - np.max(output)
        probabilities = np.exp(output) / np.exp(output).sum()
        return float(probabilities[-1])


class DeepFaceGateway:
    """Adapter tùy chọn; chỉ nạp DeepFace khi extra tương ứng được cài."""

    def __init__(self, settings: Settings, executor: BoundedExecutor) -> None:
        self.settings = settings
        self.executor = executor

    async def extract(self, image: bytes) -> FaceObservation:
        return await self.executor.run(self._extract_sync, image)

    def _extract_sync(self, image: bytes) -> FaceObservation:
        try:
            from deepface import DeepFace

            frame = decode_image(image, self.settings.upload_max_bytes)
            representations = DeepFace.represent(
                frame,
                model_name="Facenet512",
                detector_backend="opencv",
                enforce_detection=True,
            )
            vector = np.asarray(representations[0]["embedding"], dtype=np.float32)
            vector = vector / max(float(np.linalg.norm(vector)), 1e-8)
            return FaceObservation(
                tuple(float(value) for value in vector),
                1.0,
                1.0,
                True,
                "deepface-facenet512",
            )
        except SmartGateError:
            raise
        except Exception as exc:
            raise InfrastructureError("DEEPFACE_FAILED", "DeepFace xử lý ảnh thất bại") from exc
