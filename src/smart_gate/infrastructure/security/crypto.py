from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from collections.abc import Iterable

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class EmbeddingCipher:
    """Mã hóa embedding bằng AES-GCM trước khi ghi MongoDB."""

    def __init__(self, base64_key: str) -> None:
        key = base64.urlsafe_b64decode(base64_key.encode("ascii"))
        if len(key) != 32:
            raise ValueError("Khóa embedding phải có đúng 32 byte")
        self._cipher = AESGCM(key)

    def encrypt(self, embedding: Iterable[float], driver_id: str) -> str:
        payload = json.dumps(list(embedding), separators=(",", ":")).encode("utf-8")
        nonce = secrets.token_bytes(12)
        encrypted = self._cipher.encrypt(nonce, payload, driver_id.encode("utf-8"))
        return base64.urlsafe_b64encode(nonce + encrypted).decode("ascii")

    def decrypt(self, ciphertext: str, driver_id: str) -> tuple[float, ...]:
        raw = base64.urlsafe_b64decode(ciphertext.encode("ascii"))
        payload = self._cipher.decrypt(raw[:12], raw[12:], driver_id.encode("utf-8"))
        return tuple(float(value) for value in json.loads(payload.decode("utf-8")))


class SecretHasher:
    """Băm token bằng HMAC để database không giữ credential dạng rõ."""

    def __init__(self, secret: str) -> None:
        self._secret = secret.encode("utf-8")

    def hash(self, value: str) -> str:
        return hmac.new(self._secret, value.encode("utf-8"), hashlib.sha256).hexdigest()

    def verify(self, value: str, expected_hash: str) -> bool:
        return hmac.compare_digest(self.hash(value), expected_hash)


class PasswordService:
    def __init__(self) -> None:
        self._hasher = PasswordHasher()

    def hash(self, password: str) -> str:
        return self._hasher.hash(password)

    def verify(self, password_hash: str, password: str) -> bool:
        try:
            return self._hasher.verify(password_hash, password)
        except (InvalidHashError, VerificationError, VerifyMismatchError):
            return False
