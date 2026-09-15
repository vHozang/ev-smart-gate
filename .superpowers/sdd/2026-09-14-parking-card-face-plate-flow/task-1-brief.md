### Task 1: Employee-card domain and lifecycle service

**Files:**
- Create: `src/smart_gate/application/cards.py`
- Create: `tests/unit/test_employee_cards.py`
- Modify: `src/smart_gate/domain/enums.py`
- Modify: `src/smart_gate/domain/entities.py`
- Modify: `src/smart_gate/domain/services.py`
- Modify: `src/smart_gate/domain/ports.py`
- Modify: `src/smart_gate/application/dto.py`
- Modify: `tests/fakes.py`
- Test: `tests/unit/test_domain_services.py`

**Interfaces:**
- Produces:
  ```python
  class CardStatus(StrEnum):
      ACTIVE = "ACTIVE"
      BLOCKED = "BLOCKED"
      LOST = "LOST"
      REPLACED = "REPLACED"

  def normalize_card_uid(card_uid: str) -> str: ...
  def mask_card_uid(card_uid: str) -> str: ...
  ```
- `normalize_card_uid` removes every non-ASCII-alphanumeric separator and uppercases the result, so `" ab-12 34 "`, `"AB:12:34"`, and `"ab1234"` normalize to `"AB1234"`. It rejects no value itself; DTO/service validation raises `CARD_UID_INVALID` when fewer than four normalized characters remain.
- `mask_card_uid` operates on the normalized form and returns `"••••" + normalized[-4:]`; raw UIDs are stored for lookup but never returned by list/history/gate-log APIs.
- Produces:
  ```python
  @dataclass(slots=True)
  class EmployeeCard:
      card_uid: str
      card_uid_normalized: str
      driver_id: UUID
      id: UUID = field(default_factory=uuid4)
      status: CardStatus = CardStatus.ACTIVE
      status_reason: str | None = None
      replaces_card_id: UUID | None = None
      replaced_by_card_id: UUID | None = None
      metadata: dict[str, Any] = field(default_factory=dict)
      issued_at: datetime | None = None
      updated_at: datetime | None = None
  ```
- Produces DTOs:
  ```python
  class IssueEmployeeCardInput(StrictModel):
      driver_id: UUID
      card_uid: str = Field(min_length=4, max_length=128)
      status_reason: str | None = Field(None, max_length=500)
      metadata: dict[str, Any] = Field(default_factory=dict)

  class ReplaceEmployeeCardInput(StrictModel):
      card_uid: str = Field(min_length=4, max_length=128)
      status_reason: str = Field(min_length=2, max_length=500)
      metadata: dict[str, Any] = Field(default_factory=dict)

  class ChangeEmployeeCardStatusInput(StrictModel):
      status_reason: str = Field(min_length=2, max_length=500)
  ```
- Produces repository protocol:
  ```python
  class EmployeeCardRepository(Protocol):
      async def add(self, card: EmployeeCard) -> EmployeeCard: ...
      async def get(self, card_id: UUID) -> EmployeeCard | None: ...
      async def get_by_uid(self, card_uid_normalized: str) -> EmployeeCard | None: ...
      async def get_active_by_driver(self, driver_id: UUID) -> EmployeeCard | None: ...
      async def list_by_driver(self, driver_id: UUID) -> list[EmployeeCard]: ...
      async def list_all(self) -> list[EmployeeCard]: ...
      async def change_active_status(
          self,
          card_id: UUID,
          target: CardStatus,
          status_reason: str,
          updated_at: datetime,
      ) -> EmployeeCard | None: ...
      async def replace_active(
          self,
          replacement: EmployeeCard,
          expected_active_card_id: UUID | None,
          replaced_at: datetime,
          status_reason: str,
      ) -> tuple[EmployeeCard, EmployeeCard | None]: ...
  ```
- Produces lifecycle service:
  ```python
  class EmployeeCardService:
      def __init__(
          self,
          drivers: DriverRepository,
          cards: EmployeeCardRepository,
          unit_of_work: UnitOfWork,
      ) -> None: ...

      async def issue(self, payload: IssueEmployeeCardInput) -> EmployeeCard: ...
      async def replace(
          self, card_id: UUID, payload: ReplaceEmployeeCardInput
      ) -> EmployeeCard: ...
      async def block(
          self, card_id: UUID, payload: ChangeEmployeeCardStatusInput
      ) -> EmployeeCard: ...
      async def report_lost(
          self, card_id: UUID, payload: ChangeEmployeeCardStatusInput
      ) -> EmployeeCard: ...
      async def get(self, card_id: UUID) -> EmployeeCard: ...
      async def list_all(self) -> list[EmployeeCard]: ...
      async def list_for_driver(self, driver_id: UUID) -> list[EmployeeCard]: ...
  ```
