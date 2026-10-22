from __future__ import annotations

import argparse
import base64
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".tmp" / "contract-test.env"
COMPOSE = ROOT / "docker-compose.contract-test.yml"


def prepare_env() -> Path:
    """Chỉ sinh secrets test vào file bỏ qua bởi Git, không in giá trị."""
    if ENV_FILE.exists():
        return ENV_FILE
    ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    values = {
        "TEST_MINIO_SECRET": secrets.token_urlsafe(32),
        "TEST_OPERATOR_PASSWORD": secrets.token_urlsafe(32),
        "TEST_SESSION_SECRET": secrets.token_urlsafe(32),
        "TEST_DEVICE_KEY": secrets.token_urlsafe(32),
        "TEST_EMBEDDING_KEY": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
        "TEST_EVIDENCE_KEY": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
        "TEST_QR_PRIVATE_KEY": base64.urlsafe_b64encode(
            key.private_bytes(
                serialization.Encoding.Raw,
                serialization.PrivateFormat.Raw,
                serialization.NoEncryption(),
            )
        ).decode(),
        "TEST_QR_PUBLIC_KEY": base64.urlsafe_b64encode(
            key.public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
        ).decode(),
    }
    # O_EXCL ngăn hai process ghi đè secrets khi container đang dùng env cũ.
    try:
        descriptor = os.open(ENV_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        return ENV_FILE
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        stream.write("\n".join(f"{name}={value}" for name, value in values.items()) + "\n")
    return ENV_FILE


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Môi trường contract test thật, cô lập production")
    parser.add_argument("action", choices=["prepare", "config", "run", "stop"])
    args = parser.parse_args()
    env_file = prepare_env()
    if args.action == "prepare":
        print("Đã chuẩn bị .tmp/contract-test.env; không in secrets và không seed production")
        return
    docker = shutil.which("docker")
    if docker is None:
        parser.exit(1, "Cần Docker CLI và Linux engine để chạy integration thật.\n")
    command = [docker, "compose", "--env-file", str(env_file), "-f", str(COMPOSE)]
    if args.action == "config":
        raise SystemExit(subprocess.run([*command, "config", "--quiet"], cwd=ROOT).returncode)
    if args.action == "stop":
        raise SystemExit(subprocess.run([*command, "down"], cwd=ROOT).returncode)
    health = subprocess.run([docker, "info"], capture_output=True, text=True, cwd=ROOT)
    if health.returncode:
        parser.exit(1, "Docker Linux engine chưa sẵn sàng; không thay integration bằng mock.\n")
    started = subprocess.run([*command, "up", "--build", "--wait", "api"], cwd=ROOT)
    if started.returncode:
        parser.exit(started.returncode, "Không khởi tạo được test stack cô lập.\n")
    try:
        tested = subprocess.run([*command, "run", "--rm", "checks"], cwd=ROOT)
    finally:
        # Không xóa volumes để giữ evidence; không tác động project compose chính.
        subprocess.run([*command, "down"], cwd=ROOT, check=False)
    raise SystemExit(tested.returncode)


if __name__ == "__main__":
    main()
