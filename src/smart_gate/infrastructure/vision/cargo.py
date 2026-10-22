from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np

from smart_gate.config import Settings
from smart_gate.domain.entities import CargoDetection
from smart_gate.domain.exceptions import InfrastructureError
from smart_gate.infrastructure.vision.common import BoundedExecutor, decode_image
from smart_gate.infrastructure.vision.model_integrity import verify_model_checksum


class YoloXCargoGateway:
    """Object detector ONNX permissive; class map được dùng như quan sát, không tự quyết định."""

    def __init__(self, settings: Settings, executor: BoundedExecutor) -> None:
        self.settings = settings
        self.executor = executor
        self._session: Any | None = None

    def load(self) -> None:
        try:
            import onnxruntime as ort

            model_path = Path(self.settings.cargo_model_path)
            if not model_path.is_file():
                raise FileNotFoundError(str(model_path))
            verify_model_checksum(model_path, self.settings.model_manifest_path)
            self._session = ort.InferenceSession(
                str(model_path), providers=["CPUExecutionProvider"]
            )
        except Exception as exc:
            raise InfrastructureError(
                "CARGO_MODEL_LOAD_FAILED", "Không thể nạp model YOLOX"
            ) from exc

    async def detect(self, image: bytes) -> list[CargoDetection]:
        return await self.executor.run(self._detect_sync, image)

    def _detect_sync(self, image: bytes) -> list[CargoDetection]:
        if self._session is None:
            self.load()
        session = self._session
        if session is None:
            raise InfrastructureError("CARGO_MODEL_LOAD_FAILED", "Model YOLOX chưa sẵn sàng")
        frame = decode_image(image, self.settings.upload_max_bytes)
        input_size = self.settings.cargo_input_size
        height, width = frame.shape[:2]
        ratio = min(input_size / height, input_size / width)
        resized = cv2.resize(
            frame,
            (int(width * ratio), int(height * ratio)),
            interpolation=cv2.INTER_LINEAR,
        )
        padded = np.full((input_size, input_size, 3), 114, dtype=np.uint8)
        padded[: resized.shape[0], : resized.shape[1]] = resized
        tensor = padded[:, :, ::-1].transpose(2, 0, 1).astype(np.float32)
        tensor = np.expand_dims(tensor, axis=0)
        try:
            output = session.run(None, {session.get_inputs()[0].name: tensor})[0]
        except Exception as exc:
            raise InfrastructureError("CARGO_INFERENCE_FAILED", "YOLOX xử lý ảnh thất bại") from exc
        rows = self._decode_output(np.asarray(output), input_size)
        if rows.ndim != 2 or rows.shape[1] < 6:
            return []
        boxes: list[list[float]] = []
        scores: list[float] = []
        class_ids: list[int] = []
        for row in rows:
            class_scores = row[5:]
            class_id = int(np.argmax(class_scores))
            confidence = float(row[4] * class_scores[class_id])
            if confidence < self.settings.cargo_confidence_threshold:
                continue
            cx, cy, box_width, box_height = [float(value) / ratio for value in row[:4]]
            x = max(0.0, cx - box_width / 2)
            y = max(0.0, cy - box_height / 2)
            boxes.append([x, y, box_width, box_height])
            scores.append(confidence)
            class_ids.append(class_id)

        selected = cv2.dnn.NMSBoxes(
            boxes,
            scores,
            self.settings.cargo_confidence_threshold,
            0.45,
        )
        detections: list[CargoDetection] = []
        for index in np.asarray(selected).reshape(-1):
            x, y, box_width, box_height = boxes[int(index)]
            class_id = class_ids[int(index)]
            normalized_x = min(1.0, max(0.0, x / width))
            normalized_y = min(1.0, max(0.0, y / height))
            detections.append(
                CargoDetection(
                    class_name=COCO_CLASS_NAMES[class_id]
                    if class_id < len(COCO_CLASS_NAMES)
                    else f"class_{class_id}",
                    confidence=scores[int(index)],
                    bounding_box={
                        "x": normalized_x,
                        "y": normalized_y,
                        "width": max(0.0, min(1.0 - normalized_x, box_width / width)),
                        "height": max(0.0, min(1.0 - normalized_y, box_height / height)),
                    },
                    model_version="yolox-tiny-0.1.1rc0",
                )
            )
        return detections

    @staticmethod
    def _decode_output(output: np.ndarray, input_size: int) -> np.ndarray:
        rows = output.reshape(-1, output.shape[-1]).copy()
        grids: list[np.ndarray] = []
        expanded_strides: list[np.ndarray] = []
        for stride in (8, 16, 32):
            size = input_size // stride
            y_grid, x_grid = np.meshgrid(np.arange(size), np.arange(size), indexing="ij")
            grid = np.stack((x_grid, y_grid), axis=2).reshape(1, -1, 2)
            grids.append(grid)
            expanded_strides.append(np.full((*grid.shape[:2], 1), stride))
        decoded_grid = np.concatenate(grids, axis=1).reshape(-1, 2)
        strides = np.concatenate(expanded_strides, axis=1).reshape(-1, 1)
        if rows.shape[0] == decoded_grid.shape[0]:
            rows[:, :2] = (rows[:, :2] + decoded_grid) * strides
            rows[:, 2:4] = np.exp(rows[:, 2:4]) * strides
        return rows


