from __future__ import annotations

import asyncio
import base64
import json
import os
import signal
import socket
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from pymongo import AsyncMongoClient
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

pytestmark = [
    pytest.mark.integration,
    pytest.mark.asyncio,
    pytest.mark.skipif(
        os.getenv("RUN_HTTP_INTEGRATION") != "1" or os.name != "posix",
        reason="Cần Linux process workers và API/Mongo/MinIO test thật",
    ),
]


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def server():
    if os.getenv("APP_ENV") != "test":
        pytest.fail("Chỉ chạy trên môi trường test")
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    db_name = f"evsg_contract_test_http_{uuid4().hex}"
    key = Ed25519PrivateKey.generate()
    env = dict(os.environ)
    env.update(
        {
            "OPERATOR_AUTH_ENABLED": "true",
            "MONGODB_DATABASE": db_name,
            "AUTH_ISSUER": "http://operator.test.invalid",
            "AUTH_KEY_ID": "operator-test-v1",
            "AUTH_PRIVATE_KEY": base64.urlsafe_b64encode(
                key.private_bytes(
                    serialization.Encoding.Raw,
                    serialization.PrivateFormat.Raw,
                    serialization.NoEncryption(),
                )
            ).decode(),
            "AUTH_PUBLIC_KEY": base64.urlsafe_b64encode(
                key.public_key().public_bytes(
                    serialization.Encoding.Raw, serialization.PublicFormat.Raw
                )
            ).decode(),
            "AUTH_PEPPER": base64.urlsafe_b64encode(os.urandom(32)).decode(),
            "AUTH_LOGIN_ACCOUNT_LIMIT": "1000",
            "AUTH_LOGIN_CLIENT_LIMIT": "1000",
            "APP_PUBLIC_ORIGIN": url,
        }
    )
    evidence = Path("/evidence")
    evidence.mkdir(exist_ok=True)
    with (evidence / "operator-auth-server.log").open("w") as logs:
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "smart_gate.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
                "--workers",
                "2",
                "--no-access-log",
                "--no-proxy-headers",
                "--log-level",
                "warning",
            ],
            env=env,
            stdout=logs,
            stderr=logs,
            start_new_session=True,
        )
        try:
            async with httpx.AsyncClient(base_url=url, timeout=1) as client:
                for _ in range(250):
                    try:
                        if (await client.get("/health/ready")).status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                    if process.poll() is not None:
                        pytest.fail("Auth API process không khởi động; xem private server log")
                    await asyncio.sleep(0.1)
                else:
                    pytest.fail("Auth API chưa healthy trong thời gian cho phép")
            state = {
                "url": url,
                "password": os.environ["TEST_OPERATOR_PASSWORD"],
                "username": os.environ["ADMIN_USERNAME"],
                "db_name": db_name,
            }
            yield state
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=5)
            assert db_name.startswith("evsg_contract_test_http_")
            client = AsyncMongoClient(os.environ["MONGODB_URI"], uuidRepresentation="standard")
            await client.drop_database(db_name)
            await client.close()


async def sign_in(client, server):
    return await client.post(
        "/api/v2/auth/login",
        headers={"Origin": server["url"]},
        json={"username": server["username"], "password": server["password"]},
    )


async def test_real_two_worker_bootstrap_and_forced_change_password(server):
    async with httpx.AsyncClient(base_url=server["url"], timeout=15) as client:
        response = await sign_in(client, server)
        assert response.status_code == 200
        data = response.json()
        assert data["principal"]["must_change_password"]
        assert data["principal"]["permissions"] == []
        assert "refresh_token" not in data and "csrf_token" not in data
        cookie_headers = response.headers.get_list("set-cookie")
        refresh = next(x for x in cookie_headers if x.startswith("evsg_refresh="))
        assert (
            "HttpOnly" in refresh
            and "Path=/api/v2/auth" in refresh
            and "SameSite=strict" in refresh
        )
        assert response.headers["cache-control"] == "no-store"
        assert "x-request-id" in response.headers
        bearer = {"Authorization": f"Bearer {data['access_token']}"}
        assert (await client.get("/api/v2/auth/me", headers=bearer)).status_code == 200
        assert (await client.get("/api/v1/gate-logs", headers=bearer)).status_code == 403
        new_password = "synthetic-http-password-after-change"
        changed = await client.post(
            "/api/v2/auth/change-password",
            headers={**bearer, "Origin": server["url"]},
            json={"current_password": server["password"], "new_password": new_password},
        )
        assert changed.status_code == 200
        server["password"] = new_password
        assert not changed.json()["principal"]["must_change_password"]
        assert "users:manage-admin" in changed.json()["principal"]["permissions"]
        assert (await client.get("/api/v2/auth/me", headers=bearer)).status_code == 401


