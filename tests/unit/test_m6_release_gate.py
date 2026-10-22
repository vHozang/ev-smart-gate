from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from smart_gate.application.migration_services import (
    AnalyticsService,
    AssistantReportService,
    CoreAccessService,
    DeviceSettingsService,
)
from smart_gate.application.operator_admin import OperatorAdminService
from smart_gate.application.operator_auth import OperatorAuthService
from smart_gate.domain.entities import SecurityAlert
from smart_gate.domain.enums import AlertSeverity, AlertStatus, UserRole
from smart_gate.domain.exceptions import AuthenticationError, AuthorizationError
from smart_gate.domain.operator_identity import OperatorRole, OperatorUser
from smart_gate.domain.permission_catalog import (
    APPROVED_NEW_PERMISSIONS,
    BASELINE_ROLE_PERMISSIONS,
    system_role_id,
)
from smart_gate.infrastructure.database.migration_store import HybridMigrationStore
from smart_gate.infrastructure.devices.barrier import SimulatorBarrierGateway
from smart_gate.infrastructure.security.crypto import SecretHasher
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
from tests.unit.test_operator_http_p0 import FakeAlertsRepository, FakeRealtimeBroker

PASSWORD = "synthetic-release-password-2026"
TEMP_PASSWORD = "Temp-Password-2026!"
NEW_PASSWORD = "Updated-Password-2026!"


class _FakeDatabase:
    async def ping(self) -> bool:
        return True


class _FakeLegacyAndDeviceAuth:
    def __init__(self, users_store: MemoryUsers) -> None:
        self._users = users_store
        self.legacy_sessions: dict[str, SimpleNamespace] = {}

    async def authorize_device(self, raw_key: str | None, required_scope: str) -> None:
        if raw_key == "dev-capture-key" and required_scope in {
            "capture:ingest",
            "gate:entry",
            "gate:exit",
            "pedestrian:entry",
            "pedestrian:exit",
        }:
            return
        raise AuthorizationError("DEVICE_SCOPE_DENIED", f"Không đủ quyền {required_scope}")

    async def authenticate_session(self, cookie: str) -> SimpleNamespace:
        session_user = self.legacy_sessions.get(cookie)
        if session_user is None:
            raise AuthenticationError("SESSION_INVALID", "Phiên đăng nhập không hợp lệ")
        op_user = await self._users.get(session_user.id)
        if op_user is not None and not op_user.is_active:
            raise AuthenticationError("USER_INACTIVE", "Tài khoản đã bị vô hiệu hóa")
        return session_user

    async def validate_csrf(self, _cookie: str, csrf_token: str | None) -> None:
        if not csrf_token:
            raise AuthorizationError("CSRF_INVALID", "Thiếu CSRF token")


