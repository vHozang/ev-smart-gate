from __future__ import annotations

from uuid import uuid4

import pytest

from smart_gate.application.cards import EmployeeCardService
from smart_gate.application.dto import (
    ChangeEmployeeCardStatusInput,
    IssueEmployeeCardInput,
    ReplaceEmployeeCardInput,
)
from smart_gate.domain.entities import Driver
from smart_gate.domain.enums import CardStatus, RecordStatus
from smart_gate.domain.exceptions import ConflictError, NotFoundError, SmartGateError
from tests.fakes import DriverRepositoryFake, EmployeeCardRepositoryFake, UnitOfWorkFake


def _driver(status: RecordStatus = RecordStatus.ACTIVE) -> Driver:
    return Driver("Tài xế", (1.0, 0.0), "test", status=status)


def _service(
    drivers: DriverRepositoryFake,
    cards: EmployeeCardRepositoryFake,
) -> EmployeeCardService:
    return EmployeeCardService(drivers, cards, UnitOfWorkFake())


async def test_issue_first_card_for_active_driver() -> None:
    driver = _driver()
    cards = EmployeeCardRepositoryFake()
    service = _service(DriverRepositoryFake(driver), cards)

    card = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34"))

    assert card.driver_id == driver.id
    assert card.status == CardStatus.ACTIVE
    assert card.card_uid_normalized == "AB1234"
    assert card.replaces_card_id is None
    assert card.replaced_by_card_id is None
    assert card.issued_at is not None
    assert card.updated_at is not None
    assert await cards.get_active_by_driver(driver.id) == card


async def test_issue_normalizes_uid_and_rejects_short_normalized_uid() -> None:
    driver = _driver()
    cards = EmployeeCardRepositoryFake()
    service = _service(DriverRepositoryFake(driver), cards)

    card = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid=" ab-12 34 "))
    assert card.card_uid_normalized == "AB1234"

    with pytest.raises(SmartGateError) as error:
        await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="--a-b--"))

    assert error.value.code == "CARD_UID_INVALID"


async def test_issue_rejects_missing_or_inactive_driver() -> None:
    inactive = _driver(RecordStatus.INACTIVE)
    cards = EmployeeCardRepositoryFake()
    service = _service(DriverRepositoryFake(inactive), cards)

    with pytest.raises(NotFoundError) as missing:
        await service.issue(IssueEmployeeCardInput(driver_id=uuid4(), card_uid="ab-12-34"))
    assert missing.value.code == "DRIVER_NOT_FOUND"

    with pytest.raises(NotFoundError) as blocked:
        await service.issue(IssueEmployeeCardInput(driver_id=inactive.id, card_uid="ab-12-34"))
    assert blocked.value.code == "DRIVER_NOT_FOUND"

    assert await cards.list_all() == []


async def test_duplicate_uid_is_rejected() -> None:
    first = _driver()
    second = _driver()
    cards = EmployeeCardRepositoryFake()
    service = _service(DriverRepositoryFake(first, second), cards)

    await service.issue(IssueEmployeeCardInput(driver_id=first.id, card_uid="ab-12-34"))

    with pytest.raises(ConflictError) as error:
        await service.issue(IssueEmployeeCardInput(driver_id=second.id, card_uid="AB:12:34"))

    assert error.value.code == "CARD_UID_ALREADY_EXISTS"
    assert len(await cards.list_all()) == 1


async def test_issue_over_active_card_atomically_marks_old_replaced_and_links_history() -> None:
    driver = _driver()
    cards = EmployeeCardRepositoryFake()
    service = _service(DriverRepositoryFake(driver), cards)

    old = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34"))
    replacement = await service.issue(
        IssueEmployeeCardInput(driver_id=driver.id, card_uid="cd-56-78")
    )

    assert replacement.status == CardStatus.ACTIVE
    assert replacement.replaces_card_id == old.id
    assert old.status == CardStatus.REPLACED
    assert old.replaced_by_card_id == replacement.id
    assert old.status_reason == "Cấp thẻ mới thay thẻ đang hoạt động"
    assert await cards.get_by_uid(old.card_uid_normalized) == old
    assert await cards.get_active_by_driver(driver.id) == replacement
    assert len(await cards.list_by_driver(driver.id)) == 2


