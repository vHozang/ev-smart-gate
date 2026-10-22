from __future__ import annotations

import pytest

from smart_gate.domain.services import FaceMatchingService
from smart_gate.infrastructure.vision.simulated import SimulatedFaceGateway


@pytest.mark.asyncio
async def test_simulated_face_embedding_is_stable_and_distinguishes_images() -> None:
    gateway = SimulatedFaceGateway()
    first = await gateway.extract(b"anh-khuon-mat-a")
    repeated = await gateway.extract(b"anh-khuon-mat-a")
    second = await gateway.extract(b"anh-khuon-mat-b")

    matcher = FaceMatchingService(0.75)

    assert first.embedding == repeated.embedding
    assert matcher.cosine_similarity(first.embedding, repeated.embedding) == pytest.approx(1.0)
    assert matcher.cosine_similarity(first.embedding, second.embedding) < 0.75
    assert first.model_version == "simulated-face-v2"
