from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

import pytest

from smart_gate.application.cards import EmployeeCardService
from smart_gate.application.dto import (
    ChangeEmployeeCardStatusInput,
    IssueEmployeeCardInput,
    ReplaceEmployeeCardInput,
)
from smart_gate.domain.entities import Driver, EmployeeCard
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


async def _assert_replacement_contract(
    cards: EmployeeCardRepositoryFake,
    driver: Driver,
    old: EmployeeCard,
    replacement: EmployeeCard,
    *,
    retirement_reason: str,
) -> None:
    """Hợp đồng bắt buộc của `EmployeeCardRepository.replace_active`.

    Dùng chung cho `issue` và `replace` để một repository liên kết sai chiều,
    quên chuyển thẻ cũ sang REPLACED, hoặc gán lý do vào thẻ mới đều bị phát hiện.
    """

    assert replacement.status == CardStatus.ACTIVE
    assert replacement.replaces_card_id == old.id
    assert replacement.replaced_by_card_id is None
    # Lý do thu hồi thuộc về thẻ cũ; thẻ ACTIVE mới không mang lý do.
    assert replacement.status_reason is None

    assert old.status == CardStatus.REPLACED
    assert old.replaced_by_card_id == replacement.id
    assert old.replaces_card_id != replacement.id
    assert old.status_reason == retirement_reason
    assert old.updated_at is not None

    # Liên kết phải là hai chiều và trỏ đúng cặp thẻ.
    assert old.id != replacement.id
    assert replacement.replaces_card_id != replacement.id
    assert old.replaced_by_card_id != old.id

    # Lịch sử được giữ lại và chỉ thẻ mới còn hoạt động.
    assert await cards.get_by_uid(old.card_uid_normalized) == old
    assert await cards.get_by_uid(replacement.card_uid_normalized) == replacement
    assert await cards.get_active_by_driver(driver.id) == replacement
    assert len(await cards.list_by_driver(driver.id)) == 2


class _NonLinkingRepositoryFake(EmployeeCardRepositoryFake):
    """Repository hỏng: lưu thẻ mới nhưng không liên kết/thu hồi thẻ cũ."""

    async def replace_active(
        self,
        replacement: EmployeeCard,
        expected_active_card_id: UUID | None,
        replaced_at: datetime,
        status_reason: str,
    ) -> tuple[EmployeeCard, EmployeeCard | None]:
        current = await self.get_active_by_driver(replacement.driver_id)
        await self.add(replacement)
        return replacement, current


class _LosingStatusCasRepositoryFake(EmployeeCardRepositoryFake):
    """Repository mà CAS đổi trạng thái luôn thua tranh chấp (trả về None)."""

    async def change_active_status(
        self,
        card_id: UUID,
        target: CardStatus,
        status_reason: str,
        updated_at: datetime,
    ) -> EmployeeCard | None:
        return None


class _ConcurrentReplacementRepositoryFake(EmployeeCardRepositoryFake):
    """Repository mà một quầy khác chen thẻ ACTIVE mới ngay trước khi CAS chạy.

    `race_on_call` chọn lần gọi `replace_active` thứ mấy sẽ bị chen (đếm từ 1) để
    test dựng được thẻ ban đầu bình thường rồi mới tạo tranh chấp.
    """

    def __init__(self, *cards: EmployeeCard, race_on_call: int = 1) -> None:
        super().__init__(*cards)
        self.race_on_call = race_on_call
        self.calls = 0

    async def replace_active(
        self,
        replacement: EmployeeCard,
        expected_active_card_id: UUID | None,
        replaced_at: datetime,
        status_reason: str,
    ) -> tuple[EmployeeCard, EmployeeCard | None]:
        self.calls += 1
        if self.calls == self.race_on_call:
            await super().replace_active(
                EmployeeCard(
                    card_uid="99-99-99-99",
                    card_uid_normalized="99999999",
                    driver_id=replacement.driver_id,
                    issued_at=replaced_at,
                    updated_at=replaced_at,
                ),
                expected_active_card_id,
                replaced_at,
                "Thẻ do quầy khác cấp trước",
            )
        return await super().replace_active(
            replacement, expected_active_card_id, replaced_at, status_reason
        )


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
    assert card.status_reason is None
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

    await _assert_replacement_contract(
        cards,
        driver,
        old,
        replacement,
        retirement_reason="Cấp thẻ mới thay thẻ đang hoạt động",
    )


