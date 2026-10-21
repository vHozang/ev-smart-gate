from __future__ import annotations

import base64
import re
from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import uuid4

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from smart_gate.application.operator_admin import OperatorAdminService
from smart_gate.application.operator_auth import AuthPolicy, OperatorAuthService
from smart_gate.config import Settings
from smart_gate.infrastructure.database.client import MongoDatabase
from smart_gate.infrastructure.database.operator_migration import migrate_operator_identities
from smart_gate.infrastructure.database.operator_store import (
    MongoIdentityRateLimiter,
    MongoIdentityWork,
    MongoOperatorAudit,
    MongoOperatorRoles,
    MongoOperatorSessions,
    MongoOperatorTickets,
    MongoOperatorUsers,
    OperatorCollections,
    _session,
)
from smart_gate.infrastructure.security.crypto import PasswordService, SecretHasher
from smart_gate.infrastructure.security.identity_cursor import SignedIdentityCursor
from smart_gate.infrastructure.security.operator_tokens import (
    Ed25519OperatorTokens,
    OperatorSecrets,
    ServerIdentityClock,
)


def _key(value: str, name: str) -> bytes:
    try:
        result = base64.b64decode(value, altchars=b"-_", validate=True)
    except (ValueError, UnicodeEncodeError) as error:
        raise ValueError(f"{name} phải là base64url của 32 bytes") from error
    if len(result) != 32:
        raise ValueError(f"{name} phải giải mã thành 32 bytes")
    return result


def validate_operator_settings(
    settings: Settings,
) -> tuple[Ed25519OperatorTokens, OperatorSecrets, AuthPolicy]:
    origin = urlsplit(settings.app_public_origin)
    issuer = urlsplit(settings.auth_issuer)
    if (
        origin.scheme not in {"http", "https"}
        or not origin.netloc
        or origin.path not in {"", "/"}
        or origin.query
        or origin.fragment
        or origin.username
        or origin.password
    ):
        raise ValueError("APP_PUBLIC_ORIGIN phải là origin HTTP(S) tường minh")
    if (
        issuer.scheme not in {"http", "https"}
        or not issuer.netloc
        or issuer.username
        or issuer.password
    ):
        raise ValueError("AUTH_ISSUER phải là URI deployment HTTP(S) tường minh")
    if settings.app_env not in {"test", "local"} and (
        origin.scheme != "https" or "*" in settings.cors_origin_list
    ):
        raise ValueError("Operator auth production cần HTTPS và Origin allowlist")
    if settings.auth_audience != "ev-smart-gate-console" or not re.fullmatch(
        r"[A-Za-z0-9_-]{1,64}", settings.auth_key_id
    ):
        raise ValueError("AUTH_AUDIENCE/AUTH_KEY_ID không đúng context operator")
    private_raw = _key(settings.auth_private_key.get_secret_value(), "AUTH_PRIVATE_KEY")
    public_raw = _key(settings.auth_public_key, "AUTH_PUBLIC_KEY")
    if (
        (settings.qr_private_key and private_raw == _key(settings.qr_private_key, "QR_PRIVATE_KEY"))
        or (settings.qr_public_key and public_raw == _key(settings.qr_public_key, "QR_PUBLIC_KEY"))
        or settings.auth_key_id == settings.qr_key_id
    ):
        raise ValueError("Operator JWT phải tách key/kid khỏi phiếu kho")
    private = Ed25519PrivateKey.from_private_bytes(private_raw)
    public_keys = {settings.auth_key_id: Ed25519PublicKey.from_public_bytes(public_raw)}
    for kid, value in settings.auth_previous_public_keys.items():
        if kid == settings.auth_key_id or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", kid):
            raise ValueError("AUTH_PREVIOUS_PUBLIC_KEYS chứa kid không hợp lệ")
        raw = _key(value, "AUTH_PREVIOUS_PUBLIC_KEYS")
        if settings.qr_public_key and raw == _key(settings.qr_public_key, "QR_PUBLIC_KEY"):
            raise ValueError("Không dùng verification key phiếu kho cho operator")
        public_keys[kid] = Ed25519PublicKey.from_public_bytes(raw)
    policy = AuthPolicy(
        settings.auth_access_seconds,
        settings.auth_idle_seconds,
        settings.auth_absolute_seconds,
        settings.auth_rotation_grace_seconds,
        settings.auth_ticket_seconds,
    )
    return (
        Ed25519OperatorTokens(
            private,
            public_keys,
            issuer=settings.auth_issuer,
            audience=settings.auth_audience,
            kid=settings.auth_key_id,
            max_lifetime=policy.access_seconds,
            skew_seconds=settings.auth_clock_skew_seconds,
        ),
        OperatorSecrets(_key(settings.auth_pepper.get_secret_value(), "AUTH_PEPPER")),
        policy,
    )


