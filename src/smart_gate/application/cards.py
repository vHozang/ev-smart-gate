from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from smart_gate.application.dto import (
    ChangeEmployeeCardStatusInput,
    IssueEmployeeCardInput,
    ReplaceEmployeeCardInput,
)
from smart_gate.domain.entities import Driver, EmployeeCard
from smart_gate.domain.enums import CardStatus, RecordStatus
from smart_gate.domain.exceptions import ConflictError, NotFoundError, SmartGateError
from smart_gate.domain.ports import DriverRepository, EmployeeCardRepository, UnitOfWork
from smart_gate.domain.services import normalize_card_uid

_DEFAULT_REPLACEMENT_REASON = "Cấp thẻ mới thay thẻ đang hoạt động"
_MIN_NORMALIZED_UID_LENGTH = 4
_EPOCH = datetime.min.replace(tzinfo=UTC)


class EmployeeCardService:
    """Quản lý vòng đời thẻ nhân viên: cấp, thay, chặn, báo mất."""

    def __init__(
        self,
        drivers: DriverRepository,
        cards: EmployeeCardRepository,
        unit_of_work: UnitOfWork,
    ) -> None:
        self.drivers = drivers
        self.cards = cards
        self.unit_of_work = unit_of_work

    async def issue(self, payload: IssueEmployeeCardInput) -> EmployeeCard:
        driver = await self._active_driver(payload.driver_id)
        normalized = await self._validate_new_uid(payload.card_uid)
        current = await self.cards.get_active_by_driver(driver.id)
        now = datetime.now(UTC)
        replacement = EmployeeCard(
            card_uid=payload.card_uid,
            card_uid_normalized=normalized,
            driver_id=driver.id,
            metadata=payload.metadata,
            issued_at=now,
            updated_at=now,
        )
        # `status_reason` là lý do THU HỒI thẻ cũ, không phải thuộc tính của thẻ mới.
        reason = payload.status_reason or _DEFAULT_REPLACEMENT_REASON
        return await self._replace_active(
            replacement,
            expected_active_card_id=current.id if current is not None else None,
            status_reason=reason,
            replaced_at=now,
        )

    async def replace(self, card_id: UUID, payload: ReplaceEmployeeCardInput) -> EmployeeCard:
        card = await self.get(card_id)
        if card.status != CardStatus.ACTIVE:
            raise ConflictError("CARD_STATUS_INVALID", "Chỉ thẻ đang hoạt động mới được thay thế")
        normalized = await self._validate_new_uid(payload.card_uid)
        now = datetime.now(UTC)
        replacement = EmployeeCard(
            card_uid=payload.card_uid,
            card_uid_normalized=normalized,
            driver_id=card.driver_id,
            metadata=payload.metadata,
            issued_at=now,
            updated_at=now,
        )
        # Lý do thay thẻ được ghi vào thẻ cũ bị thu hồi; thẻ ACTIVE mới không mang lý do.
        return await self._replace_active(
            replacement,
            expected_active_card_id=card.id,
            status_reason=payload.status_reason,
            replaced_at=now,
        )

    async def block(self, card_id: UUID, payload: ChangeEmployeeCardStatusInput) -> EmployeeCard:
        return await self._change_status(card_id, CardStatus.BLOCKED, payload)

    async def report_lost(
        self, card_id: UUID, payload: ChangeEmployeeCardStatusInput
    ) -> EmployeeCard:
        return await self._change_status(card_id, CardStatus.LOST, payload)

    async def get(self, card_id: UUID) -> EmployeeCard:
        card = await self.cards.get(card_id)
        if card is None:
            raise NotFoundError("CARD_NOT_FOUND", "Không tìm thấy thẻ nhân viên")
        return card

    async def list_all(self) -> list[EmployeeCard]:
        return await self.cards.list_all()

    async def list_for_driver(self, driver_id: UUID) -> list[EmployeeCard]:
        cards = await self.cards.list_by_driver(driver_id)
        # Thẻ mới nhất lên đầu; dùng vị trí lưu trữ làm tiêu chí phụ khi trùng mốc thời gian.
        indexed = list(enumerate(cards))
        indexed.sort(key=lambda item: (item[1].issued_at or _EPOCH, item[0]), reverse=True)
        return [card for _, card in indexed]

    async def _change_status(
        self,
        card_id: UUID,
        target: CardStatus,
        payload: ChangeEmployeeCardStatusInput,
    ) -> EmployeeCard:
        card = await self.get(card_id)
        if card.status != CardStatus.ACTIVE:
            raise ConflictError("CARD_STATUS_INVALID", "Chỉ thẻ đang hoạt động mới đổi trạng thái")
        async with self.unit_of_work.transaction():
            updated = await self.cards.change_active_status(
                card.id, target, payload.status_reason, datetime.now(UTC)
            )
        if updated is None:
            raise ConflictError("CARD_REPLACEMENT_CONFLICT", "Trạng thái thẻ vừa thay đổi")
        return updated

    async def _replace_active(
        self,
        replacement: EmployeeCard,
        *,
        expected_active_card_id: UUID | None,
        status_reason: str,
        replaced_at: datetime,
    ) -> EmployeeCard:
        async with self.unit_of_work.transaction():
            issued, _ = await self.cards.replace_active(
                replacement,
                expected_active_card_id,
                replaced_at,
                status_reason,
            )
        return issued

    async def _active_driver(self, driver_id: UUID) -> Driver:
        driver = await self.drivers.get(driver_id)
        if driver is None or driver.status != RecordStatus.ACTIVE:
            raise NotFoundError("DRIVER_NOT_FOUND", "Không tìm thấy tài xế đang hoạt động")
        return driver

    async def _validate_new_uid(self, card_uid: str) -> str:
        normalized = normalize_card_uid(card_uid)
        if len(normalized) < _MIN_NORMALIZED_UID_LENGTH:
            raise SmartGateError("CARD_UID_INVALID", "UID thẻ không hợp lệ")
        if await self.cards.get_by_uid(normalized) is not None:
            raise ConflictError("CARD_UID_ALREADY_EXISTS", "UID thẻ đã tồn tại trong hệ thống")
        return normalized