async def test_replace_requires_the_selected_card_to_be_active() -> None:
    driver = _driver()
    cards = EmployeeCardRepositoryFake()
    service = _service(DriverRepositoryFake(driver), cards)

    old = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34"))
    replacement = await service.replace(
        old.id,
        ReplaceEmployeeCardInput(card_uid="cd-56-78", status_reason="Thẻ bị gãy"),
    )

    assert replacement.status == CardStatus.ACTIVE
    assert replacement.replaces_card_id == old.id
    assert old.status == CardStatus.REPLACED
    assert old.replaced_by_card_id == replacement.id
    assert old.status_reason == "Thẻ bị gãy"

    with pytest.raises(ConflictError) as stale:
        await service.replace(
            old.id,
            ReplaceEmployeeCardInput(card_uid="ef-90-12", status_reason="Thử lại thẻ cũ"),
        )
    assert stale.value.code == "CARD_STATUS_INVALID"

    with pytest.raises(NotFoundError) as missing:
        await service.replace(
            uuid4(),
            ReplaceEmployeeCardInput(card_uid="ef-90-12", status_reason="Không tồn tại"),
        )
    assert missing.value.code == "CARD_NOT_FOUND"


async def test_block_active_card_preserves_history() -> None:
    driver = _driver()
    cards = EmployeeCardRepositoryFake()
    service = _service(DriverRepositoryFake(driver), cards)

    card = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34"))
    blocked = await service.block(
        card.id, ChangeEmployeeCardStatusInput(status_reason="Nhân viên tạm nghỉ")
    )

    assert blocked.status == CardStatus.BLOCKED
    assert blocked.status_reason == "Nhân viên tạm nghỉ"
    assert blocked.id == card.id
    assert await cards.get_by_uid("AB1234") == blocked
    assert await cards.get_active_by_driver(driver.id) is None
    assert len(await cards.list_by_driver(driver.id)) == 1


async def test_report_lost_active_card_preserves_history() -> None:
    driver = _driver()
    cards = EmployeeCardRepositoryFake()
    service = _service(DriverRepositoryFake(driver), cards)

    card = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34"))
    lost = await service.report_lost(
        card.id, ChangeEmployeeCardStatusInput(status_reason="Tài xế báo mất thẻ")
    )

    assert lost.status == CardStatus.LOST
    assert lost.status_reason == "Tài xế báo mất thẻ"
    assert lost.id == card.id
    assert await cards.get_by_uid("AB1234") == lost
    assert await cards.get_active_by_driver(driver.id) is None
    assert len(await cards.list_by_driver(driver.id)) == 1


async def test_terminal_card_cannot_change_status_again() -> None:
    driver = _driver()
    cards = EmployeeCardRepositoryFake()
    service = _service(DriverRepositoryFake(driver), cards)

    card = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34"))
    await service.report_lost(card.id, ChangeEmployeeCardStatusInput(status_reason="Báo mất thẻ"))

    with pytest.raises(ConflictError) as blocking:
        await service.block(card.id, ChangeEmployeeCardStatusInput(status_reason="Chặn thêm"))
    assert blocking.value.code == "CARD_STATUS_INVALID"

    with pytest.raises(ConflictError) as again:
        await service.report_lost(card.id, ChangeEmployeeCardStatusInput(status_reason="Mất lần 2"))
    assert again.value.code == "CARD_STATUS_INVALID"

    with pytest.raises(NotFoundError) as missing:
        await service.block(uuid4(), ChangeEmployeeCardStatusInput(status_reason="Không tồn tại"))
    assert missing.value.code == "CARD_NOT_FOUND"


async def test_list_for_driver_is_newest_first() -> None:
    driver = _driver()
    other = _driver()
    cards = EmployeeCardRepositoryFake()
    service = _service(DriverRepositoryFake(driver, other), cards)

    first = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34"))
    second = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="cd-56-78"))
    third = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ef-90-12"))
    await service.issue(IssueEmployeeCardInput(driver_id=other.id, card_uid="99-88-77"))

    history = await service.list_for_driver(driver.id)

    assert [item.id for item in history] == [third.id, second.id, first.id]
    assert len(await service.list_all()) == 4
    assert await service.get(second.id) == second