async def build_operator_identity(
    settings: Settings, database: MongoDatabase, passwords: PasswordService
) -> OperatorAuthService:
    tokens, secrets, policy = validate_operator_settings(settings)
    collections = OperatorCollections(database)
    await collections.initialize()
    work = MongoIdentityWork(database)

    async def bootstrap():
        await MongoOperatorUsers(collections).lock_admin_invariant()
        markers = collections.collection("operator_identity_migrations")
        marker = await markers.find_one({"_id": "operator-rbac-v1:baseline"}, session=_session())
        if (
            marker is None
            and await collections.collection("users").count_documents({}, session=_session()) == 0
        ):
            # Chỉ bootstrap DB trống; không tái tạo ADMIN đã bị đổi tên/khóa/quản trị.
            await collections.collection("users").insert_one(
                {
                    "_id": uuid4(),
                    "username": settings.admin_username.strip().lower(),
                    "role": "ADMIN",
                    "is_active": True,
                    "password_hash": passwords.hash(settings.admin_password),
                    "created_at": datetime.now(UTC),
                    "must_change_password": settings.app_env != "local",
                },
                session=_session(),
            )
        devices = collections.collection("device_credentials")
        if (
            await devices.find_one({"name": "default-edge-agent"}, session=_session()) is None
            and marker is None
        ):
            await devices.insert_one(
                {
                    "_id": uuid4(),
                    "name": "default-edge-agent",
                    "key_hash": SecretHasher(settings.session_secret).hash(settings.device_api_key),
                    "is_active": True,
                    "scopes": ["gate:entry", "gate:exit", "dock:capture"],
                    "created_at": datetime.now(UTC),
                },
                session=_session(),
            )
        await migrate_operator_identities(
            collections, work, datetime.now(UTC), seed_approved_permissions=True
        )

    await work.run(bootstrap)
    return OperatorAuthService(
        MongoOperatorUsers(collections),
        MongoOperatorRoles(collections),
        MongoOperatorSessions(collections),
        MongoOperatorTickets(collections),
        MongoOperatorAudit(collections),
        work,
        passwords,
        secrets,
        tokens,
        ServerIdentityClock(),
        MongoIdentityRateLimiter(
            collections,
            {
                "login-client": (settings.auth_login_client_limit, 60),
                "login-account": (settings.auth_login_account_limit, 60),
                "refresh-client": (settings.auth_refresh_client_limit, 60),
                "ws-ticket": (settings.auth_ticket_limit, 60),
            },
        ),
        policy,
    )


def build_operator_admin(
    settings: Settings, auth: OperatorAuthService, passwords: PasswordService
) -> OperatorAdminService:
    return OperatorAdminService(
        auth.users,
        auth.roles,
        auth.sessions,
        auth.audit,
        auth.work,
        auth,
        passwords,
        auth.clock,
        SignedIdentityCursor(_key(settings.auth_pepper.get_secret_value(), "AUTH_PEPPER")),
    )
