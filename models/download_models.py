from __future__ import annotations

import hashlib
import json
import os
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "manifest.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_model(item: dict[str, str]) -> None:
    destination = ROOT / item["path"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_file() and sha256_file(destination) == item["sha256"]:
        print(f"Đã có model hợp lệ: {item['id']}")
        return
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        print(f"Đang tải {item['id']}...")
        urllib.request.urlretrieve(item["url"], temporary_path)
        actual = sha256_file(temporary_path)
        if actual != item["sha256"]:
            raise RuntimeError(
                f"Checksum sai cho {item['id']}: mong đợi {item['sha256']}, nhận {actual}"
            )
        os.replace(temporary_path, destination)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


def main() -> None:
    payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for item in payload["models"]:
        download_model(item)


if __name__ == "__main__":
    main()
