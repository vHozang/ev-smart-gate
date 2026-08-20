from __future__ import annotations

import hashlib

import pytest

from smart_gate.domain.exceptions import InfrastructureError
from smart_gate.infrastructure.vision.model_integrity import verify_model_checksum


def test_model_checksum_accepts_sidecar_and_rejects_tamper(tmp_path) -> None:
    model = tmp_path / "model.onnx"
    model.write_bytes(b"model-v1")
    sidecar = tmp_path / "model.onnx.sha256"
    sidecar.write_text(hashlib.sha256(b"model-v1").hexdigest(), encoding="ascii")

    verify_model_checksum(model, str(tmp_path / "missing-manifest.json"))
    model.write_bytes(b"model-tampered")

    with pytest.raises(InfrastructureError) as error:
        verify_model_checksum(model, str(tmp_path / "missing-manifest.json"))
    assert error.value.code == "MODEL_CHECKSUM_MISMATCH"
