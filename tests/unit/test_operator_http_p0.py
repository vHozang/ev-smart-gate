"""Kiểm thử HTTP/WebSocket P0 cho Operator Auth v2, Admin RBAC và Security Alerts v2."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from smart_gate.application.operator_admin import OperatorAdminService
from smart_gate.application.operator_auth import OperatorAuthService
from smart_gate.domain.entities import SecurityAlert
from smart_gate.domain.enums import AlertSeverity, AlertStatus
from smart_gate.domain.operator_identity import OperatorRole, OperatorUser
from smart_gate.domain.permission_catalog import (
    APPROVED_NEW_PERMISSIONS,
    BASELINE_ROLE_PERMISSIONS,
    system_role_id,
)
from smart_gate.infrastructure.security.identity_cursor import SignedIdentityCursor
from smart_gate.infrastructure.security.operator_tokens import (
    Ed25519OperatorTokens,
    OperatorSecrets,
)
from smart_gate.main import create_app
from tests.operator_fakes import (
    MemoryIdentity,
    MemoryRoles,
    MemorySessions,
    MemoryTickets,
    MemoryUsers,
    TestClock,
    TestLimiter,
    TestPasswords,
)
from tests.unit.test_operator_configuration import configured

PASSWORD = "synthetic-http-p0-password"


class FakeAlertsRepository:
    """Kho cảnh báo giả lập trong bộ nhớ phục vụ kiểm thử resync v2."""

    def __init__(self, items: list[SecurityAlert] | None = None) -> None:
        self.items: list[SecurityAlert] = items or []

    async def list_after(self, after_sequence: int, limit: int) -> list[SecurityAlert]:
        filtered = [item for item in self.items if item.sequence > after_sequence]
        filtered.sort(key=lambda item: item.sequence)
        return filtered[:limit]


class FakeRealtimeBroker:
    """Broker realtime giả lập cho kết nối WebSocket v2."""

    def __init__(self) -> None:
        self.queues: list[asyncio.Queue[dict[str, object]]] = []

    @asynccontextmanager
    async def subscription(self):
        queue: asyncio.Queue[dict[str, object]] = asyncio.Queue()
        self.queues.append(queue)
        try:
            yield queue
        finally:
            if queue in self.queues:
                self.queues.remove(queue)


@pytest.fixture
def p0_env():
    """Khởi tạo FastAPI app gắn container in-memory cho Operator Auth v2 và Security v2."""

    settings = configured(
        APP_PUBLIC_ORIGIN="http://testserver",
        CORS_ORIGINS="http://testserver",
    )
    db = MemoryIdentity()
    users = MemoryUsers(db)
    roles = MemoryRoles(db)
    sessions = MemorySessions(db)
    tickets = MemoryTickets(db)
    clock = TestClock()
    passwords = TestPasswords()
    key = Ed25519PrivateKey.generate()
    tokens = Ed25519OperatorTokens(
        key,
        {"operator-test": key.public_key()},
        issuer="https://operator.test.invalid",
        kid="operator-test",
    )
    secrets = OperatorSecrets(b"isolated-test-auth-pepper-32bytes-only")

    for code in BASELINE_ROLE_PERMISSIONS:
        rid = system_role_id(code)
        db.state.roles[rid] = OperatorRole(
            rid,
            code,
            code,
            BASELINE_ROLE_PERMISSIONS[code] | APPROVED_NEW_PERMISSIONS[code],
            True,
            created_at=clock.now(),
        )

    admin_user = OperatorUser(
        uuid4(),
        "admin",
        passwords.hash(PASSWORD),
        system_role_id("ADMIN"),
        True,
        clock.now(),
    )
    warehouse_user = OperatorUser(
        uuid4(),
        "warehouse",
        passwords.hash(PASSWORD),
        system_role_id("WAREHOUSE"),
        True,
        clock.now(),
    )
    db.state.users[admin_user.id] = admin_user
    db.state.users[warehouse_user.id] = warehouse_user

    auth_service = OperatorAuthService(
        users,
        roles,
        sessions,
        tickets,
        db,
        db,
        passwords,
        secrets,
        tokens,
        clock,
        TestLimiter(),
    )
    admin_service = OperatorAdminService(
        users,
        roles,
        sessions,
        db,
        db,
        auth_service,
        passwords,
        clock,
        SignedIdentityCursor(b"synthetic-unit-cursor-key-32bytes"),
    )
    alerts_repo = FakeAlertsRepository(
        [
            SecurityAlert(
                event_id="evt-10",
                sequence=10,
                alert_type="TAILGATING",
                severity=AlertSeverity.HIGH,
                message="Phát hiện bám đuôi",
                data={"gate_id": "gate-01"},
                status=AlertStatus.OPEN,
                occurred_at=datetime(2026, 10, 20, 8, 0, tzinfo=UTC),
            ),
            SecurityAlert(
                event_id="evt-11",
                sequence=11,
                alert_type="FACE_MISMATCH",
                severity=AlertSeverity.CRITICAL,
                message="Sai khuôn mặt",
                data={"gate_id": "gate-01"},
                status=AlertStatus.OPEN,
                occurred_at=datetime(2026, 10, 20, 8, 1, tzinfo=UTC),
            ),
        ]
    )
    realtime = FakeRealtimeBroker()

    app = create_app(settings)

    @asynccontextmanager
    async def noop_lifespan(_app):
        _app.state.container = SimpleNamespace(
            settings=settings,
            operator_auth=auth_service,
            operator_admin=admin_service,
            alerts_repository=alerts_repo,
            realtime=realtime,
        )
        yield

    app.router.lifespan_context = noop_lifespan
    return app, db, auth_service, admin_service, alerts_repo, realtime


def _login_headers(client: TestClient, username: str = "admin") -> tuple[dict[str, str], dict]:
    res = client.post(
        "/api/v2/auth/login",
        headers={"Origin": "http://testserver"},
        json={"username": username, "password": PASSWORD},
    )
    assert res.status_code == 200
    body = res.json()
    headers = {
        "Authorization": f"Bearer {body['access_token']}",
        "Origin": "http://testserver",
    }
    return headers, body


def test_ws_ticket_endpoint_normalizes_channel_and_enforces_alerts_permission(p0_env):
    app, *_ = p0_env
    with TestClient(app) as client:
        headers, _ = _login_headers(client, "admin")
        created = client.post(
            "/api/v2/auth/ws-tickets",
            headers=headers,
            json={"channel": "security_alerts"},
        )
        assert created.status_code == 201
        assert created.headers.get("Cache-Control") == "no-store"
        data = created.json()
        assert data["websocket_path"] == "/ws/v2/security/alerts"
        assert data["ticket"]

        wh_headers, _ = _login_headers(client, "warehouse")
        denied = client.post(
            "/api/v2/auth/ws-tickets",
            headers=wh_headers,
            json={"channel": "security.alerts"},
        )
        assert denied.status_code == 403
        assert denied.json()["error"]["code"] == "PERMISSION_DENIED"


def test_resync_alerts_v2_returns_batch_and_detects_history_gap(p0_env):
    app, *_ = p0_env
    with TestClient(app) as client:
        headers, _ = _login_headers(client, "admin")
        ok = client.get("/api/v2/security/alerts?after_sequence=0&limit=1", headers=headers)
        assert ok.status_code == 200
        assert ok.headers.get("Cache-Control") == "no-store"
        batch = ok.json()
        assert batch["epoch"] == "alerts-epoch-v1"
        assert batch["oldest_sequence"] == 10
        assert batch["has_more"] is True
        assert batch["next_after_sequence"] == 10
        assert len(batch["items"]) == 1
        assert batch["items"][0]["alert"]["alert_type"] == "TAILGATING"

        gap_seq = client.get("/api/v2/security/alerts?after_sequence=5", headers=headers)
        assert gap_seq.status_code == 410
        assert gap_seq.json()["error"]["code"] == "ALERT_HISTORY_GAP"

        gap_epoch = client.get(
            "/api/v2/security/alerts?after_sequence=0&epoch=stale-epoch", headers=headers
        )
        assert gap_epoch.status_code == 410
        assert gap_epoch.json()["error"]["code"] == "ALERT_HISTORY_GAP"


def test_websocket_v2_one_time_ticket_replay_rejected_and_midstream_revoke(p0_env):
    app, db, *_ = p0_env
    with TestClient(app) as client:
        headers, login_body = _login_headers(client, "admin")
        ticket_res = client.post(
            "/api/v2/auth/ws-tickets",
            headers=headers,
            json={"channel": "security.alerts"},
        )
        assert ticket_res.status_code == 201
        ticket = ticket_res.json()["ticket"]

        with client.websocket_connect(
            f"/ws/v2/security/alerts?ticket={ticket}",
            headers={"Origin": "http://testserver"},
        ) as ws:
            ws.send_json({"type": "ping"})
            assert ws.receive_json() == {"type": "pong"}

            # Replay cùng ticket lần thứ 2 phải bị từ chối với 4401
            with (
                pytest.raises(WebSocketDisconnect) as replay_err,
                client.websocket_connect(
                    f"/ws/v2/security/alerts?ticket={ticket}",
                    headers={"Origin": "http://testserver"},
                ),
            ):
                pass
            assert replay_err.value.code == 4401

            # Thu hồi phiên user ngay khi stream đang mở -> vòng lặp revalidate đóng với 4401
            uid = uuid4()
            for u in db.state.users.values():
                if u.username == login_body["principal"]["username"]:
                    uid = u.id
                    db.state.users[uid] = replace(u, session_version=u.session_version + 1)
                    break
            ws.send_json({"type": "ping"})
            with pytest.raises(WebSocketDisconnect) as revoke_err:
                ws.receive_json()
            assert revoke_err.value.code == 4401


def test_logout_prevents_refresh_revival_and_role_permission_change_revokes_members(p0_env):
    app, *_ = p0_env
    with TestClient(app) as client:
        admin_headers, _ = _login_headers(client, "admin")
        csrf = client.cookies.get("evsg_auth_csrf")
        assert csrf

        # Tạo custom role và gán cho user mới
        role_res = client.post(
            "/api/v1/admin/roles",
            headers=admin_headers,
            json={"code": "GUARD_CUSTOM", "name": "Guard Custom", "description": "Test role"},
        )
        assert role_res.status_code == 201
        role_id = role_res.json()["id"]

        perm_res = client.put(
            f"/api/v1/admin/roles/{role_id}/permissions",
            headers=admin_headers,
            json={
                "expected_version": 1,
                "reason": "Cấp quyền xem cảnh báo",
                "permission_codes": ["alerts:read"],
            },
        )
        assert perm_res.status_code == 200

        user_res = client.post(
            "/api/v1/admin/users",
            headers=admin_headers,
            json={
                "username": "guard1",
                "password": PASSWORD,
                "role_id": role_id,
                "display_name": "Guard 1",
            },
        )
        assert user_res.status_code == 201

        # Đăng nhập guard1 và đổi mật khẩu lần đầu
        guard_headers, _ = _login_headers(client, "guard1")
        changed = client.post(
            "/api/v2/auth/change-password",
            headers=guard_headers,
            json={"current_password": PASSWORD, "new_password": "new-guard-password-123"},
        )
        assert changed.status_code == 200
        guard_token = changed.json()["access_token"]
        guard_auth = {"Authorization": f"Bearer {guard_token}", "Origin": "http://testserver"}
        assert client.get("/api/v2/auth/me", headers=guard_auth).status_code == 200

        # Đổi permissions của role -> token hiện tại của guard1 bị thu hồi tức thì
        revoke_perm = client.put(
            f"/api/v1/admin/roles/{role_id}/permissions",
            headers=admin_headers,
            json={
                "expected_version": perm_res.json()["version"],
                "reason": "Thu hồi quyền cảnh báo",
                "permission_codes": [],
            },
        )
        assert revoke_perm.status_code == 200
        assert client.get("/api/v2/auth/me", headers=guard_auth).status_code == 401

        # Logout phiên hiện tại -> không thể dùng refresh cookie để khôi phục phiên
        logout_res = client.post(
            "/api/v2/auth/logout",
            headers=admin_headers,
        )
        assert logout_res.status_code == 200
        refresh_after_logout = client.post(
            "/api/v2/auth/refresh",
            headers={"Origin": "http://testserver", "X-CSRF-Token": csrf},
        )
        assert refresh_after_logout.status_code == 401