- `issue` validates an active driver. If the driver has no active card it creates one. If an active card exists it atomically marks that card `REPLACED`, links both records, and creates the new active card; default reason is `"Cấp thẻ mới thay thẻ đang hoạt động"` when the request omitted one.
- `replace` requires the referenced card to exist and still be `ACTIVE`, then calls the same atomic repository operation with `expected_active_card_id=card_id`.
- `block` and `report_lost` accept only an `ACTIVE` card. Missing records raise `CARD_NOT_FOUND`; stale/terminal state raises `CARD_STATUS_INVALID`; duplicate normalized UID raises `CARD_UID_ALREADY_EXISTS`; a stale active-card race raises `CARD_REPLACEMENT_CONFLICT`.

- [ ] **Step 1: Add failing UID normalization tests**

Add these exact assertions to `tests/unit/test_domain_services.py`:

```python
@pytest.mark.parametrize(
    ("raw", "normalized"),
    [
        (" ab-12 34 ", "AB1234"),
        ("AB:12:34", "AB1234"),
        ("ab1234", "AB1234"),
    ],
)
def test_normalize_card_uid(raw: str, normalized: str) -> None:
    assert normalize_card_uid(raw) == normalized


def test_mask_card_uid_never_returns_the_raw_uid() -> None:
    assert mask_card_uid("ab-12-34") == "••••1234"
    assert "AB1234" not in mask_card_uid("ab-12-34")
```

Run: `pytest tests/unit/test_domain_services.py -k card_uid -v`
Expected: FAIL at import because `normalize_card_uid` and `mask_card_uid` do not exist.

- [ ] **Step 2: Add failing lifecycle tests and an in-memory card fake**

In `tests/fakes.py`, add `EmployeeCardRepositoryFake` with dictionaries indexed by ID and normalized UID. Its `replace_active` must first verify the supplied expected active ID, then mark the old record `REPLACED`, set `old.replaced_by_card_id`, set `replacement.replaces_card_id`, and store the replacement. Its `change_active_status` returns `None` unless the record is currently `ACTIVE`.

In `tests/unit/test_employee_cards.py`, write named tests covering:

```python
async def test_issue_first_card_for_active_driver() -> None: ...
async def test_issue_normalizes_uid_and_rejects_short_normalized_uid() -> None: ...
async def test_issue_rejects_missing_or_inactive_driver() -> None: ...
async def test_duplicate_uid_is_rejected() -> None: ...
async def test_issue_over_active_card_atomically_marks_old_replaced_and_links_history() -> None: ...
async def test_replace_requires_the_selected_card_to_be_active() -> None: ...
async def test_block_active_card_preserves_history() -> None: ...
async def test_report_lost_active_card_preserves_history() -> None: ...
async def test_terminal_card_cannot_change_status_again() -> None: ...
async def test_list_for_driver_is_newest_first() -> None: ...
```

For replacement, assert all of:

```python
assert replacement.status == CardStatus.ACTIVE
assert replacement.replaces_card_id == old.id
assert old.status == CardStatus.REPLACED
assert old.replaced_by_card_id == replacement.id
assert await cards.get_by_uid(old.card_uid_normalized) == old
assert await cards.get_active_by_driver(driver.id) == replacement
assert len(await cards.list_by_driver(driver.id)) == 2
```

Run: `pytest tests/unit/test_employee_cards.py -v`
Expected: FAIL because the enum/entity/protocol/service do not exist.

- [ ] **Step 3: Implement the domain types, helpers, protocol, DTOs, fake, and lifecycle service**

Use `datetime.now(UTC)` for issuance/update timestamps. Wrap calls to `replace_active` and `change_active_status` in `async with self.unit_of_work.transaction():`. Construct card values only from normalized UID and active-driver data. Do not log raw UIDs.

Use this transition helper in `EmployeeCardService`:

```python
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
```

Make `DriverRepositoryFake.list_active()` and `VehicleRepositoryFake.list_active()` filter `RecordStatus.ACTIVE`, matching the production repositories.

Run: `pytest tests/unit/test_domain_services.py tests/unit/test_employee_cards.py -v`
Expected: PASS.

- [ ] **Step 4: Run focused static checks**

Run: `ruff check src/smart_gate/domain src/smart_gate/application/cards.py tests/unit/test_employee_cards.py tests/fakes.py && mypy src/smart_gate/domain src/smart_gate/application/cards.py`
Expected: PASS.

- [ ] **Step 5: Review the task diff without committing**

Run: `git diff --check && git status --short`
Expected: no whitespace errors; only planned files plus the pre-existing deleted skill file are listed.