def _build_release_gate_env():
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
    secrets_svc = OperatorSecrets(b"isolated-test-auth-pepper-32bytes-only")

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
    sec_user = OperatorUser(
        uuid4(),
        "security.op",
        passwords.hash(PASSWORD),
        system_role_id("SECURITY"),
        True,
        clock.now(),
    )
    db.state.users[admin_user.id] = admin_user
    db.state.users[sec_user.id] = sec_user

    auth_service = OperatorAuthService(
        users,
        roles,
        sessions,
        tickets,
        db,
        db,
        passwords,
        secrets_svc,
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
                event_id="evt-release-01",
                sequence=1,
                alert_type="TAILGATING",
                severity=AlertSeverity.HIGH,
                message="Phát hiện bám đuôi tại cổng chính",
                data={"gate_id": "GATE-VEH-01"},
                status=AlertStatus.OPEN,
                occurred_at=datetime(2026, 10, 20, 8, 0, tzinfo=UTC),
            )
        ]
    )
    realtime = FakeRealtimeBroker()
    migration_store = HybridMigrationStore(None)
    secret_hasher = SecretHasher(settings.session_secret)
    barrier_gateway = SimulatorBarrierGateway()
    core_access = CoreAccessService(
        migration_store,
        secret_hasher,
        barrier_gateway,
    )
    analytics = AnalyticsService(
        migration_store,
        None,
        alerts_repo,  # type: ignore[arg-type]
        None,
    )
    assistant = AssistantReportService(migration_store, analytics)
    device_settings = DeviceSettingsService(migration_store)
    fake_auth = _FakeLegacyAndDeviceAuth(users)
    fake_db = _FakeDatabase()

    app = create_app(settings)

    @asynccontextmanager
    async def noop_lifespan(_app):
        _app.state.container = SimpleNamespace(
            settings=settings,
            database=fake_db,
            auth=fake_auth,
            operator_auth=auth_service,
            operator_admin=admin_service,
            alerts_repository=alerts_repo,
            realtime=realtime,
            migration_store=migration_store,
            core_access=core_access,
            analytics=analytics,
            assistant=assistant,
            device_settings=device_settings,
        )
        yield

    app.router.lifespan_context = noop_lifespan
    client = TestClient(app)
    client.__enter__()

    admin_login = client.post(
        "/api/v2/auth/login",
        headers={"Origin": "http://testserver"},
        json={"username": "admin", "password": PASSWORD},
    )
    assert admin_login.status_code == 200
    admin_headers = {
        "Authorization": f"Bearer {admin_login.json()['access_token']}",
        "Origin": "http://testserver",
    }

    sec_login = client.post(
        "/api/v2/auth/login",
        headers={"Origin": "http://testserver"},
        json={"username": "security.op", "password": PASSWORD},
    )
    assert sec_login.status_code == 200
    sec_headers = {
        "Authorization": f"Bearer {sec_login.json()['access_token']}",
        "Origin": "http://testserver",
    }
    return client, admin_headers, sec_headers, fake_auth, settings


