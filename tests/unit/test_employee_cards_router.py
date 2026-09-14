from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from smart_gate.application.cards import EmployeeCardService
from smart_gate.config import Settings
from smart_gate.domain.entities import Driver, User
from smart_gate.domain.enums import RecordStatus, UserRole
from smart_gate.main import create_app
from smart_gate.presentation.dependencies import current_user, get_container
from tests.fakes import DriverRepositoryFake, EmployeeCardRepositoryFake, UnitOfWorkFake


class _FakeContainer:
    def __init__(self, drivers: DriverRepositoryFake, cards: EmployeeCardRepositoryFake) -> None:
        self.drivers = drivers
        self.employee_cards = cards
        self.unit_of_work = UnitOfWorkFake()
        self.card_management = EmployeeCardService(
            self.drivers,
            self.employee_cards,
            self.unit_of_work,
        )


@pytest.fixture
def admin_user() -> User:
    return User(
        id=uuid4(),
        username="admin",
        password_hash="hash",
        role=UserRole.ADMIN,
    )


@pytest.fixture
def warehouse_user() -> User:
    return User(
        id=uuid4(),
        username="warehouse",
        password_hash="hash",
        role=UserRole.WAREHOUSE,
    )


@pytest.fixture
def active_driver() -> Driver:
    return Driver(
        id=uuid4(),
        full_name="Nguyễn Văn A",
        face_embedding=(1.0, 0.0),
        face_model="test",
        status=RecordStatus.ACTIVE,
    )


@pytest.fixture
def cards_repo() -> EmployeeCardRepositoryFake:
    return EmployeeCardRepositoryFake()


@pytest.fixture
def fake_container(active_driver: Driver, cards_repo: EmployeeCardRepositoryFake) -> _FakeContainer:
    return _FakeContainer(DriverRepositoryFake(active_driver), cards_repo)


@pytest.fixture
def app(fake_container: _FakeContainer, admin_user: User):
    application = create_app(Settings(_env_file=None, APP_ENV="test"))
    application.dependency_overrides[get_container] = lambda: fake_container
    application.dependency_overrides[current_user] = lambda: admin_user

    # Also bypass validate_csrf inside csrf_user dependency by overriding csrf_user or fake container auth
    from smart_gate.presentation.dependencies import csrf_user

    application.dependency_overrides[csrf_user] = lambda: admin_user
    return application


async def test_issue_employee_card_api(
    app, active_driver: Driver, cards_repo: EmployeeCardRepositoryFake
) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/employee-cards",
            json={
                "driver_id": str(active_driver.id),
                "card_uid": "04-A1-B2-C3",
                "metadata": {"department": "logistics"},
            },
        )

    assert response.status_code == 201
    body = response.json()
    assert body["driver_id"] == str(active_driver.id)
    assert body["status"] == "ACTIVE"
    assert body["card_uid_masked"] == "••••B2C3"
    assert "card_uid" not in body
    assert "card_uid_normalized" not in body
    assert body["metadata"] == {"department": "logistics"}
    assert len(cards_repo.items) == 1


async def test_list_and_get_employee_cards_api(
    app, active_driver: Driver, cards_repo: EmployeeCardRepositoryFake
) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Issue first card
        r1 = await client.post(
            "/api/v1/employee-cards",
            json={"driver_id": str(active_driver.id), "card_uid": "11-22-33-44"},
        )
        card_id = r1.json()["id"]

        # Get by id
        get_res = await client.get(f"/api/v1/employee-cards/{card_id}")
        assert get_res.status_code == 200
        assert get_res.json()["id"] == card_id
        assert get_res.json()["card_uid_masked"] == "••••3344"
        assert "card_uid" not in get_res.json()

        # List all
        list_res = await client.get("/api/v1/employee-cards")
        assert list_res.status_code == 200
        assert len(list_res.json()) == 1

        # List filtered by driver_id
        list_driver_res = await client.get(
            "/api/v1/employee-cards", params={"driver_id": str(active_driver.id)}
        )
        assert list_driver_res.status_code == 200
        assert len(list_driver_res.json()) == 1

        # List filtered by another driver_id
        empty_res = await client.get("/api/v1/employee-cards", params={"driver_id": str(uuid4())})
        assert empty_res.status_code == 200
        assert len(empty_res.json()) == 0


async def test_block_and_report_lost_api(
    app, active_driver: Driver, cards_repo: EmployeeCardRepositoryFake
) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r1 = await client.post(
            "/api/v1/employee-cards",
            json={"driver_id": str(active_driver.id), "card_uid": "11-22-33-44"},
        )
        card_id = r1.json()["id"]

        # Block card
        block_res = await client.post(
            f"/api/v1/employee-cards/{card_id}/block",
            json={"status_reason": "Tạm đình chỉ công tác"},
        )
        assert block_res.status_code == 200
        assert block_res.json()["status"] == "BLOCKED"
        assert block_res.json()["status_reason"] == "Tạm đình chỉ công tác"


async def test_report_lost_api(
    app, active_driver: Driver, cards_repo: EmployeeCardRepositoryFake
) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r1 = await client.post(
            "/api/v1/employee-cards",
            json={"driver_id": str(active_driver.id), "card_uid": "AA-BB-CC-DD"},
        )
        card_id = r1.json()["id"]

        # Report lost
        lost_res = await client.post(
            f"/api/v1/employee-cards/{card_id}/report-lost",
            json={"status_reason": "Đánh rơi thẻ tại cổng"},
        )
        assert lost_res.status_code == 200
        assert lost_res.json()["status"] == "LOST"
        assert lost_res.json()["status_reason"] == "Đánh rơi thẻ tại cổng"


async def test_replace_employee_card_api(
    app, active_driver: Driver, cards_repo: EmployeeCardRepositoryFake
) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r1 = await client.post(
            "/api/v1/employee-cards",
            json={"driver_id": str(active_driver.id), "card_uid": "11-11-11-11"},
        )
        old_card_id = r1.json()["id"]

        # Replace card
        replace_res = await client.post(
            f"/api/v1/employee-cards/{old_card_id}/replace",
            json={
                "card_uid": "22-22-22-22",
                "status_reason": "Thẻ cũ bị mờ chip",
            },
        )
        assert replace_res.status_code == 201
        new_card = replace_res.json()
        assert new_card["status"] == "ACTIVE"
        assert new_card["replaces_card_id"] == old_card_id
        assert new_card["status_reason"] is None
        assert new_card["card_uid_masked"] == "••••2222"
        assert "card_uid" not in new_card

        # Verify old card is REPLACED
        old_card_res = await client.get(f"/api/v1/employee-cards/{old_card_id}")
        assert old_card_res.json()["status"] == "REPLACED"
        assert old_card_res.json()["status_reason"] == "Thẻ cũ bị mờ chip"
        assert old_card_res.json()["replaced_by_card_id"] == new_card["id"]


async def test_role_permissions(
    fake_container: _FakeContainer, warehouse_user: User, active_driver: Driver
) -> None:
    application = create_app(Settings(_env_file=None, APP_ENV="test"))
    application.dependency_overrides[get_container] = lambda: fake_container
    application.dependency_overrides[current_user] = lambda: warehouse_user

    from smart_gate.presentation.dependencies import csrf_user

    application.dependency_overrides[csrf_user] = lambda: warehouse_user

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/employee-cards")
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "ROLE_DENIED"

        post_response = await client.post(
            "/api/v1/employee-cards",
            json={"driver_id": str(active_driver.id), "card_uid": "11-22-33-44"},
        )
        assert post_response.status_code == 403
        assert post_response.json()["error"]["code"] == "ROLE_DENIED"
