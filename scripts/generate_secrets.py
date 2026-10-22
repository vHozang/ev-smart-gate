from __future__ import annotations

import base64
import secrets

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii")


def main() -> None:
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    values = {
        "SESSION_SECRET": secrets.token_urlsafe(48),
        "DEVICE_API_KEY": secrets.token_urlsafe(32),
        "EMBEDDING_ENCRYPTION_KEY": encode(secrets.token_bytes(32)),
        "EVIDENCE_ENCRYPTION_KEY": encode(secrets.token_bytes(32)),
        "QR_PRIVATE_KEY": encode(
            private_key.private_bytes(
                serialization.Encoding.Raw,
                serialization.PrivateFormat.Raw,
                serialization.NoEncryption(),
            )
        ),
        "QR_PUBLIC_KEY": encode(
            public_key.public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
        ),
    }
    for name, value in values.items():
        print(f"{name}={value}")


if __name__ == "__main__":
    main()
