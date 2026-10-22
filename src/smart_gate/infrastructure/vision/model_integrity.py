from __future__ import annotations

import hashlib
import json
from pathlib import Path

from smart_gate.domain.exceptions import InfrastructureError


def verify_model_checksum(model_path: Path, manifest_path: str) -> None:
    """Từ chối nạp model nếu SHA-256 không khớp manifest hoặc sidecar đã khóa."""

    expected = _expected_checksum(model_path, Path(manifest_path))
    digest = hashlib.sha256()
    try:
        with model_path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise InfrastructureError(
            "MODEL_FILE_UNREADABLE", f"Không đọc được model {model_path.name}"
        ) from exc
    if digest.hexdigest().lower() != expected.lower():
        raise InfrastructureError(
            "MODEL_CHECKSUM_MISMATCH", f"Checksum model {model_path.name} không hợp lệ"
        )


def _expected_checksum(model_path: Path, manifest_path: Path) -> str:
    if manifest_path.is_file():
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            for item in payload.get("models", []):
                if str(item.get("path", "")).endswith(model_path.name):
                    return str(item["sha256"])
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise InfrastructureError(
                "MODEL_MANIFEST_INVALID", "Manifest model không hợp lệ"
            ) from exc
    sidecar = model_path.with_suffix(f"{model_path.suffix}.sha256")
    if sidecar.is_file():
        return sidecar.read_text(encoding="ascii").strip().split()[0]
    raise InfrastructureError(
        "MODEL_CHECKSUM_MISSING",
        f"Thiếu checksum đã khóa cho model {model_path.name}",
    )
