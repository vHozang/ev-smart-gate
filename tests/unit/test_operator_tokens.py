from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from smart_gate.domain.exceptions import AuthenticationError
from smart_gate.domain.operator_identity import AccessClaims
from smart_gate.infrastructure.security.operator_tokens import (
    Ed25519OperatorTokens,
    OperatorSecrets,
)


@pytest.fixture
def context():
    key = Ed25519PrivateKey.generate()
    adapter = Ed25519OperatorTokens(
        key, {"operator": key.public_key()}, issuer="https://test.invalid", kid="operator"
    )
    now = datetime(2026, 10, 20, 12, tzinfo=UTC)
    claims = AccessClaims(
        uuid4(), uuid4(), uuid4(), now, now, now + timedelta(seconds=300), 1, 1, 1
    )
    return key, adapter, now, claims


def payload(context):
    return jwt.decode(context[1].issue(context[3]), options={"verify_signature": False})


def test_operator_roundtrip_with_injected_clock(context):
    _, adapter, now, claims = context
    assert adapter.verify(adapter.issue(claims), now) == claims
    with pytest.raises(AuthenticationError) as error:
        adapter.verify(adapter.issue(claims), now + timedelta(seconds=331))
    assert error.value.code == "ACCESS_TOKEN_EXPIRED"


@pytest.mark.parametrize(
    "change",
    [
        {"aud": "warehouse-slip"},
        {"aud": ["ev-smart-gate-console"]},
        {"iss": "other"},
        {"sv": True},
        {"av": 0},
        {"rv": "1"},
        {"nbf": 9999999999},
        {"exp": 9999999999},
        {"iat": -1},
        {"jti": {}},
        {"sid": "bad-uuid"},
        {"permissions": ["*"]},
    ],
)
def test_signed_but_invalid_claims_are_denied(context, change):
    key, adapter, now, _ = context
    token = jwt.encode(
        {**payload(context), **change},
        key,
        algorithm="EdDSA",
        headers={"kid": "operator", "typ": "JWT"},
    )
    with pytest.raises(AuthenticationError):
        adapter.verify(token, now)


@pytest.mark.parametrize(
    "headers",
    [
        {"kid": "slip"},
        {"typ": "warehouse-slip"},
        {"jku": "https://untrusted.invalid/key"},
        {"crit": ["custom"]},
        {"kid": "operator", "x5u": "https://untrusted.invalid/cert"},
    ],
)
def test_header_key_and_critical_extensions_are_allowlisted(context, headers):
    key, adapter, now, _ = context
    token = jwt.encode(
        payload(context), key, algorithm="EdDSA", headers={"kid": "operator", **headers}
    )
    with pytest.raises(AuthenticationError):
        adapter.verify(token, now)


def test_wrong_signature_algorithm_and_warehouse_key_cannot_authenticate(context):
    _, adapter, now, _ = context
    slip_key = Ed25519PrivateKey.generate()
    for token in [
        jwt.encode(payload(context), slip_key, algorithm="EdDSA", headers={"kid": "operator"}),
        jwt.encode(
            payload(context),
            b"synthetic-hmac-key-only-for-unit-test",
            algorithm="HS256",
            headers={"kid": "operator"},
        ),
        jwt.encode(payload(context), key="", algorithm="none", headers={"kid": "operator"}),
        "not-a-token",
        "x" * 8193,
    ]:
        with pytest.raises(AuthenticationError):
            adapter.verify(token, now)


def test_missing_claim_and_oversized_lifetime_rejected(context):
    key, adapter, now, claims = context
    data = payload(context)
    data.pop("sv")
    with pytest.raises(AuthenticationError):
        adapter.verify(jwt.encode(data, key, algorithm="EdDSA", headers={"kid": "operator"}), now)
    with pytest.raises(AuthenticationError):
        adapter.verify(adapter.issue(replace(claims, expires_at=now + timedelta(days=1))), now)


def test_auth_secrets_namespaced_and_constant_time_match():
    first, second = OperatorSecrets(b"1" * 32), OperatorSecrets(b"2" * 32)
    secret = first.generate()
    assert len(secret) >= 43
    assert first.matches(secret, first.digest(secret))
    assert not first.matches("other", first.digest(secret))
    assert first.digest(secret) != second.digest(secret)
    with pytest.raises(ValueError):
        OperatorSecrets(b"too-short")
