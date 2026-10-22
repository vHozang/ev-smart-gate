from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

from smart_gate.domain.exceptions import SmartGateError


def decode_image(payload: bytes, max_bytes: int) -> np.ndarray:
    if not payload or len(payload) > max_bytes:
        raise SmartGateError("IMAGE_SIZE_INVALID", "Kích thước ảnh không hợp lệ", status_code=413)
    frame = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None or frame.size == 0:
        raise SmartGateError(
            "IMAGE_DECODE_FAILED", "Không thể giải mã ảnh đầu vào", status_code=422
        )
    return frame


class BoundedExecutor:
    """Giới hạn số inference đồng thời để bảo vệ CPU và event loop."""

    def __init__(self, max_workers: int) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="vision")
        self._semaphore = asyncio.Semaphore(max_workers)

    async def run(self, function, *args):
        async with self._semaphore:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(self._executor, function, *args)

    def close(self) -> None:
        self._executor.shutdown(wait=True, cancel_futures=True)
