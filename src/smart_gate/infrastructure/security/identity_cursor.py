from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime
from uuid import UUID

from smart_gate.domain.exceptions import ConflictError, SmartGateError
from smart_gate.domain.identity_queries import PageBoundary


class SignedIdentityCursor:
    """Cursor HMAC riêng namespace, bind identity/version/query, không nhận DB expression."""

    def __init__(self, key: bytes, lifetime_seconds: int = 1800) -> None:
        if len(key) < 32 or not 0 < lifetime_seconds <= 3600:
            raise ValueError("Cursor key/lifetime không hợp lệ")
        self._key, self.lifetime_seconds = key, lifetime_seconds

    def _sign(self, body: bytes) -> str:
        return hmac.new(self._key, b"evsg.identity.cursor.v1\0" + body, hashlib.sha256).hexdigest()

    def encode(self, position: PageBoundary, scope: str, now: datetime) -> str:
        body = json.dumps(
            {
                "v": 1,
                "s": hashlib.sha256(scope.encode()).hexdigest(),
                "at": position.created_at.isoformat(),
                "id": str(position.id),
                "exp": int(now.timestamp()) + self.lifetime_seconds,
            },
            separators=(",", ":"),
        ).encode()
        return base64.urlsafe_b64encode(body).decode().rstrip("=") + "." + self._sign(body)

    def decode(self, cursor: str, scope: str, now: datetime) -> PageBoundary:
        try:
            if len(cursor) > 2048:
                raise ValueError("Cursor quá dài")
            encoded, signature = cursor.split(".")
            body = base64.b64decode(
                encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True
            )
            if not hmac.compare_digest(signature, self._sign(body)):
                raise ValueError("Chữ ký không đúng")
            data = json.loads(body)
            if (
                set(data) != {"v", "s", "at", "id", "exp"}
                or type(data["v"]) is not int
                or data["v"] != 1
            ):
                raise ValueError("Schema cursor không đúng")
            if type(data["exp"]) is not int or data["exp"] <= now.timestamp():
                raise ValueError("Cursor hết hạn")
            if data["s"] != hashlib.sha256(scope.encode()).hexdigest():
                raise ConflictError(
                    "CURSOR_SCOPE_CHANGED", "Identity/quyền/query đã thay đổi; tải lại từ đầu"
                )
            at = datetime.fromisoformat(data["at"])
            if at.tzinfo is None:
                raise ValueError("Cursor timestamp thiếu timezone")
            return PageBoundary(at, UUID(data["id"]))
        except (ValueError, TypeError, KeyError, AttributeError) as error:
            raise SmartGateError(
                "CURSOR_INVALID", "Cursor không hợp lệ hoặc đã hết hạn", status_code=400
            ) from error
