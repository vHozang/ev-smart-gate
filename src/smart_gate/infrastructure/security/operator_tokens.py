from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime
from uuid import UUID

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from smart_gate.domain.exceptions import AuthenticationError
from smart_gate.domain.operator_identity import AccessClaims


class ServerIdentityClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class OperatorSecrets:
    """Namespace/pepper operator riêng; không dùng digest của phiếu kho hay legacy session."""

    def __init__(self, pepper: bytes) -> None:
        if len(pepper) < 32:
            raise ValueError("Operator auth pepper cần ít nhất 32 bytes")
        self._pepper = pepper

    def generate(self) -> str:
        return secrets.token_urlsafe(32)

    def digest(self, secret: str) -> str:
        return hmac.new(
            self._pepper, b"evsg.operator.v2\0" + secret.encode(), hashlib.sha256
        ).hexdigest()

    def matches(self, secret: str, digest: str) -> bool:
        return hmac.compare_digest(self.digest(secret), digest)


class Ed25519OperatorTokens:
    """JWT tiêu chuẩn qua PyJWT; allowlist key/algorithm/claims, clock inject để test expiry.

    Các NumericDate được kiểm thủ công để dùng cùng clock của use case; không tắt kiểm
    chữ ký/issuer/audience. Không nhận JWK/URL/key theo token hoặc chia sẻ key phiếu kho.
    """

    def __init__(
        self,
        private_key: Ed25519PrivateKey,
        public_keys: dict[str, Ed25519PublicKey],
        *,
        issuer: str,
        audience: str = "ev-smart-gate-console",
        kid: str,
        max_lifetime: int = 300,
        skew_seconds: int = 30,
    ) -> None:
        if not issuer or not audience or not kid or kid not in public_keys:
            raise ValueError("Operator JWT cần issuer/audience/kid tường minh")
        if max_lifetime <= 0 or not 0 <= skew_seconds <= 30:
            raise ValueError("Lifetime/skew operator JWT không hợp lệ")

        def raw(key: Ed25519PublicKey) -> bytes:
            return key.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)

        if raw(private_key.public_key()) != raw(public_keys[kid]):
            raise ValueError("Operator signing key không khớp public key")
        self._private_key, self._public_keys = private_key, dict(public_keys)
        self.issuer, self.audience, self.kid = issuer, audience, kid
        self.max_lifetime, self.skew_seconds = max_lifetime, skew_seconds

    def issue(self, claims: AccessClaims) -> str:
        payload = {
            "iss": self.issuer,
            "aud": self.audience,
            "sub": str(claims.user_id),
            "sid": str(claims.session_id),
            "jti": str(claims.jti),
            "iat": int(claims.issued_at.timestamp()),
            "nbf": int(claims.not_before.timestamp()),
            "exp": int(claims.expires_at.timestamp()),
            "sv": claims.session_version,
            "av": claims.authz_version,
            "rv": claims.role_version,
        }
        return jwt.encode(
            payload, self._private_key, algorithm="EdDSA", headers={"kid": self.kid, "typ": "JWT"}
        )

    def verify(self, token: str, now: datetime) -> AccessClaims:
        if now.tzinfo is None:
            raise ValueError("Clock phải có timezone")
        try:
            if len(token) > 8192:
                raise ValueError("Token quá dài")
            headers = jwt.get_unverified_header(token)
            if (
                headers.get("alg") != "EdDSA"
                or headers.get("typ") != "JWT"
                or not isinstance(headers.get("kid"), str)
                or set(headers) != {"alg", "typ", "kid"}
            ):
                raise ValueError("Header ngoài allowlist")
            public_key = self._public_keys.get(headers["kid"])
            if public_key is None:
                raise ValueError("Key không được phép")
            required = ["iss", "aud", "sub", "sid", "jti", "iat", "nbf", "exp", "sv", "av", "rv"]
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["EdDSA"],
                issuer=self.issuer,
                audience=self.audience,
                options={
                    "require": required,
                    "strict_aud": True,
                    "verify_exp": False,
                    "verify_iat": False,
                    "verify_nbf": False,
                },
            )
            if not all(type(payload[name]) is str for name in ("sub", "sid", "jti")):
                raise ValueError("Identity claim phải là string UUID")
            if set(payload) != set(required):
                raise ValueError("Claims ngoài schema")
            for name in ("iat", "nbf", "exp", "sv", "av", "rv"):
                if type(payload[name]) is not int or payload[name] < 0:
                    raise ValueError("Numeric claim không hợp lệ")
            if min(payload["sv"], payload["av"], payload["rv"]) < 1:
                raise ValueError("Version phải dương")
            timestamp, skew = now.timestamp(), self.skew_seconds
            if payload["exp"] <= timestamp - skew:
                raise AuthenticationError("ACCESS_TOKEN_EXPIRED", "Access token đã hết hạn")
            if (
                payload["exp"] <= timestamp - skew
                or payload["iat"] > timestamp + skew
                or payload["nbf"] > timestamp + skew
                or not 0 < payload["exp"] - payload["iat"] <= self.max_lifetime
                or payload["nbf"] < payload["iat"]
                or payload["nbf"] >= payload["exp"]
            ):
                raise ValueError("Token hết hạn hoặc thời gian không hợp lệ")
            return AccessClaims(
                UUID(payload["sub"]),
                UUID(payload["sid"]),
                UUID(payload["jti"]),
                datetime.fromtimestamp(payload["iat"], UTC),
                datetime.fromtimestamp(payload["nbf"], UTC),
                datetime.fromtimestamp(payload["exp"], UTC),
                payload["sv"],
                payload["av"],
                payload["rv"],
            )
        except (jwt.InvalidTokenError, ValueError, TypeError, KeyError, OverflowError) as error:
            raise AuthenticationError(
                "ACCESS_TOKEN_INVALID", "Access token không hợp lệ hoặc đã hết hạn"
            ) from error