def test_task_7_14_e2e_auth_admin_must_change_password_role_revoke_and_conflicts() -> None:
    """Task 7.14: Đăng nhập JWT v2 -> tạo user -> buộc đổi mật khẩu -> gán role -> thu hồi phiên -> 403/409/422."""
    client, admin_headers, sec_headers, _, _ = _build_release_gate_env()

    # 1. Admin tạo tài khoản mới (mặc định must_change_password=True)
    create_res = client.post(
        "/api/v1/admin/users",
        headers=admin_headers,
        json={
            "username": "gate.operator.01",
            "password": TEMP_PASSWORD,
            "role_id": str(system_role_id("WAREHOUSE")),
            "display_name": "Vận hành kho 01",
        },
    )
    assert create_res.status_code == 201
    new_user = create_res.json()
    new_user_id = new_user["id"]
    assert new_user["must_change_password"] is True
    assert new_user["version"] == 1

    # 2. User mới đăng nhập thành công nhưng bị chặn 403 PASSWORD_CHANGE_REQUIRED trên route nghiệp vụ
    op_login = client.post(
        "/api/v2/auth/login",
        headers={"Origin": "http://testserver"},
        json={"username": "gate.operator.01", "password": TEMP_PASSWORD},
    )
    assert op_login.status_code == 200
    op_token = op_login.json()["access_token"]
    op_headers = {"Authorization": f"Bearer {op_token}", "Origin": "http://testserver"}

    blocked_biz = client.get("/api/v1/vehicle-types", headers=op_headers)
    assert blocked_biz.status_code == 403
    assert blocked_biz.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

    # 3. User đổi mật khẩu qua /api/v2/auth/change-password -> truy cập nghiệp vụ thành công
    chg_res = client.post(
        "/api/v2/auth/change-password",
        headers=op_headers,
        json={"current_password": TEMP_PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert chg_res.status_code == 200
    active_headers = {
        "Authorization": f"Bearer {chg_res.json()['access_token']}",
        "Origin": "http://testserver",
    }
    allowed_biz = client.get("/api/v1/vehicle-types", headers=active_headers)
    assert allowed_biz.status_code == 200

    # 4. Kiểm tra direct-link RBAC (403): tài khoản WAREHOUSE/SECURITY gọi quản trị users bị từ chối
    forbidden_admin = client.get("/api/v1/admin/users", headers=sec_headers)
    assert forbidden_admin.status_code == 403

    # 5. Đọc lại version hiện tại của user sau khi đổi mật khẩu rồi gán role mới (SECURITY)
    read_u = client.get(f"/api/v1/admin/users/{new_user_id}", headers=admin_headers).json()
    role_res = client.put(
        f"/api/v1/admin/users/{new_user_id}/role",
        headers=admin_headers,
        json={
            "role_id": str(system_role_id("SECURITY")),
            "expected_version": read_u["version"],
            "reason": "Điều chuyển sang bộ phận an ninh cổng",
        },
    )
    assert role_res.status_code == 200
    updated_u = role_res.json()
    assert updated_u["role_code"] == "SECURITY"

    # 6. Kiểm tra xung đột expected_version (409) và lỗi dữ liệu đầu vào (422)
    conflict_res = client.put(
        f"/api/v1/admin/users/{new_user_id}/role",
        headers=admin_headers,
        json={
            "role_id": str(system_role_id("WAREHOUSE")),
            "expected_version": 1,
            "reason": "Gửi expected_version cũ gây xung đột 409",
        },
    )
    assert conflict_res.status_code == 409

    invalid_res = client.post(
        "/api/v1/admin/users",
        headers=admin_headers,
        json={"username": "x", "password": "123", "role_id": "not-a-uuid"},
    )
    assert invalid_res.status_code == 422

    # 7. Thu hồi toàn bộ phiên của user (revoke sessions)
    revoke_res = client.post(
        f"/api/v1/admin/users/{new_user_id}/sessions/revoke",
        headers=admin_headers,
        json={
            "expected_version": updated_u["version"],
            "reason": "Thu hồi phiên khi kết thúc ca trực",
        },
    )
    assert revoke_res.status_code == 200


def test_task_8_18_and_11_7_and_9_11_e2e_4_modes_fail_closed_and_analytics_reconciliation() -> None:
    """Task 8.18, 11.7 & 9.11: Xác minh 4 chế độ (pedestrian, motorcycle, car, truck), fail-closed và đối chiếu Dashboard."""
    client, admin_headers, _, _, _ = _build_release_gate_env()
    now = datetime.now(UTC)

    # 1. Tạo nhân viên và cấp quyền đi bộ hợp lệ
    emp_res = client.post(
        "/api/v1/employees",
        headers={**admin_headers, "Idempotency-Key": "rel-emp-01"},
        json={"person_id": str(uuid4()), "employee_code": "EMP-REL-001"},
    )
    assert emp_res.status_code == 201

    # 2. Xác minh thành công 3 chế độ phương tiện: motorcycle, car, truck (cả ENTRY và EXIT độc lập đơn hàng kho)
    vehicle_modes = ["motorcycle", "car", "truck"]
    for idx, mode in enumerate(vehicle_modes, start=1):
        bundle_res = client.post(
            "/api/v2/capture-bundles",
            headers={"X-Device-Key": "dev-capture-key", "Origin": "http://testserver"},
            json={
                "schema_version": "1.0",
                "encounter_id": f"ENC-VEH-REL-{idx}",
                "access_point_id": "GATE-VEH-01",
                "lane_id": "lane-01",
                "access_mode": mode,
                "calibration_version": "cal-rel-v1",
                "face_captured_at": now.isoformat(),
                "plate_captured_at": now.isoformat(),
                "rfid_captured_at": now.isoformat(),
                "card_uid": f"RFID-VEH-REL-{idx}",
            },
        )
        assert bundle_res.status_code == 201
        bundle_id = bundle_res.json()["capture_bundle_id"]

        direction_slug = "exit" if mode == "truck" else "entry"
        event_id = f"EVT-VEH-{mode.upper()}-{idx}"
        ver_res = client.post(
            f"/api/v2/gates/{direction_slug}/verifications",
            headers=admin_headers,
            json={
                "event_id": event_id,
                "gate_id": "GATE-VEH-01",
                "capture_bundle_id": bundle_id,
            },
        )
        assert ver_res.status_code == 200
        v_body = ver_res.json()
        assert v_body["access_mode"] == mode
        assert v_body["verification_status"] == "PASSED"
        assert v_body["permit_granted"] is True
        assert v_body["barrier_status"] == "OPENED"

        # Đối soát qua GET /api/v2/access-events/{event_id}
        rec_res = client.get(f"/api/v2/access-events/{event_id}", headers=admin_headers)
        assert rec_res.status_code == 200
        assert rec_res.json()["operation_id"] == v_body["operation_id"]

    # 3. Xác minh thành công chế độ thứ 4: pedestrian (cổng đi bộ)
    ped_bundle = client.post(
        "/api/v2/capture-bundles",
        headers=admin_headers,
        json={
            "schema_version": "1.0",
            "encounter_id": "ENC-PED-REL-1",
            "access_point_id": "PED-TURNSTILE-01",
            "lane_id": "walk-01",
            "access_mode": "pedestrian",
            "calibration_version": "cal-ped-v1",
            "face_captured_at": now.isoformat(),
            "rfid_captured_at": now.isoformat(),
            "card_uid": "RFID-PED-REL-001",
        },
    )
    assert ped_bundle.status_code == 201
    ped_ver = client.post(
        "/api/v1/pedestrian-gates/entry/verifications",
        headers=admin_headers,
        json={
            "event_id": "EVT-PED-REL-001",
            "gate_id": "PED-TURNSTILE-01",
            "capture_bundle_id": ped_bundle.json()["capture_bundle_id"],
        },
    )
    assert ped_ver.status_code == 200
    assert ped_ver.json()["verification_status"] == "PASSED"
    assert ped_ver.json()["permit_granted"] is True
    assert ped_ver.json()["barrier_status"] == "OPENED"

    # 4. Task 11.7 Fail-Closed: gửi capture_bundle sai mode (pedestrian trên cổng xe) -> FAILED, permit_granted=False, không mở barrier
    fail_ver = client.post(
        "/api/v2/gates/entry/verifications",
        headers=admin_headers,
        json={
            "event_id": "EVT-FAIL-CLOSED-001",
            "gate_id": "GATE-VEH-01",
            "capture_bundle_id": ped_bundle.json()["capture_bundle_id"],
        },
    )
    assert fail_ver.status_code == 200
    fv = fail_ver.json()
    assert fv["verification_status"] == "FAILED"
    assert fv["permit_granted"] is False
    assert fv["barrier_status"] != "OPENED"

    # 5. Task 9.11 Đối chiếu Dashboard Analytics với nguồn dữ liệu thực tế (không bị cắt bởi limit=1)
    # Tổng sự kiện đã tạo: 4 sự kiện phương tiện (3 PASSED + 1 FAILED) + 1 sự kiện người đi bộ = 5 sự kiện
    page_limited = client.get("/api/v1/person-access-logs?limit=1", headers=admin_headers)
    assert page_limited.status_code == 200
    assert len(page_limited.json()["items"]) == 1

    from_iso = (now - timedelta(hours=2)).isoformat()
    to_iso = (now + timedelta(hours=2)).isoformat()
    dash_res = client.get(
        "/api/v1/analytics/dashboard",
        params={"from": from_iso, "to": to_iso, "timezone": "Asia/Bangkok", "granularity": "day"},
        headers=admin_headers,
    )
    assert dash_res.status_code == 200
    dash = dash_res.json()
    metrics_by_id = {m["metric_id"]: m for m in dash["metrics"]}
    assert metrics_by_id["vehicle_access_events"]["value"] == 4.0
    assert metrics_by_id["pedestrian_access_events"]["value"] == 1.0
    assert metrics_by_id["total_access_events"]["value"] == 5.0
    # 1 lượt FAILED trên tổng 5 lượt = 20.0%
    assert metrics_by_id["permit_denied_rate"]["value"] == 20.0

    breakdown_res = client.get(
        "/api/v1/analytics/metrics/total_access_events/breakdown",
        params={"from": from_iso, "to": to_iso, "timezone": "Asia/Bangkok"},
        headers=admin_headers,
    )
    assert breakdown_res.status_code == 200
    assert breakdown_res.json()["items"][0]["value"] == 5.0


def test_task_10_18_and_11_4_assistant_grounding_privacy_and_dashboard_resilience() -> None:
    """Task 10.18 & 11.4: Grounded Assistant E2E, chặn Restricted data 422, chống IDOR 403 và cô lập lỗi với Dashboard."""
    client, admin_headers, sec_headers, _, _ = _build_release_gate_env()
    now = datetime.now(UTC)
    from_iso = (now - timedelta(hours=4)).isoformat()
    to_iso = (now + timedelta(hours=1)).isoformat()

    # 1. Hard-block dữ liệu Restricted ngay trên direct API (Task 11.4)
    for forbidden_prompt in (
        "Tra cứu hộ tôi password=AdminSecret999",
        "Kiểm tra thẻ card_uid=9988776655",
        "Giải mã eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTYifQ.signature",
    ):
        blocked = client.post(
            "/api/v1/assistant/reports",
            headers={**admin_headers, "Idempotency-Key": f"blk-{uuid4()}"},
            json={
                "prompt": forbidden_prompt,
                "period": {"from": from_iso, "to": to_iso, "timezone": "Asia/Bangkok"},
                "filters": {},
                "template": "access-summary",
            },
        )
        assert blocked.status_code == 422
        assert blocked.json()["error"]["code"] == "PROMPT_PRIVACY_BLOCKED"

    # 2. Tạo báo cáo hợp lệ -> đọc SSE -> đọc chi tiết -> tải xuống
    create_rep = client.post(
        "/api/v1/assistant/reports",
        headers={**admin_headers, "Idempotency-Key": "rel-rep-valid-01"},
        json={
            "prompt": "Báo cáo tổng hợp lưu lượng và cảnh báo an ninh trong ca trực.",
            "period": {"from": from_iso, "to": to_iso, "timezone": "Asia/Bangkok"},
            "filters": {},
            "template": "access-summary",
        },
    )
    assert create_rep.status_code == 202
    rep = create_rep.json()
    report_id = rep["report_id"]
    snapshot_id = rep["result"]["snapshot_id"]
    assert snapshot_id is not None

    # Đọc danh sách báo cáo của chính chủ
    list_rep = client.get("/api/v1/assistant/reports", headers=admin_headers)
    assert list_rep.status_code == 200
    assert any(item["report_id"] == report_id for item in list_rep.json()["items"])

    # Đọc SSE events
    sse = client.get(f"/api/v1/assistant/reports/{report_id}/events", headers=admin_headers)
    assert sse.status_code == 200
    assert "COMPLETED" in sse.text

    # Tải xuống artifact JSON và kiểm chứng snapshot_id khớp
    dl = client.get(f"/api/v1/assistant/reports/{report_id}/download", headers=admin_headers)
    assert dl.status_code == 200
    dl_json = dl.json()
    assert dl_json["result"]["snapshot_id"] == snapshot_id

    # Chống IDOR: tài khoản khác (security.op) không đọc/tải/hủy được báo cáo của admin
    assert client.get(f"/api/v1/assistant/reports/{report_id}", headers=sec_headers).status_code == 403
    assert client.get(f"/api/v1/assistant/reports/{report_id}/download", headers=sec_headers).status_code == 403
    assert client.post(f"/api/v1/assistant/reports/{report_id}/cancel", headers=sec_headers).status_code == 403

    # 3. Hủy báo cáo (202 CANCELED) và xác nhận Analytics Dashboard vẫn hoạt động độc lập (200 OK)
    cancel_res = client.post(f"/api/v1/assistant/reports/{report_id}/cancel", headers=admin_headers)
    assert cancel_res.status_code == 202
    assert cancel_res.json()["status"] == "CANCELED"

    dash_after = client.get(
        "/api/v1/analytics/dashboard",
        params={"from": from_iso, "to": to_iso, "timezone": "Asia/Bangkok"},
        headers=admin_headers,
    )
    assert dash_after.status_code == 200


def test_task_11_8_11_9_11_10_health_rollback_revocation_and_secret_hygiene() -> None:
    """Task 11.8, 11.9 & 11.10: Health/API JSON routing, vô hiệu hóa user trên cả v2/v1, và quét rò rỉ bí mật."""
    client, admin_headers, sec_headers, fake_auth, settings = _build_release_gate_env()

    # 1. Task 11.8: /health/live, /health/ready, /api/v2/auth/me trả application/json chuẩn, không bị fallback SPA HTML
    for path, headers in (
        ("/health/live", {}),
        ("/health/ready", {}),
        ("/api/v2/auth/me", admin_headers),
    ):
        res = client.get(path, headers=headers)
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("application/json")
        assert "<!doctype html>" not in res.text.lower()

    # 2. Task 11.9: Khi vô hiệu hóa tài khoản (is_active=False), cả Bearer JWT v2 lẫn legacy session cookie v1 đều bị từ chối (401)
    users_list = client.get("/api/v1/admin/users", headers=admin_headers).json()["items"]
    sec_item = next(u for u in users_list if u["username"] == "security.op")
    sec_id = sec_item["id"]

    # Giả lập phiên legacy v1 đang tồn tại cho security.op
    legacy_cookie_val = "legacy-session-sec-01"
    fake_auth.legacy_sessions[legacy_cookie_val] = SimpleNamespace(
        id=sec_item["id"] if isinstance(sec_item["id"], type(uuid4())) else uuid4(),
        username="security.op",
        role=UserRole.SECURITY,
        role_id=system_role_id("SECURITY"),
    )
    # Gắn đúng UUID của security.op
    from uuid import UUID

    fake_auth.legacy_sessions[legacy_cookie_val].id = UUID(sec_id)

    # Admin vô hiệu hóa tài khoản security.op
    deact_res = client.patch(
        f"/api/v1/admin/users/{sec_id}/status",
        headers=admin_headers,
        json={
            "is_active": False,
            "expected_version": sec_item["version"],
            "reason": "Khóa tài khoản để kiểm thử rollback/revocation 11.9",
        },
    )
    assert deact_res.status_code == 200
    assert deact_res.json()["is_active"] is False

    # Gọi bằng JWT v2 bị từ chối 401
    v2_after_deact = client.get("/api/v2/auth/me", headers=sec_headers)
    assert v2_after_deact.status_code == 401

    # Gọi bằng legacy session cookie v1 cũng bị từ chối 401 (không sống lại quyền đã thu hồi)
    client.cookies.set(settings.session_cookie_name, legacy_cookie_val)
    v1_after_deact = client.get("/api/v1/vehicle-types")
    assert v1_after_deact.status_code == 401
    client.cookies.clear()

    # 3. Task 11.10: Tạo cấu hình camera có trường nhạy cảm và quét toàn bộ JSON trả về của Users, Device Settings, Audit Logs
    cam_Secret = "SuperSecretRtspPass!2026"
    cam_res = client.post(
        "/api/v1/admin/device-settings/cameras",
        headers=admin_headers,
        json={
            "name": "Camera Cổng Kiểm Thử 11.10",
            "access_point_ref": "GATE-VEH-01",
            "lane_ref": "lane-01",
            "direction": "ENTRY",
            "settings": {
                "purpose": "PLATE",
                "rtsp_password": cam_Secret,
                "api_secret": cam_Secret,
            },
            "reason": "Kiểm tra che dấu mật khẩu thiết bị",
        },
    )
    assert cam_res.status_code == 201

    for inspect_path in (
        "/api/v1/admin/users",
        "/api/v1/admin/device-settings/cameras",
        "/api/v1/admin/audit-logs",
        "/api/v1/admin/device-settings/audit-logs",
    ):
        resp = client.get(inspect_path, headers=admin_headers)
        assert resp.status_code == 200
        raw_text = json.dumps(resp.json())
        assert "password_hash" not in raw_text
        assert "refresh_token" not in raw_text
        assert PASSWORD not in raw_text
        assert cam_Secret not in raw_text


def test_crud_validations_and_legacy_session_compatibility():
    """Kiểm tra lọc user theo role code, chuẩn hóa chuỗi rỗng, lọc audit không phân biệt hoa thường và tương thích legacy session."""
    from uuid import UUID

    client, admin_headers, _, fake_auth, settings = _build_release_gate_env()

    # 1. Lọc users theo role=ADMIN
    by_role = client.get("/api/v1/admin/users?role=ADMIN", headers=admin_headers)
    assert by_role.status_code == 200
    items = by_role.json()["items"]
    assert len(items) == 1
    assert items[0]["role_code"] == "ADMIN"

    # 2. Chuẩn hóa chuỗi rỗng trên các trường tùy chọn khi tạo/sửa User & Role
    role_res = client.post(
        "/api/v1/admin/roles",
        headers=admin_headers,
        json={"code": "DISPATCH_QA", "name": "Điều phối QA", "description": "   "},
    )
    assert role_res.status_code == 201
    role_data = role_res.json()
    assert role_data["description"] is None

    role_patch = client.patch(
        f"/api/v1/admin/roles/{role_data['id']}",
        headers=admin_headers,
        json={"expected_version": role_data["version"], "reason": "Cập nhật mô tả rỗng", "description": ""},
    )
    assert role_patch.status_code == 200
    assert role_patch.json()["description"] is None

    user_res = client.post(
        "/api/v1/admin/users",
        headers=admin_headers,
        json={
            "username": "qa.empty.disp",
            "password": TEMP_PASSWORD,
            "role_id": str(system_role_id("WAREHOUSE")),
            "display_name": "",
        },
    )
    assert user_res.status_code == 201
    assert user_res.json()["display_name"] is None

    # 3. Lọc audit-logs theo target_type không phân biệt hoa thường (User vs user)
    audit_upper = client.get("/api/v1/admin/audit-logs?target_type=User", headers=admin_headers)
    audit_lower = client.get("/api/v1/admin/audit-logs?target_type=user", headers=admin_headers)
    assert audit_upper.status_code == 200
    assert audit_lower.status_code == 200
    assert len(audit_upper.json()["items"]) >= 1
    assert len(audit_upper.json()["items"]) == len(audit_lower.json()["items"])

    # 4. Tương thích ngược legacy session cookie trên /api/v1/admin/* và /api/v2/auth/ws-tickets
    admin_id = UUID(items[0]["id"])
    legacy_cookie = "legacy-admin-session-01"
    fake_auth.legacy_sessions[legacy_cookie] = SimpleNamespace(
        id=admin_id,
        username="admin",
        role=UserRole.ADMIN,
        role_id=system_role_id("ADMIN"),
        must_change_password=False,
        authz_version=1,
        session_version=1,
        permissions=None,
    )
    client.cookies.set(settings.session_cookie_name, legacy_cookie)
    legacy_users = client.get("/api/v1/admin/users")
    assert legacy_users.status_code == 200
    legacy_ws = client.post(
        "/api/v2/auth/ws-tickets",
        headers={"Origin": "http://testserver", "X-CSRF-Token": "legacy-csrf-ok"},
        json={"channel": "security.alerts"},
    )
    assert legacy_ws.status_code == 201
    client.cookies.clear()

    # 5. Gửi gói thu nhận CaptureBundle dạng rút gọn từ UI
    simple_bundle = client.post(
        "/api/v2/capture-bundles",
        headers=admin_headers,
        json={"gate_id": "GATE-VEH-01", "event_id": "EVT-SIMPLE-001", "card_uid": "RFID-SIMPLE-01"},
    )
    assert simple_bundle.status_code == 201
    assert simple_bundle.json()["access_point_id"] == "GATE-VEH-01"
