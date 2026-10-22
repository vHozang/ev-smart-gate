from __future__ import annotations

import hashlib
import math

from smart_gate.domain.entities import CargoDetection, FaceObservation, PlateObservation
from smart_gate.domain.services import normalize_plate


class SimulatedPlateGateway:
    """Adapter xác định dùng riêng cho simulator và kiểm thử hợp đồng."""

    def __init__(self, plate_number: str) -> None:
        self.plate_number = normalize_plate(plate_number)

    async def recognize(self, image: bytes) -> PlateObservation:
        return PlateObservation(self.plate_number, 0.99, "simulated-lpr-v1")


class SimulatedFaceGateway:
    """Tạo embedding ổn định theo nội dung ảnh để mô phỏng nhiều tài xế không bị trùng."""

    async def extract(self, image: bytes) -> FaceObservation:
        digest = hashlib.sha256(image).digest()
        raw_embedding = tuple((value - 127.5) / 127.5 for value in digest)
        norm = math.sqrt(sum(value * value for value in raw_embedding)) or 1.0
        embedding = tuple(value / norm for value in raw_embedding)
        return FaceObservation(embedding, 0.99, 0.99, True, "simulated-face-v2")


class SimulatedCargoGateway:
    async def detect(self, image: bytes) -> list[CargoDetection]:
        return [
            CargoDetection(
                class_name="pallet",
                confidence=0.98,
                bounding_box={"x": 0.2, "y": 0.2, "width": 0.6, "height": 0.6},
                model_version="simulated-cargo-v1",
            )
        ]
