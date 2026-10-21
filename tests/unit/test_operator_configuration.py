from __future__ import annotations

import base64
import secrets

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from smart_gate.bootstrap.operator_identity import validate_operator_settings
from smart_gate.config import Settings
from smart_gate.main import create_app


def key_pair():
    key = Ed25519PrivateKey.generate()
    return (
        base64.urlsafe_b64encode(
            key.private_bytes(
                serialization.Encoding.Raw,
                serialization.PrivateFormat.Raw,
                serialization.NoEncryption(),
            )
        ).decode(),
        base64.urlsafe_b64encode(
            key.public_key().public_bytes(
                serialization.Encoding.Raw, serialization.PublicFormat.Raw
            )
        ).decode(),
    )


def configured(**overrides):
    private, public = key_pair()
    slip_private, slip_public = key_pair()
    values = {
        "APP_ENV": "test",
        "OPERATOR_AUTH_ENABLED": True,
        "AUTH_ISSUER": "https://operator.test.invalid",
        "AUTH_PRIVATE_KEY": private,
        "AUTH_PUBLIC_KEY": public,
        "AUTH_PEPPER": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
        "QR_PRIVATE_KEY": slip_private,
        "QR_PUBLIC_KEY": slip_public,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_keys_valid_and_private_fields_not_in_settings_repr():
    settings = configured()
    _, _, policy = validate_operator_settings(settings)
    assert policy.access_seconds == 300
    assert settings.auth_private_key.get_secret_value() not in repr(settings)
    assert settings.auth_pepper.get_secret_value() not in repr(settings)


@pytest.mark.parametrize(
    "change",
    [
        {"AUTH_PRIVATE_KEY": "bad"},
        {"AUTH_PUBLIC_KEY": "bad"},
        {"AUTH_PEPPER": "short"},
        {"AUTH_ISSUER": ""},
        {"AUTH_AUDIENCE": "warehouse-slip"},
        {"AUTH_KEY_ID": "gate-ed25519-v1"},
        {"APP_PUBLIC_ORIGIN": "https://test.invalid/path"},
        {"APP_PUBLIC_ORIGIN": "https://user:pw@test.invalid"},
        {"AUTH_IDLE_SECONDS": 700000},
        {"AUTH_CLOCK_SKEW_SECONDS": 31},
        {"APP_ENV": "production", "APP_PUBLIC_ORIGIN": "http://test.invalid"},
        {"APP_ENV": "production", "APP_PUBLIC_ORIGIN": "https://test.invalid", "CORS_ORIGINS": "*"},
    ],
)
def test_unsafe_configuration_fails_closed(change):
    with pytest.raises(ValueError):
        validate_operator_settings(configured(**change))


def test_slip_key_cannot_be_operator_current_or_previous_verifier():
    settings = configured()
    with pytest.raises(ValueError):
        validate_operator_settings(
            settings.model_copy(
                update={
                    "auth_private_key": settings.auth_private_key.__class__(
                        settings.qr_private_key
                    ),
                    "auth_public_key": settings.qr_public_key,
                }
            )
        )
    with pytest.raises(ValueError):
        validate_operator_settings(
            settings.model_copy(
                update={"auth_previous_public_keys": {"old": settings.qr_public_key}}
            )
        )


def test_openapi_v2_auth_matches_security_policy_and_feature_default_off():
    assert (
        "/api/v2/auth/login"
        not in create_app(Settings(_env_file=None, APP_ENV="test")).openapi()["paths"]
    )
    schema = create_app(configured()).openapi()
    assert schema["paths"]["/api/v2/auth/refresh"]["post"]["security"] == [
        {"RefreshCookie": [], "AuthCsrf": []}
    ]
    assert schema["paths"]["/api/v2/auth/me"]["get"]["security"] == [{"OperatorJWT": []}]
    response = schema["paths"]["/api/v2/auth/login"]["post"]["responses"]["422"]
    assert response["content"]["application/json"]["schema"]["$ref"].endswith("ErrorEnvelope")
    assert "/api/v2/auth/ws-tickets" not in schema["paths"]