COCO_CLASS_NAMES = (
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "airplane",
    "bus",
    "train",
    "truck",
    "boat",
    "traffic light",
    "fire hydrant",
    "stop sign",
    "parking meter",
    "bench",
    "bird",
    "cat",
    "dog",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
    "backpack",
    "umbrella",
    "handbag",
    "tie",
    "suitcase",
    "frisbee",
    "skis",
    "snowboard",
    "sports ball",
    "kite",
    "baseball bat",
    "baseball glove",
    "skateboard",
    "surfboard",
    "tennis racket",
    "bottle",
    "wine glass",
    "cup",
    "fork",
    "knife",
    "spoon",
    "bowl",
    "banana",
    "apple",
    "sandwich",
    "orange",
    "broccoli",
    "carrot",
    "hot dog",
    "pizza",
    "donut",
    "cake",
    "chair",
    "couch",
    "potted plant",
    "bed",
    "dining table",
    "toilet",
    "tv",
    "laptop",
    "mouse",
    "remote",
    "keyboard",
    "cell phone",
    "microwave",
    "oven",
    "toaster",
    "sink",
    "refrigerator",
    "book",
    "clock",
    "vase",
    "scissors",
    "teddy bear",
    "hair drier",
    "toothbrush",
)


class YoloV8CargoGateway:
    def __init__(self, settings: Settings, executor: BoundedExecutor) -> None:
        self.settings = settings
        self.executor = executor
        self._model: Any | None = None

    async def detect(self, image: bytes) -> list[CargoDetection]:
        return await self.executor.run(self._detect_sync, image)

    def _detect_sync(self, image: bytes) -> list[CargoDetection]:
        try:
            from ultralytics import YOLO

            if self._model is None:
                self._model = YOLO(self.settings.cargo_model_path)
            frame = decode_image(image, self.settings.upload_max_bytes)
            results = self._model.predict(
                frame, conf=self.settings.cargo_confidence_threshold, verbose=False
            )
            height, width = frame.shape[:2]
            detections: list[CargoDetection] = []
            for result in results:
                for box in result.boxes:
                    x1, y1, x2, y2 = [float(value) for value in box.xyxy[0]]
                    class_id = int(box.cls[0])
                    detections.append(
                        CargoDetection(
                            class_name=str(result.names[class_id]),
                            confidence=float(box.conf[0]),
                            bounding_box={
                                "x": x1 / width,
                                "y": y1 / height,
                                "width": (x2 - x1) / width,
                                "height": (y2 - y1) / height,
                            },
                            model_version="ultralytics-yolov8",
                        )
                    )
            return detections
        except Exception as exc:
            raise InfrastructureError("YOLOV8_FAILED", "YOLOv8 xử lý ảnh thất bại") from exc