async def test_real_origin_csrf_rotation_and_cookie_logout(server):
    async with httpx.AsyncClient(base_url=server["url"], timeout=15) as client:
        denied = await client.post(
            "/api/v2/auth/login",
            headers={"Origin": "https://untrusted.invalid"},
            json={"username": server["username"], "password": server["password"]},
        )
        assert denied.status_code == 403
        assert not denied.headers.get_list("set-cookie")
        signed = await sign_in(client, server)
        old_cookie = client.cookies.get("evsg_refresh")
        csrf = client.cookies.get("evsg_auth_csrf")
        no_csrf = await client.post("/api/v2/auth/refresh", headers={"Origin": server["url"]})
        assert no_csrf.status_code == 403 and no_csrf.json()["error"]["code"] == "CSRF_REQUIRED"
        refreshed = await client.post(
            "/api/v2/auth/refresh", headers={"Origin": server["url"], "X-CSRF-Token": csrf}
        )
        assert refreshed.status_code == 200
        assert client.cookies.get("evsg_refresh") != old_cookie
        logged_out = await client.post(
            "/api/v2/auth/logout", headers={"Origin": server["url"], "X-CSRF-Token": csrf}
        )
        assert logged_out.status_code == 200
        assert not client.cookies.get("evsg_refresh") and not client.cookies.get("evsg_auth_csrf")
        assert (
            await client.get(
                "/api/v2/auth/me",
                headers={"Authorization": f"Bearer {signed.json()['access_token']}"},
            )
        ).status_code == 401


async def test_real_refresh_race_has_one_success_and_no_cookie_on_conflict(server):
    async with httpx.AsyncClient(base_url=server["url"], timeout=15) as client:
        assert (await sign_in(client, server)).status_code == 200
        refresh, csrf = client.cookies.get("evsg_refresh"), client.cookies.get("evsg_auth_csrf")
        cookie = f"evsg_refresh={refresh}; evsg_auth_csrf={csrf}"

        async def refresh_once():
            async with httpx.AsyncClient(base_url=server["url"], timeout=15) as other:
                return await other.post(
                    "/api/v2/auth/refresh",
                    headers={"Origin": server["url"], "X-CSRF-Token": csrf, "Cookie": cookie},
                )

        responses = await asyncio.gather(refresh_once(), refresh_once())
        assert sorted(r.status_code for r in responses) == [200, 409]
        conflict = next(r for r in responses if r.status_code == 409)
        assert conflict.json()["error"]["code"] == "REFRESH_IN_PROGRESS"
        assert not conflict.headers.get_list("set-cookie")
        assert conflict.headers["cache-control"] == "no-store"


async def test_real_openapi_and_validation_do_not_publish_planned_features(server):
    async with httpx.AsyncClient(base_url=server["url"], timeout=15) as client:
        schema = (await client.get("/openapi.json")).json()
        paths = schema["paths"]
        assert len([method for path in paths.values() for method in path]) == 103
        assert (
            "/api/v1/admin/users" in paths
            and "/api/v2/auth/ws-tickets" in paths
            and "/api/v2/security/alerts" in paths
        )
        assert paths["/api/v2/auth/refresh"]["post"]["security"] == [
            {"RefreshCookie": [], "AuthCsrf": []}
        ]
        Path("/evidence/operator-auth.runtime.openapi.json").write_text(
            json.dumps(schema, indent=2), encoding="utf-8"
        )
        invalid = await client.post(
            "/api/v2/auth/login",
            headers={"Origin": server["url"]},
            json={"username": "test", "password": "sensitive-test-value", "permissions": ["*"]},
        )
        assert invalid.status_code == 422
        assert "sensitive-test-value" not in invalid.text
        assert "input" not in invalid.json()["error"]["details"]["errors"][0]
        assert invalid.headers["cache-control"] == "no-store"
        assert (await client.get("/api/v2/auth/me")).status_code == 401


async def test_real_bearer_permissions_and_legacy_ws_revoke(server):
    async with httpx.AsyncClient(base_url=server["url"], timeout=15) as client:
        signed = await sign_in(client, server)
        assert signed.status_code == 200
        bearer = {"Authorization": f"Bearer {signed.json()['access_token']}"}
        assert (await client.get("/api/v1/employee-cards", headers=bearer)).status_code == 200
        assert (await client.get("/api/v1/auth/me", headers=bearer)).status_code == 401
        legacy = await client.post(
            "/api/v1/auth/login",
            json={"username": server["username"], "password": server["password"]},
        )
        assert legacy.status_code == 200
        cookie = f"smart_gate_session={client.cookies.get('smart_gate_session')}"
        ws_url = server["url"].replace("http://", "ws://") + "/ws/v1/security/alerts"
        async with connect(
            ws_url, origin=server["url"], additional_headers={"Cookie": cookie}
        ) as socket:
            await socket.send(json.dumps({"type": "ping"}))
            assert json.loads(await socket.recv()) == {"type": "pong"}
            new_password = "synthetic-http-password-final-change"
            changed = await client.post(
                "/api/v2/auth/change-password",
                headers={**bearer, "Origin": server["url"]},
                json={"current_password": server["password"], "new_password": new_password},
            )
            assert changed.status_code == 200
            server["password"] = new_password
            with pytest.raises(ConnectionClosed) as error:
                await asyncio.wait_for(socket.recv(), 5)
            assert error.value.rcvd.code == 4401
