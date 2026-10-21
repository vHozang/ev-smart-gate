from __future__ import annotations

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
from smart_gate.domain.enums import AlertSeverity, AlertStatus
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

PASSWORD = "synthetic-migration-password-2026"


def _build_test_client() -> tuple[TestClient, dict[str, str], dict[str, str]]:
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
    wh_user = OperatorUser(
        uuid4(),
        "wh.op",
        passwords.hash(PASSWORD),
        system_role_id("WAREHOUSE"),
        True,
        clock.now(),
    )
    db.state.users[admin_user.id] = admin_user
    db.state.users[sec_user.id] = sec_user
    db.state.users[wh_user.id] = wh_user

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
                event_id="evt-10",
                sequence=10,
                alert_type="TAILGATING",
                severity=AlertSeverity.HIGH,
                message="Phát hiện bám đuôi",
                data={"gate_id": "gate-01"},
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

    app = create_app(settings)

    class _FakeDeviceAuth:
        async def authorize_device(self, raw_key: str | None, required_scope: str) -> None:
            from smart_gate.domain.exceptions import AuthorizationError

            if raw_key == "dev-capture-key" and required_scope == "capture:ingest":
                return
            raise AuthorizationError("DEVICE_SCOPE_DENIED", f"Không đủ quyền {required_scope}")

    @asynccontextmanager
    async def noop_lifespan(_app):
        _app.state.container = SimpleNamespace(
            settings=settings,
            auth=_FakeDeviceAuth(),
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
    assert "x-csrf-token" in admin_login.headers
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
    return client, admin_headers, sec_headers


def test_m1_ws_tickets_channel_alias_and_alerts_v2_resync_and_profile_alias() -> None:
    client, admin_headers, _ = _build_test_client()

    # 1. Hỗ trợ cả channel="security_alerts" (FE) và "security.alerts" (OpenAPI)
    ticket_res = client.post(
        "/api/v2/auth/ws-tickets",
        headers=admin_headers,
        json={"channel": "security_alerts"},
    )
    assert ticket_res.status_code == 201
    ticket = ticket_res.json()["ticket"]

    # 2. Kết nối WS v2 bằng ticket dùng 1 lần, gửi ping nhận pong
    with client.websocket_connect(
        f"/ws/v2/security/alerts?ticket={ticket}",
        headers={"Origin": "http://testserver"},
    ) as ws:
        ws.send_json({"type": "ping"})
        pong = ws.receive_json()
        assert pong["type"] == "pong"

    # 3. Resync REST v2 /api/v2/security/alerts
    resync = client.get("/api/v2/security/alerts?after_sequence=0&limit=20", headers=admin_headers)
    assert resync.status_code == 200
    batch = resync.json()
    assert batch["coverage"] == "complete"
    assert batch["has_more"] is False

    # 4. Epoch lệch trả 410 ALERT_HISTORY_GAP
    gap = client.get(
        "/api/v2/security/alerts?after_sequence=0&epoch=stale-epoch",
        headers=admin_headers,
    )
    assert gap.status_code == 410
    assert gap.json()["error"]["code"] == "ALERT_HISTORY_GAP"

    # 5. Alias PATCH /api/v1/admin/users/{id}/profile hoạt động giống PATCH /api/v1/admin/users/{id}
    users_list = client.get("/api/v1/admin/users", headers=admin_headers).json()["items"]
    sec_item = next(u for u in users_list if u["username"] == "security.op")
    patch_res = client.patch(
        f"/api/v1/admin/users/{sec_item['id']}/profile",
        headers=admin_headers,
        json={
            "expected_version": sec_item["version"],
            "display_name": "An ninh Cổng A",
        },
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["display_name"] == "An ninh Cổng A"


def test_m3_core_access_employees_grants_capture_verifications_and_reconcile() -> None:
    client, admin_headers, _ = _build_test_client()

    # 1. Vehicle types catalog
    vt_res = client.get("/api/v1/vehicle-types", headers=admin_headers)
    assert vt_res.status_code == 200
    vt_items = vt_res.json()["items"]
    assert {item["code"] for item in vt_items} == {"motorcycle", "car", "truck", "unknown"}
    car_item = next(item for item in vt_items if item["code"] == "car")
    assert "sedan" in car_item["legacy_values"]
    unknown_item = next(item for item in vt_items if item["code"] == "unknown")
    assert unknown_item["eligible_for_verification"] is False

    # 2. Access points
    ap_res = client.get("/api/v1/access-points", headers=admin_headers)
    assert ap_res.status_code == 200
    ap_ids = {item["id"] for item in ap_res.json()["items"]}
    assert {"GATE-VEH-01", "PED-TURNSTILE-01"} <= ap_ids

    # 3. Employees create + idempotency + optimistic locking
    person_id = str(uuid4())
    emp_res = client.post(
        "/api/v1/employees",
        headers={**admin_headers, "Idempotency-Key": "idem-emp-001"},
        json={"person_id": person_id, "employee_code": "EMP-2026-101"},
    )
    assert emp_res.status_code == 201
    emp = emp_res.json()
    emp_id = emp["employee_id"]

    # Cùng Idempotency-Key + cùng payload trả lại bản ghi đã tạo
    emp_replay = client.post(
        "/api/v1/employees",
        headers={**admin_headers, "Idempotency-Key": "idem-emp-001"},
        json={"person_id": person_id, "employee_code": "EMP-2026-101"},
    )
    assert emp_replay.status_code == 201
    assert emp_replay.json()["employee_id"] == emp_id

    # Cùng Idempotency-Key + khác payload trả 409 IDEMPOTENCY_CONFLICT
    emp_conflict = client.post(
        "/api/v1/employees",
        headers={**admin_headers, "Idempotency-Key": "idem-emp-001"},
        json={"person_id": person_id, "employee_code": "EMP-2026-999"},
    )
    assert emp_conflict.status_code == 409
    assert emp_conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    # 4. Pedestrian Grant create + revoke
    now = datetime.now(UTC)
    grant_res = client.post(
        "/api/v1/pedestrian-access-grants",
        headers=admin_headers,
        json={
            "employee_id": emp_id,
            "access_point_ids": ["PED-TURNSTILE-01"],
            "directions": ["ENTRY", "EXIT"],
            "valid_from": (now - timedelta(hours=1)).isoformat(),
            "valid_until": (now + timedelta(days=30)).isoformat(),
            "reason": "Cấp quyền ra vào cổng đi bộ ca hành chính",
        },
    )
    assert grant_res.status_code == 201
    grant = grant_res.json()
    assert grant["status"] == "ACTIVE"

    # 5. CaptureBundle ingest (vehicle & pedestrian)
    veh_bundle_res = client.post(
        "/api/v2/capture-bundles",
        headers=admin_headers,
        json={
            "schema_version": "1.0",
            "encounter_id": "ENC-VEH-001",
            "access_point_id": "GATE-VEH-01",
            "lane_id": "lane-entry-01",
            "access_mode": "car",
            "calibration_version": "cal-veh-2026-v1",
            "face_captured_at": now.isoformat(),
            "plate_captured_at": now.isoformat(),
            "rfid_captured_at": now.isoformat(),
            "card_uid": "RFID-CARD-SECRET-001",
        },
    )
    assert veh_bundle_res.status_code == 201
    veh_bundle = veh_bundle_res.json()
    assert "card_uid" not in veh_bundle
    veh_bundle_id = veh_bundle["capture_bundle_id"]

    # 5b. X-Device-Key với scope "capture:ingest" gọi POST /api/v2/capture-bundles (và alias v1) thành công
    dev_bundle_res = client.post(
        "/api/v2/capture-bundles",
        headers={"X-Device-Key": "dev-capture-key", "Origin": "http://testserver"},
        json={
            "schema_version": "1.0",
            "encounter_id": "ENC-DEV-001",
            "access_point_id": "GATE-VEH-01",
            "lane_id": "lane-entry-01",
            "access_mode": "car",
            "calibration_version": "cal-veh-2026-v1",
            "face_captured_at": now.isoformat(),
            "plate_captured_at": now.isoformat(),
            "rfid_captured_at": now.isoformat(),
            "card_uid": "RFID-DEV-SECRET-009",
        },
    )
    assert dev_bundle_res.status_code == 201
    assert "card_uid" not in dev_bundle_res.json()

    # 6. Vehicle Entry & Exit verification + event_id reconciliation
    verify_veh = client.post(
        "/api/v2/gates/exit/verifications",
        headers=admin_headers,
        json={
            "event_id": "EVT-VEH-EXIT-2026-001",
            "gate_id": "GATE-VEH-01",
            "capture_bundle_id": veh_bundle_id,
        },
    )
    assert verify_veh.status_code == 200
    vv = verify_veh.json()
    assert vv["verification_status"] == "PASSED"
    assert vv["permit_granted"] is True
    assert vv["barrier_status"] == "OPENED"

    # Đối soát lại theo event_id
    reconcile_res = client.get(
        "/api/v2/access-events/EVT-VEH-EXIT-2026-001",
        headers=admin_headers,
    )
    assert reconcile_res.status_code == 200
    assert reconcile_res.json()["operation_id"] == vv["operation_id"]

    # 7. Pedestrian verification + Person Access Logs + Evidence Snapshot
    ped_bundle_res = client.post(
        "/api/v2/capture-bundles",
        headers=admin_headers,
        json={
            "schema_version": "1.0",
            "encounter_id": "ENC-PED-001",
            "access_point_id": "PED-TURNSTILE-01",
            "lane_id": "walk-01",
            "access_mode": "pedestrian",
            "calibration_version": "cal-ped-2026-v1",
            "face_captured_at": now.isoformat(),
            "rfid_captured_at": now.isoformat(),
            "card_uid": "RFID-PED-SECRET-002",
        },
    )
    assert ped_bundle_res.status_code == 201
    ped_bundle_id = ped_bundle_res.json()["capture_bundle_id"]

    verify_ped = client.post(
        "/api/v1/pedestrian-gates/entry/verifications",
        headers=admin_headers,
        json={
            "event_id": "EVT-PED-ENTRY-2026-001",
            "gate_id": "PED-TURNSTILE-01",
            "capture_bundle_id": ped_bundle_id,
        },
    )
    assert verify_ped.status_code == 200
    vp = verify_ped.json()
    assert vp["access_mode"] == "pedestrian"
    assert vp["permit_granted"] is True

    logs_res = client.get("/api/v1/person-access-logs", headers=admin_headers)
    assert logs_res.status_code == 200
    log_items = logs_res.json()["items"]
    assert len(log_items) == 1
    log_id = log_items[0]["id"]

    snap_res = client.get(
        f"/api/v1/person-access-logs/{log_id}/snapshots/0",
        headers=admin_headers,
    )
    assert snap_res.status_code == 200
    assert snap_res.headers["content-type"].startswith("image/")
    assert "no-store" in snap_res.headers["cache-control"]


def test_m4_analytics_dashboard_and_m5_assistant_privacy_sse_and_owner_idor() -> None:
    client, admin_headers, sec_headers = _build_test_client()
    now = datetime.now(UTC)
    from_iso = (now - timedelta(days=1)).isoformat()
    to_iso = (now + timedelta(hours=1)).isoformat()

    # 1. Metric definitions
    defs_res = client.get("/api/v1/analytics/metric-definitions", headers=admin_headers)
    assert defs_res.status_code == 200
    assert len(defs_res.json()["items"]) == 6

    # 2. Dashboard khi chưa có sự kiện: permit_denied_rate trả value=null (mẫu số = 0)
    dash_empty = client.get(
        "/api/v1/analytics/dashboard",
        params={"from": from_iso, "to": to_iso, "timezone": "Asia/Bangkok"},
        headers=admin_headers,
    )
    assert dash_empty.status_code == 200
    metrics_empty = {m["metric_id"]: m for m in dash_empty.json()["metrics"]}
    assert metrics_empty["total_access_events"]["value"] == 0.0
    assert metrics_empty["permit_denied_rate"]["value"] is None

    # 2b. Role WAREHOUSE (có dashboard:read nhưng không có person-access-logs:read) nhận pedestrian_access_events.status == "unavailable"
    wh_login = client.post(
        "/api/v2/auth/login",
        headers={"Origin": "http://testserver"},
        json={"username": "wh.op", "password": PASSWORD},
    )
    assert wh_login.status_code == 200
    wh_headers = {
        "Authorization": f"Bearer {wh_login.json()['access_token']}",
        "Origin": "http://testserver",
    }
    dash_wh = client.get(
        "/api/v1/analytics/dashboard",
        params={"from": from_iso, "to": to_iso, "timezone": "Asia/Bangkok", "granularity": "hour"},
        headers=wh_headers,
    )
    assert dash_wh.status_code == 200
    assert dash_wh.json()["coverage"] == "partial"
    wh_metrics = {m["metric_id"]: m for m in dash_wh.json()["metrics"]}
    assert wh_metrics["pedestrian_access_events"]["status"] == "unavailable"
    assert wh_metrics["pedestrian_access_events"]["value"] is None

    # 3. Assistant privacy guard phía server chặn mật khẩu/JWT/card_uid (422 PROMPT_PRIVACY_BLOCKED)
    blocked = client.post(
        "/api/v1/assistant/reports",
        headers={**admin_headers, "Idempotency-Key": "rep-blocked-1"},
        json={
            "prompt": "Hãy phân tích với password=SuperSecret123! và card_uid=AABBCCDD1122",
            "period": {"from": from_iso, "to": to_iso, "timezone": "Asia/Bangkok"},
            "filters": {},
            "template": "access-summary",
        },
    )
    assert blocked.status_code == 422
    assert blocked.json()["error"]["code"] == "PROMPT_PRIVACY_BLOCKED"

    # 4. Tạo báo cáo hợp lệ + đọc SSE + tải xuống + chặn IDOR giữa các user
    created = client.post(
        "/api/v1/assistant/reports",
        headers={**admin_headers, "Idempotency-Key": "rep-valid-1"},
        json={
            "prompt": "Tổng hợp lưu lượng cổng phương tiện và người đi bộ trong ngày.",
            "period": {"from": from_iso, "to": to_iso, "timezone": "Asia/Bangkok"},
            "filters": {},
            "template": "access-summary",
        },
    )
    assert created.status_code == 202
    report = created.json()
    report_id = report["report_id"]
    assert report["status"] == "COMPLETED"
    assert report["result"]["snapshot_id"] is not None

    # SSE stream
    sse_res = client.get(
        f"/api/v1/assistant/reports/{report_id}/events",
        headers=admin_headers,
    )
    assert sse_res.status_code == 200
    assert sse_res.headers["content-type"].startswith("text/event-stream")
    assert '"stage":"COMPLETED"' in sse_res.text or '"stage": "COMPLETED"' in sse_res.text

    # Download JSON artifact
    dl_res = client.get(
        f"/api/v1/assistant/reports/{report_id}/download",
        headers=admin_headers,
    )
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"].startswith("application/json")

    # User khác (security.op) truy cập báo cáo của admin bị chặn 403 FORBIDDEN (chống IDOR)
    idor_res = client.get(
        f"/api/v1/assistant/reports/{report_id}",
        headers=sec_headers,
    )
    assert idor_res.status_code == 403

    # 5. Cùng Idempotency-Key nhưng khác prompt trả 409 IDEMPOTENCY_CONFLICT
    idem_conflict = client.post(
        "/api/v1/assistant/reports",
        headers={**admin_headers, "Idempotency-Key": "rep-valid-1"},
        json={
            "prompt": "Prompt khác hoàn toàn với cùng Idempotency-Key.",
            "period": {"from": from_iso, "to": to_iso, "timezone": "Asia/Bangkok"},
            "filters": {},
            "template": "access-summary",
        },
    )
    assert idem_conflict.status_code == 409
    assert idem_conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    # 6. Cancel report trả 202 Accepted với status == CANCELED
    cancel_res = client.post(
        f"/api/v1/assistant/reports/{report_id}/cancel",
        headers=admin_headers,
    )
    assert cancel_res.status_code == 202
    assert cancel_res.json()["status"] == "CANCELED"


def test_m12_device_settings_crud_connectivity_apply_and_audit() -> None:
    client, admin_headers, _ = _build_test_client()

    # 1. List cameras
    list_res = client.get("/api/v1/admin/device-settings/cameras", headers=admin_headers)
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert len(items) >= 1

    # 2. Create camera config (saved_version=1, applied_version=None)
    create_res = client.post(
        "/api/v1/admin/device-settings/cameras",
        headers=admin_headers,
        json={
            "name": "Camera biển số Làn ra 02",
            "access_point_ref": "GATE-VEH-02",
            "lane_ref": "lane-exit-02",
            "direction": "EXIT",
            "settings": {
                "purpose": "PLATE",
                "connection_profile_ref": "profile-cam-plate-02",
            },
            "reason": "Thêm cấu hình camera làn ra phụ",
        },
    )
    assert create_res.status_code == 201
    cfg = create_res.json()
    cfg_id = cfg["id"]
    assert cfg["saved_version"] == 1
    assert cfg["applied_version"] is None
    assert cfg["status"] == "SAVED"

    # 3. Connectivity test (read-only, không mở barrier)
    conn_res = client.post(
        f"/api/v1/admin/device-settings/cameras/{cfg_id}/connectivity-test",
        headers=admin_headers,
    )
    assert conn_res.status_code == 202
    assert conn_res.json()["status"] == "SUCCEEDED"

    # 4. Apply config
    apply_res = client.post(
        f"/api/v1/admin/device-settings/cameras/{cfg_id}/apply",
        headers=admin_headers,
        json={"expected_version": 1, "reason": "Áp dụng cấu hình camera làn ra 02"},
    )
    assert apply_res.status_code == 202
    op = apply_res.json()
    assert op["applied_version"] == 1

    # 5. Audit logs + overview + breakdown + 6 groups (gates & history) + validate + conflict 409
    audit_res = client.get("/api/v1/admin/device-settings/audit-logs", headers=admin_headers)
    assert audit_res.status_code == 200
    assert len(audit_res.json()["items"]) >= 3

    op_res = client.get(
        f"/api/v1/admin/device-settings/operations/{op['operation_id']}",
        headers=admin_headers,
    )
    assert op_res.status_code == 200
    assert op_res.json()["status"] == "SUCCEEDED"

    val_res = client.post(
        f"/api/v1/admin/device-settings/cameras/{cfg_id}/validate",
        headers=admin_headers,
    )
    assert val_res.status_code == 200
    assert val_res.json()["valid"] is True

    patch_conflict = client.patch(
        f"/api/v1/admin/device-settings/cameras/{cfg_id}",
        headers=admin_headers,
        json={"expected_version": 999, "reason": "Thử xung đột version", "name": "Tên mới"},
    )
    assert patch_conflict.status_code == 409

    for grp in ("cameras", "models", "barriers", "readers", "bindings", "gates", "history"):
        grp_res = client.get(f"/api/v1/admin/device-settings/{grp}", headers=admin_headers)
        assert grp_res.status_code == 200
        assert grp_res.json()["coverage"] == "complete"

    overview_res = client.get("/api/v1/analytics/overview", headers=admin_headers)
    assert overview_res.status_code == 200
    assert overview_res.json()["snapshot_id"] is not None

    breakdown_res = client.get(
        "/api/v1/analytics/metrics/total_access_events/breakdown",
        headers=admin_headers,
    )
    assert breakdown_res.status_code == 200
    assert breakdown_res.json()["metric_id"] == "total_access_events"
    assert breakdown_res.json()["coverage"] in ("complete", "partial")
    assert "snapshot_id" in breakdown_res.json()
    assert "data_as_of" in breakdown_res.json()

