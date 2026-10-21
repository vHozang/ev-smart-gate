from __future__ import annotations

import os
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest

from smart_gate.config import Settings
from smart_gate.domain.entities import User
from smart_gate.domain.enums import UserRole
from smart_gate.infrastructure.database.client import MongoDatabase
from smart_gate.infrastructure.database.documents import UserDocument
from smart_gate.infrastructure.database.repositories import BeanieUserRepository
from smart_gate.infrastructure.security.crypto import PasswordService

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("RUN_HTTP_INTEGRATION") != "1", reason="Cần API/DB/storage test thật"
    ),
]


@pytest.mark.asyncio
async def test_real_http_roles_sessions_csrf_and_private_api_baseline() -> None:
    """Kiểm baseline hiện tại qua network; không mock API hoặc dùng dữ liệu thật."""
    database_name = os.environ["MONGODB_DATABASE"]
    if os.environ.get("APP_ENV") != "test" or not database_name.startswith("evsg_contract_test_"):
        pytest.fail("Không được seed tài khoản ở database ngoài môi trường contract test")
    settings = Settings(_env_file=None)
    database = MongoDatabase(settings)
    await database.connect()
    users = BeanieUserRepository()
    hasher = PasswordService()
    password = os.environ["TEST_OPERATOR_PASSWORD"]
    created = []
    try:
        for role in UserRole:
            user = await users.add(
                User(
                    username=f"contract-{role.value.lower()}-{uuid4().hex[:12]}",
                    password_hash=hasher.hash(password),
                    role=role,
                    created_at=datetime.now(UTC),
                )
            )
            created.append(user.id)
            async with httpx.AsyncClient(base_url=os.environ["TEST_API_URL"], timeout=15) as client:
                login = await client.post(
                    "/api/v1/auth/login", json={"username": user.username, "password": password}
                )
                assert login.status_code == 200
                principal = (await client.get("/api/v1/auth/me")).json()
                assert principal["role"] == role.value
                assert (await client.get("/api/v1/gate-logs")).status_code == 200
                cards = await client.get("/api/v1/employee-cards")
                assert cards.status_code == (200 if role == UserRole.ADMIN else 403)
                alerts = await client.get("/api/v1/security/alerts")
                assert alerts.status_code == (403 if role == UserRole.WAREHOUSE else 200)
                assert (await client.post("/api/v1/auth/logout")).status_code == 403
                csrf = login.json()["csrf_token"]
                assert (
                    await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})
                ).status_code == 200
                assert (await client.get("/api/v1/auth/me")).status_code == 401
    finally:
        for user_id in created:
            document = await UserDocument.get(user_id)
            if document is not None:
                await document.delete()
        await database.close()