async def test_issue_over_active_card_keeps_reason_on_the_retired_card_only() -> None:
    driver = _driver()
    cards = EmployeeCardRepositoryFake()
    service = _service(DriverRepositoryFake(driver), cards)

    old = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34"))
    replacement = await service.issue(
        IssueEmployeeCardInput(
            driver_id=driver.id, card_uid="cd-56-78", status_reason="Thẻ cũ bị cong"
        )
    )

    # Lý do người dùng cung cấp là lý do THU HỒI thẻ cũ, không phải thuộc tính thẻ mới.
    assert old.status_reason == "Thẻ cũ bị cong"
    assert replacement.status_reason is None
    await _assert_replacement_contract(
        cards, driver, old, replacement, retirement_reason="Thẻ cũ bị cong"
    )


async def test_replace_active_contract_is_violated_by_a_non_linking_repository() -> None:
    """Chốt hợp đồng: repository không liên kết/thu hồi thẻ cũ phải làm test đỏ."""

    driver = _driver()
    cards = _NonLinkingRepositoryFake()
    service = _service(DriverRepositoryFake(driver), cards)

    old = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34"))
    replacement = await service.issue(
        IssueEmployeeCardInput(driver_id=driver.id, card_uid="cd-56-78")
    )

    with pytest.raises(AssertionError):
        await _assert_replacement_contract(
            cards,
            driver,
            old,
            replacement,
            retirement_reason="Cấp thẻ mới thay thẻ đang hoạt động",
        )

    # Cụ thể: thẻ cũ vẫn ACTIVE và không có liên kết hai chiều nào được tạo.
    assert old.status == CardStatus.ACTIVE
    assert old.replaced_by_card_id is None
    assert replacement.replaces_card_id is None


async def test_change_status_conflict_when_cas_loses_the_race() -> None:
    driver = _driver()
    cards = _LosingStatusCasRepositoryFake()
    service = _service(DriverRepositoryFake(driver), cards)

    card = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34"))
    assert card.status == CardStatus.ACTIVE

    with pytest.raises(ConflictError) as blocking:
        await service.block(card.id, ChangeEmployeeCardStatusInput(status_reason="Chặn thẻ"))
    assert blocking.value.code == "CARD_REPLACEMENT_CONFLICT"

    with pytest.raises(ConflictError) as lost:
        await service.report_lost(card.id, ChangeEmployeeCardStatusInput(status_reason="Mất thẻ"))
    assert lost.value.code == "CARD_REPLACEMENT_CONFLICT"

    # Thẻ không bị đổi trạng thái khi CAS thất bại.
    assert card.status == CardStatus.ACTIVE
    assert card.status_reason is None


async def test_replace_conflict_when_active_card_changed_concurrently() -> None:
    driver = _driver()
    # Lần cấp đầu diễn ra bình thường; tranh chấp xảy ra ở lần thay thẻ.
    cards = _ConcurrentReplacementRepositoryFake(race_on_call=2)
    service = _service(DriverRepositoryFake(driver), cards)

    card = await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34"))

    with pytest.raises(ConflictError) as error:
        await service.replace(
            card.id,
            ReplaceEmployeeCardInput(card_uid="cd-56-78", status_reason="Thay thẻ"),
        )

    assert error.value.code == "CARD_REPLACEMENT_CONFLICT"
    assert await cards.get_by_uid("CD5678") is None


async def test_issue_conflict_when_active_card_appears_concurrently() -> None:
    driver = _driver()
    cards = _ConcurrentReplacementRepositoryFake()
    service = _service(DriverRepositoryFake(driver), cards)

    with pytest.raises(ConflictError) as error:
        await service.issue(IssueEmployeeCardInput(driver_id=driver.id, card_uid="ab-12-34"))

    assert error.value.code == "CARD_REPLACEMENT_CONFLICT"
    assert await cards.get_by_uid("AB1234") is None


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
    # Lý do thay thẻ gắn với thẻ cũ bị thu hồi, thẻ mới không mang lý do.
    assert replacement.status_reason is None
    await _assert_replacement_contract(
        cards, driver, old, replacement, retirement_reason="Thẻ bị gãy"
    )

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
