# Parking Card–Face–Plate Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocus EV Smart Gate on parking entry/exit, add an auditable employee-card lifecycle, require an active card plus the card owner's face plus an authorized registered vehicle at both gates, hide warehouse/export features from the SPA, and generate a verified parking-only MP4 from the real application.

**Architecture:** Add an independent `EmployeeCard` aggregate and Beanie repository whose activation/replacement operations run inside the existing MongoDB unit of work and are protected by unique indexes. Route both existing gate URLs into one direction-aware `VerifyParkingGateUseCase`; it resolves the active card owner first, compares only that owner's face, recognizes a registered vehicle, checks driver–vehicle authorization, persists per-factor decisions, and invokes `BarrierService` only after a passing log is stored. Keep warehouse domain/application/API/persistence intact, but remove all warehouse routes, data fetches, components, copy, and QR/order fields from the SPA and Playwright video.

**Tech Stack:** Python 3.11–3.13, FastAPI, Pydantic v2, MongoDB/Beanie/PyMongo transactions, MinIO, existing face/ALPR and barrier ports, vanilla JavaScript/CSS SPA, Playwright Test, Node.js ESM, Edge TTS, FFmpeg/ffprobe.

**Spec:** `docs/superpowers/specs/2026-09-14-parking-card-face-plate-flow-design.md`

## Global Constraints

- Gate In and Gate Out require all of: one `ACTIVE` employee card, a live face matching that card's active owner, and an active registered vehicle that owner is authorized to use.
- Resolve `vehicle_type` from the registered `Vehicle`; do not add image-based vehicle-type recognition.
- A driver may have at most one active card; card UID normalization and uniqueness are global.
- Replacing/issuing over an active card must mark the old card `REPLACED`, create and link the new active card, and commit both changes atomically.
- Card terminal transitions are one-way: `ACTIVE -> BLOCKED`, `ACTIVE -> LOST`, or `ACTIVE -> REPLACED`; do not reactivate or delete historical cards.
- Keep warehouse APIs, application services, entities, persistence collections, and data unchanged and mounted; only hide/remove warehouse behavior from the SPA and video.
- Keep legacy `VerifyEntryUseCase`, `VerifyExitUseCase`, `GateVerificationInput`, and `ExitVerificationInput` source available for backend compatibility, but do not wire either gate endpoint to them.
- Never write passwords, API keys, session/slip tokens, face embeddings, evidence bytes, or raw card UIDs to application logs, generated trace metadata, narration, subtitles, reports, or gate-history responses.
- Card administration endpoints are ADMIN-only. Gate verification retains the existing ADMIN/SECURITY access policy and device scopes.
- Use the real same-origin FastAPI SPA and real local API with simulator adapters for Playwright; do not create a fake demo page or mock product APIs.
- Final video is `dist/demo/MVP-Demo.mp4`, H.264/yuv420p plus AAC, exactly `1440x900`, positive duration and size, with Vietnamese Edge TTS and burned synchronized subtitles.
- Do not remove Docker volumes or existing application data. Do not modify the pre-existing deletion of `.claude/skills/openspec-bulk-apply-change/SKILL.md`.
- Do not commit or push unless the user explicitly requests it.

## Locked File Structure and Responsibilities

**Create**

- `src/smart_gate/application/cards.py` — card lifecycle orchestration and state validation.
- `src/smart_gate/application/parking_gate.py` — shared direction-aware parking verification use case.
- `src/smart_gate/presentation/routers/employee_cards.py` — ADMIN-only card lifecycle HTTP endpoints.
- `tests/unit/test_employee_cards.py` — normalization, lifecycle, history, conflicts, and fake repository behavior.
- `tests/integration/test_employee_cards.py` — Mongo indexes, transaction rollback, replacement, and concurrency invariants.
- `tests/demo-scripts/parking-ui.test.mjs` — static guard that the SPA no longer exposes warehouse/export UI and contains the three-factor parking contract.

**Modify**

- `src/smart_gate/domain/enums.py` — add `CardStatus`.
- `src/smart_gate/domain/entities.py` — add `EmployeeCard`; extend `GateLog` with card/factor/vehicle-type audit fields.
- `src/smart_gate/domain/services.py` — add card UID normalization and masking helpers; retain plate/face services.
- `src/smart_gate/domain/ports.py` — add `EmployeeCardRepository` protocol.
- `src/smart_gate/application/dto.py` — add card lifecycle DTOs and `ParkingGateVerificationInput`; extend gate outputs without removing legacy DTOs.
- `src/smart_gate/application/gate_entry.py` and `src/smart_gate/application/gate_exit.py` — keep legacy services source-compatible with the expanded output model; do not use them from routers/container.
- `src/smart_gate/application/gate_logs.py` — expose persisted per-factor audit data without card UID.
- `src/smart_gate/infrastructure/database/documents.py` — add `EmployeeCardDocument`, indexes, and compatible optional `GateLogDocument` fields.
- `src/smart_gate/infrastructure/database/repositories.py` — card mappings/repository and GateLog mappings.
- `src/smart_gate/bootstrap/container.py` — wire card service/repository and one shared parking verifier while preserving warehouse objects.
- `src/smart_gate/presentation/schemas.py` — card request/response models; response contains only a masked UID.
- `src/smart_gate/presentation/routers/gates.py` — both endpoints accept the same card/face/plate multipart fields and delegate with explicit direction.
- `src/smart_gate/presentation/routers/gate_logs.py` — keep route behavior while returning expanded `GateLogOutput`.
- `src/smart_gate/main.py` — mount employee-card routes and use parking-first API description while still mounting warehouse routes.
- `tests/fakes.py` — add card fake, conditional lifecycle methods, and status-correct active driver/vehicle listings.
- `tests/unit/test_gate_workflows.py` — replace router-facing warehouse Gate Out scenarios with shared parking entry/exit and rejection cases.
- `tests/unit/test_warehouse.py` — fixture adjustments only if expanded `GateLog` fields require them; preserve warehouse behavior assertions.
- `tests/integration/test_mongo_minio.py` — retain existing encryption/storage/warehouse rollback regression coverage.
- `tests/contract/test_openapi.py` — add card API and multipart gate contracts while retaining warehouse path assertions.
- `src/smart_gate/presentation/static/index.html` — parking-focused description.
- `src/smart_gate/presentation/static/assets/app.js` — card administration, parking dashboard/gates/history, no warehouse UI/data calls.
- `src/smart_gate/presentation/static/assets/styles.css` — card lifecycle and factor-result visual states in the existing design language.
- `tests/demo/mvp-demo.spec.ts` — parking-only real application scenario and timeline.
- `demo/narration.json` — parking-only Vietnamese segment manifest.
- `scripts/demo/security.mjs` — redact card UIDs from trace/network artifacts.
- `scripts/demo/run-demo.mjs` — correct Edge TTS stage copy; keep orchestration contract.
- `tests/demo-scripts/narration.test.mjs` — parking segment contract and Edge TTS expectation.
- `tests/demo-scripts/security.test.mjs` — raw-card-UID redaction coverage.
- `demo/README.md` and `README.md` — reproducible parking-only demo and correct Edge TTS documentation.
- `docs/openapi.json` — regenerate from FastAPI after contract changes.

---

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

### Task 2: Mongo card persistence and atomic replacement

**Files:**
- Create: `tests/integration/test_employee_cards.py`
- Modify: `src/smart_gate/infrastructure/database/documents.py`
- Modify: `src/smart_gate/infrastructure/database/repositories.py`
- Test: `tests/unit/test_employee_cards.py`

**Interfaces:**
- Consumes: `EmployeeCard`, `CardStatus`, `EmployeeCardRepository`, and `current_session()` from Task 1.
- Produces:
  ```python
  class EmployeeCardDocument(Document): ...
  class BeanieEmployeeCardRepository: ...
  ```
- `EmployeeCardDocument.Settings.name = "employee_cards"`.
- Required indexes:
  ```python
  IndexModel([("card_uid_normalized", ASCENDING)], unique=True)
  IndexModel(
      [("driver_id", ASCENDING)],
      unique=True,
      partialFilterExpression={"status": "ACTIVE"},
  )
  IndexModel([("driver_id", ASCENDING), ("issued_at", DESCENDING)])
  IndexModel([("status", ASCENDING), ("updated_at", DESCENDING)])
  ```
  Use literal `"ACTIVE"` in index metadata, because the stored enum value is a string and PyMongo index options are not Pydantic-serialized.
- Every write inside `replace_active` and `change_active_status` passes `session=current_session()`.
- `replace_active` assumes the caller opened `MongoUnitOfWork.transaction()`. It conditionally updates the expected old `_id` with `status="ACTIVE"`, sets `REPLACED`, `replaced_by_card_id`, reason, and timestamp; inserts the linked replacement in the same transaction. With `expected_active_card_id=None`, it inserts only when no active record exists. Unique-index conflicts map to stable card conflict codes.

- [ ] **Step 1: Add the document model and failing index test**

Define `EmployeeCardDocument` immediately after `DriverDocument`, import `CardStatus`, and add the model to `DOCUMENT_MODELS` immediately after `DriverDocument`.

In `tests/integration/test_employee_cards.py`, build an isolated database name, connect through `MongoDatabase`, and inspect `EmployeeCardDocument.get_pymongo_collection().list_indexes()`. Assert one global unique UID index and one unique `driver_id` index whose `partialFilterExpression == {"status": "ACTIVE"}`.

Run: `RUN_INTEGRATION=1 pytest tests/integration/test_employee_cards.py -k indexes -v`
Expected: FAIL until the collection/model registration and exact indexes are complete; skip with the established message if the replica-set environment is unavailable.

- [ ] **Step 2: Implement document mapping and basic repository queries**

Add `_employee_card_from_document(document: EmployeeCardDocument) -> EmployeeCard` and methods `add`, `get`, `get_by_uid`, `get_active_by_driver`, `list_by_driver`, and `list_all`. Sort history by `issued_at DESCENDING`. On `add`, inspect `DuplicateKeyError.details.get("keyPattern", {})`: map `card_uid_normalized` to `CARD_UID_ALREADY_EXISTS`, `driver_id` to `ACTIVE_CARD_ALREADY_EXISTS`, otherwise `CARD_REPLACEMENT_CONFLICT`.

Run: `pytest tests/unit/test_employee_cards.py -v`
Expected: PASS; unit behavior remains stable.

- [ ] **Step 3: Add failing real replacement, rollback, and concurrency tests**

Use a real `BeanieDriverRepository`, `BeanieEmployeeCardRepository`, and `EmployeeCardService` with `MongoUnitOfWork`. Test:

1. issuing the first card;
2. issuing a second card marks the first `REPLACED`, links both, and leaves exactly one `ACTIVE` record;
3. duplicate formatted variants such as `"AB-12-34"` and `"ab1234"` raise `CARD_UID_ALREADY_EXISTS`;
4. a deliberate exception after calling repository replacement inside an outer transaction rolls back both old-state and new insert;
5. two concurrent replacements against the same old card result in one active replacement and one conflict, never two active cards.

The concurrency assertion must query the collection after both tasks finish:

```python
results = await asyncio.gather(replace_one(), replace_two(), return_exceptions=True)
history = await cards.list_by_driver(driver.id)
active = [card for card in history if card.status == CardStatus.ACTIVE]
assert len(active) == 1
assert sum(isinstance(item, EmployeeCard) for item in results) == 1
assert sum(isinstance(item, ConflictError) for item in results) == 1
```

Run: `RUN_INTEGRATION=1 pytest tests/integration/test_employee_cards.py -v`
Expected: FAIL on unimplemented atomic methods.

- [ ] **Step 4: Implement conditional status changes and atomic replacement**

Use `find_one_and_update(..., return_document=ReturnDocument.AFTER, session=current_session())` for `change_active_status`. In `replace_active`, use the known replacement UUID before updating the old record, and pass the session to both old-record update and `EmployeeCardDocument.insert`. If the expected old record was not updated, raise `ConflictError("CARD_REPLACEMENT_CONFLICT", "Thẻ đang hoạt động đã thay đổi")` before inserting.

Do not open a nested transaction in the repository. Let `EmployeeCardService` own the unit-of-work boundary.

Run: `RUN_INTEGRATION=1 pytest tests/integration/test_employee_cards.py -v`
Expected: PASS with MongoDB configured as a replica set.

- [ ] **Step 5: Re-run existing integration regression**

Run: `RUN_INTEGRATION=1 pytest tests/integration/test_mongo_minio.py tests/integration/test_employee_cards.py -v`
Expected: PASS; driver encryption, MinIO, authorization indexes, warehouse rollback, and card invariants all remain valid.

### Task 3: Card administration API and composition wiring

**Files:**
- Create: `src/smart_gate/presentation/routers/employee_cards.py`
- Modify: `src/smart_gate/presentation/schemas.py`
- Modify: `src/smart_gate/bootstrap/container.py`
- Modify: `src/smart_gate/main.py`
- Modify: `tests/contract/test_openapi.py`
- Modify: `docs/openapi.json`

**Interfaces:**
- Consumes: `EmployeeCardService` and `BeanieEmployeeCardRepository`.
- Produces request models:
  ```python
  class EmployeeCardIssueRequest(ApiModel):
      driver_id: UUID
      card_uid: str = Field(min_length=4, max_length=128)
      status_reason: str | None = Field(None, max_length=500)
      metadata: dict[str, Any] = Field(default_factory=dict)

  class EmployeeCardReplaceRequest(ApiModel):
      card_uid: str = Field(min_length=4, max_length=128)
      status_reason: str = Field(min_length=2, max_length=500)
      metadata: dict[str, Any] = Field(default_factory=dict)

  class EmployeeCardStatusRequest(ApiModel):
      status_reason: str = Field(min_length=2, max_length=500)

  class EmployeeCardResponse(ApiModel):
      id: UUID
      card_uid_masked: str
      driver_id: UUID
      status: CardStatus
      status_reason: str | None
      replaces_card_id: UUID | None
      replaced_by_card_id: UUID | None
      metadata: dict[str, Any]
      issued_at: datetime | None
      updated_at: datetime | None
  ```
- Produces routes:
  ```text
  POST /api/v1/employee-cards                         201 ADMIN + CSRF
  GET  /api/v1/employee-cards?driver_id=<uuid>        200 ADMIN
  GET  /api/v1/employee-cards/{card_id}               200 ADMIN
  POST /api/v1/employee-cards/{card_id}/block         200 ADMIN + CSRF
  POST /api/v1/employee-cards/{card_id}/report-lost   200 ADMIN + CSRF
  POST /api/v1/employee-cards/{card_id}/replace       201 ADMIN + CSRF
  ```
- `EmployeeCardResponse` never exposes `card_uid` or `card_uid_normalized`; `_card_response` calls `mask_card_uid`.
- `Container` produces `self.employee_cards`, `self.card_management`, and later `self.verify_parking_gate`. Preserve `self.orders`, `self.docks`, `self.warehouse`, `self.slips`, `self.qr_reader`, and cargo adapters.

- [ ] **Step 1: Add failing OpenAPI card contract assertions**

Extend `test_openapi_exposes_required_contracts` to assert all six routes, response refs, `driver_id` query support, and absence of raw UID fields from `EmployeeCardResponse`:

```python
card_schema = schema["components"]["schemas"]["EmployeeCardResponse"]
assert "card_uid_masked" in card_schema["properties"]
assert "card_uid" not in card_schema["properties"]
assert "card_uid_normalized" not in card_schema["properties"]
```

Keep every existing warehouse endpoint assertion unchanged.

Run: `pytest tests/contract/test_openapi.py -v`
Expected: FAIL because employee-card routes and schemas are absent.

- [ ] **Step 2: Add schemas and router**

Implement `_card_response(card: EmployeeCard) -> EmployeeCardResponse` explicitly rather than `model_validate`, because the external masked field differs from the domain entity. Make list choose `list_for_driver(driver_id)` when the query is present and `list_all()` otherwise.

Every route uses `require_roles(UserRole.ADMIN)`, with `csrf=True` on mutations. Do not log request bodies.

Run: `pytest tests/contract/test_openapi.py -v`
Expected: still FAIL until the router is mounted.

- [ ] **Step 3: Wire persistence/service and mount the router**

In `Container.__init__`:

```python
self.employee_cards = BeanieEmployeeCardRepository()
self.card_management = EmployeeCardService(
    self.drivers,
    self.employee_cards,
    self.unit_of_work,
)
```

Mount `employee_cards.router` while retaining `warehouse.router`. Change only the API description to parking-first wording such as `"API kiểm soát bãi xe bằng thẻ nhân viên, khuôn mặt và biển số."`; endpoint availability remains unchanged.

Run: `pytest tests/contract/test_openapi.py -v`
Expected: PASS for card and preserved warehouse paths.

- [ ] **Step 4: Regenerate and verify OpenAPI**

Run: `python scripts/export_openapi.py`
Expected: `docs/openapi.json` includes employee-card routes and still includes warehouse routes.

Run: `ruff check src/smart_gate/presentation/routers/employee_cards.py src/smart_gate/presentation/schemas.py src/smart_gate/bootstrap/container.py src/smart_gate/main.py && mypy src`
Expected: PASS.

### Task 4: Persisted parking-factor audit contract

**Files:**
- Modify: `src/smart_gate/domain/entities.py`
- Modify: `src/smart_gate/application/dto.py`
- Modify: `src/smart_gate/application/gate_logs.py`
- Modify: `src/smart_gate/application/gate_entry.py`
- Modify: `src/smart_gate/application/gate_exit.py`
- Modify: `src/smart_gate/infrastructure/database/documents.py`
- Modify: `src/smart_gate/infrastructure/database/repositories.py`
- Modify: `tests/fakes.py`
- Test: `tests/unit/test_gate_workflows.py`
- Test: `tests/unit/test_warehouse.py`

**Interfaces:**
- Produces `GateLog`/`GateLogDocument` fields, all optional/defaulted for old persisted records:
  ```python
  card_id: UUID | None = None
  card_status: CardStatus | None = None
  card_verified: bool = False
  face_verified: bool = False
  plate_verified: bool = False
  authorization_verified: bool = False
  vehicle_type: str | None = None
  ```
- Produces shared input:
  ```python
  class ParkingGateVerificationInput(StrictModel):
      direction: Direction
      event_id: str = Field(min_length=8, max_length=128)
      gate_id: str = Field(min_length=1, max_length=128)
      card_uid: str = Field(min_length=4, max_length=128)
      plate_image: bytes
      face_image: bytes
  ```
- Extends `VerificationOutput` with required `direction` and display-safe fields:
  ```python
  direction: Direction
  card_id: UUID | None = None
  card_status: CardStatus | None = None
  card_verified: bool = False
  face_verified: bool = False
  plate_verified: bool = False
  authorization_verified: bool = False
  driver_name: str | None = None
  vehicle_type: str | None = None
  ```
- Extends `GateLogOutput` with `card_id`, `card_status`, four factor booleans, and `vehicle_type`; never expose raw UID.
- Legacy DTOs and use cases remain. Their `_output` methods supply `direction=Direction.ENTRY` or `Direction.EXIT`; added factor fields retain false/none defaults.

- [ ] **Step 1: Add failing serialization/mapping assertions**

Add a focused test that constructs a `GateLog` with all factor fields, passes it through `GateLogQueryService.output`, and asserts every value is preserved while no output field contains `card_uid`.

Run: `pytest tests/unit/test_gate_workflows.py -k gate_log_factor_output -v`
Expected: FAIL because the fields do not exist.

- [ ] **Step 2: Extend domain/document/DTO and mappings**

Add compatible defaults to the dataclass and Beanie document. Update `_gate_log_from_document`, `BeanieGateLogRepository.add/update`, and `GateLogQueryService.output`. `asdict` already carries the new fields on writes; explicit document-to-domain mapping must include them.

Update legacy entry/exit `_output` constructors with `direction`. Do not remove their warehouse logic or source files.

Run: `pytest tests/unit/test_gate_workflows.py tests/unit/test_warehouse.py -v`
Expected: PASS after fixture/output updates; warehouse service behavior remains intact.

- [ ] **Step 3: Run compatibility checks**

Run: `ruff check src/smart_gate/application src/smart_gate/domain src/smart_gate/infrastructure/database tests/unit/test_gate_workflows.py && mypy src`
Expected: PASS.

### Task 5: Shared Gate In/Gate Out parking verification

**Files:**
- Create: `src/smart_gate/application/parking_gate.py`
- Modify: `tests/unit/test_gate_workflows.py`
- Modify: `src/smart_gate/bootstrap/container.py`
- Modify: `src/smart_gate/presentation/routers/gates.py`
- Modify: `tests/contract/test_openapi.py`

**Interfaces:**
- Consumes Task 1 card repository, Task 4 DTO/log fields, existing `EvidenceStorageGateway`, face/plate gateways, matchers, `AlertService`, and `BarrierService`.
- Produces:
  ```python
  class VerifyParkingGateUseCase:
      def __init__(
          self,
          settings: Settings,
          cards: EmployeeCardRepository,
          drivers: DriverRepository,
          vehicles: VehicleRepository,
          authorizations: AuthorizationRepository,
          gate_logs: GateLogRepository,
          evidence: EvidenceStorageGateway,
          lpr: LicensePlateGateway,
          face: FaceGateway,
          plate_matcher: PlateMatchingService,
          face_matcher: FaceMatchingService,
          alerts: AlertService,
          barrier: BarrierService,
      ) -> None: ...

      async def execute(
          self, payload: ParkingGateVerificationInput
      ) -> VerificationOutput: ...
  ```
- Both public URLs remain unchanged. Each accepts multipart `event_id`, `gate_id`, `card_uid`, `face_image`, and `plate_image`. Gate Out no longer accepts `slip_image`.
- Stable reason codes:
  ```text
  CARD_UID_INVALID
  CARD_NOT_FOUND
  CARD_NOT_ACTIVE
  CARD_OWNER_NOT_FOUND
  CARD_OWNER_INACTIVE
  FACE_NOT_CARD_OWNER
  FACE_LOW_CONFIDENCE
  FACE_SPOOF
  VEHICLE_NOT_MATCHED
  PLATE_LOW_CONFIDENCE
  DRIVER_VEHICLE_NOT_AUTHORIZED
  EVIDENCE_STORE_UNEXPECTED_ERROR
  AI_PIPELINE_UNEXPECTED_ERROR
  ALL_CHECKS_PASSED
  ```
- Factor semantics:
  - `card_verified`: normalized UID resolves to an `ACTIVE` card.
  - `face_verified`: detector confidence and liveness pass and embedding matches the active card owner.
  - `plate_verified`: confidence passes and matcher resolves an active registered vehicle.
  - `authorization_verified`: owner is authorized for the resolved vehicle at event time.
- Invalid/non-active card stops before evidence storage and AI. Every failure fails closed with the barrier unopened. Every outcome still writes one GateLog and creates an alert for failure without embedding/raw UID/evidence payload in alert data.
- For success, store GateLog before `BarrierService.open`; barrier no-ACK preserves `verification_status=PASSED` but returns `permit_granted=False` and `barrier_status=FAILED`, matching the existing convention.

- [ ] **Step 1: Replace workflow tests with a parameterized shared harness**

Build one `_parking_use_case(...)` fixture helper using `EmployeeCardRepositoryFake`, an active card, driver, vehicle, existing fake services, and direction-aware `ParkingGateVerificationInput`.

Add explicit tests:

```python
@pytest.mark.parametrize("direction", [Direction.ENTRY, Direction.EXIT])
async def test_parking_gate_opens_only_when_all_factors_match(direction): ...

async def test_parking_gate_duplicate_event_returns_same_log_and_one_barrier_call(): ...
async def test_parking_gate_rejects_event_id_reused_for_other_direction(): ...
@pytest.mark.parametrize("status", [CardStatus.BLOCKED, CardStatus.LOST, CardStatus.REPLACED])
async def test_parking_gate_rejects_non_active_card_before_ai(status): ...
async def test_parking_gate_rejects_unknown_card_before_ai(): ...
async def test_parking_gate_rejects_missing_card_owner(): ...
async def test_parking_gate_rejects_inactive_card_owner(): ...
async def test_parking_gate_compares_face_only_with_card_owner(): ...
async def test_parking_gate_rejects_low_confidence_face(): ...
async def test_parking_gate_rejects_face_spoof(): ...
async def test_parking_gate_rejects_unreadable_or_unregistered_plate(): ...
async def test_parking_gate_rejects_unauthorized_owner_vehicle_pair(): ...
async def test_parking_gate_ai_exception_fails_closed(): ...
async def test_parking_gate_evidence_exception_fails_closed(): ...
async def test_parking_gate_barrier_exception_keeps_permit_closed(): ...
async def test_parking_gate_returns_registered_vehicle_type(): ...
```

The face-mismatch test must include another globally better matching driver and prove the use case does not call `best_match` across all drivers; it compares with `face_matcher.matches_driver(observation, card_owner)`.

Run: `pytest tests/unit/test_gate_workflows.py -v`
Expected: FAIL because `VerifyParkingGateUseCase` is absent.

- [ ] **Step 2: Implement idempotency and card-owner resolution first**

At the start of `execute`:

```python
existing = await self.gate_logs.get_by_event_id(payload.event_id)
if existing is not None:
    if existing.direction != payload.direction:
        raise ConflictError(
            "EVENT_ID_WORKFLOW_CONFLICT",
            "event_id đã được dùng cho hướng cổng khác",
        )
    return await self._output(existing)

normalized_uid = normalize_card_uid(payload.card_uid)
if len(normalized_uid) < 4:
    return await self._failed(payload, ["CARD_UID_INVALID"])
card = await self.cards.get_by_uid(normalized_uid)
if card is None:
    return await self._failed(payload, ["CARD_NOT_FOUND"])
if card.status != CardStatus.ACTIVE:
    return await self._failed(
        payload,
        ["CARD_NOT_ACTIVE"],
        card_id=card.id,
        card_status=card.status,
    )
```

Resolve owner by exact `card.driver_id`; reject missing/inactive owner. Do not call `drivers.list_active()` for facial identity selection.

Run: `pytest tests/unit/test_gate_workflows.py -k 'card or owner or event_id' -v`
Expected: PASS.

- [ ] **Step 3: Implement evidence, parallel AI, factor evaluation, and safe failure logs**

Store face/plate evidence concurrently with categories `gate-entry-face`, `gate-entry-plate`, `gate-exit-face`, or `gate-exit-plate`. Run face extraction and ALPR concurrently using `asyncio.gather`. Evaluate every applicable reason in deterministic order: plate, face quality/liveness/owner match, authorization.

Persist `vehicle_type=plate_match.vehicle.vehicle_type` only when a vehicle resolves. Compute `verification_score=min(plate_match.score, face_similarity)` only when all factors pass; otherwise `0.0`. Alerts use direction-aware types `ENTRY_MISMATCH`, `EXIT_MISMATCH`, `ENTRY_PROCESSING_FAILED`, or `EXIT_PROCESSING_FAILED` and omit card UID.

After `stored = await gate_logs.add(gate_log)`, compare IDs. If `stored.id != gate_log.id`, return the already-stored result and do not call the barrier; this makes the unique event-log insert select one barrier-command winner under a concurrent duplicate.

Run: `pytest tests/unit/test_gate_workflows.py -v`
Expected: PASS.

- [ ] **Step 4: Rewire the container and gate endpoints**

Create one instance:

```python
self.verify_parking_gate = VerifyParkingGateUseCase(
    settings,
    self.employee_cards,
    self.drivers,
    self.vehicles,
    self.authorizations,
    self.gate_logs,
    self.evidence,
    self.lpr,
    self.face,
    plate_matcher,
    face_matcher,
    alert_service,
    barrier_service,
)
```

Remove only the runtime construction of `self.verify_entry` and `self.verify_exit`; preserve legacy source and all warehouse wiring. Each router passes `Direction.ENTRY` or `Direction.EXIT`. Remove `slip_image` upload/read from Gate Out.

- [ ] **Step 5: Assert the exact OpenAPI multipart contract**

Resolve each endpoint's multipart schema `$ref` and assert required fields equal:

```python
{"event_id", "gate_id", "card_uid", "plate_image", "face_image"}
```

Assert `slip_image` is absent from Gate Out. Retain all warehouse endpoint assertions.

Run: `pytest tests/contract/test_openapi.py tests/unit/test_gate_workflows.py tests/unit/test_warehouse.py -v`
Expected: PASS.

- [ ] **Step 6: Run backend quality gates**

Run: `ruff check . && ruff format --check . && mypy src && pytest --cov=smart_gate --cov-report=term-missing`
Expected: PASS; report exact failures instead of weakening assertions.

### Task 6: Parking-only dashboard and employee-card SPA

**Files:**
- Create: `tests/demo-scripts/parking-ui.test.mjs`
- Modify: `src/smart_gate/presentation/static/index.html`
- Modify: `src/smart_gate/presentation/static/assets/app.js`
- Modify: `src/smart_gate/presentation/static/assets/styles.css`

**Interfaces:**
- Consumes card API from Task 3 and existing drivers/vehicles/authorization/gate-log APIs.
- Produces navigation route `/employee-cards` for ADMIN.
- Produces SPA functions:
  ```javascript
  function cardById(id)
  function maskCardUidForDisplay(value)
  function renderEmployeeCards()
  function renderEmployeeCardRow(card)
  function openEmployeeCardModal(driverId = null)
  function openReplaceEmployeeCardModal(cardId)
  function openEmployeeCardStatusModal(cardId, status)
  async function submitEmployeeCard(form)
  async function replaceEmployeeCard(cardId, form)
  async function changeEmployeeCardStatus(cardId, status, reason)
  ```
- `state.employeeCards` contains response objects with `card_uid_masked`; the SPA never receives or stores raw UID from list/history API responses.
- Removes `/warehouse` navigation/page metadata/renderer and all reachable warehouse dialogs/actions/data loads. Backend URLs stay untouched in Python.

- [ ] **Step 1: Write a failing parking-only static UI guard**

In `tests/demo-scripts/parking-ui.test.mjs`, read `index.html` and `app.js`. Assert:

```javascript
assert.doesNotMatch(source, /route:\s*["']\/warehouse["']/);
assert.doesNotMatch(source, /renderWarehouse|refreshOrdersWithoutRender|slip_image/);
assert.doesNotMatch(visibleCopy, /Xuất kho|lệnh kho|dock|Exit Slip|QR phiếu xuất/i);
assert.match(source, /\/employee-cards/);
assert.match(source, /card_uid/);
assert.match(source, /card_verified/);
assert.match(source, /authorization_verified/);
```

Construct `visibleCopy` from literal UI strings in the two files rather than scanning backend/docs. This guard is about presentation content only.

Run: `node --test tests/demo-scripts/parking-ui.test.mjs`
Expected: FAIL on current warehouse routes/copy and absent cards.

- [ ] **Step 2: Remove warehouse presentation state and navigation**

Delete from SPA navigation and metadata: `/warehouse`, warehouse icon usage, warehouse role CTA, and warehouse route rendering. Remove `state.orders`, `state.docks`, `warehouseTab`, `orderView`, order filters, and calls that fetch `/warehouse/*`. Delete warehouse renderers, modals, and action handlers from `app.js` rather than leaving hidden dead UI.

Replace dashboard order/dock KPIs with parking values computed from `state.gateLogs`, `state.drivers`, `state.vehicles`, and `state.employeeCards`: successful entries, successful exits, active cards, and safe rejections. Rewrite login hero/workflow/dashboard copy to describe card → face → registered plate only.

Update `index.html` meta description to parking entry/exit language.

Run: `node --check src/smart_gate/presentation/static/assets/app.js && node --test tests/demo-scripts/parking-ui.test.mjs`
Expected: card-presence checks still FAIL, but warehouse absence checks PASS.

- [ ] **Step 3: Implement employee-card state, screen, and dialogs**

Load `/api/v1/employee-cards` only for ADMIN; for other roles use an empty array and keep gate UI usable. Render one employee grouping with current active card first and history beneath. Use status labels `Đang hoạt động`, `Đã khóa`, `Đã báo mất`, `Đã thay thế`; display only `card_uid_masked`, status reason, issued/updated time, and replacement linkage.

The issue/replacement inputs use:

```html
<input name="card_uid" type="password" minlength="4" maxlength="128"
       autocomplete="off" aria-label="UID thẻ nhân viên">
```

Buttons/actions:
- `Cấp thẻ` posts `{driver_id, card_uid, status_reason, metadata:{source:"operator-console"}}`.
- `Thay thẻ` posts the new UID and mandatory reason.
- `Khóa thẻ` and `Báo mất` collect a mandatory reason and confirm the terminal transition.
- Successful mutation closes the modal, reloads employee cards, renders the current page, and shows a toast.

Run: `node --check src/smart_gate/presentation/static/assets/app.js && node --test tests/demo-scripts/parking-ui.test.mjs`
Expected: PASS.

- [ ] **Step 4: Add styles in the existing visual language**

Add scoped classes for `.card-status`, `.card-status-active`, `.card-status-blocked`, `.card-status-lost`, `.card-status-replaced`, `.card-history`, `.card-history-item`, and `.card-uid`. Reuse existing color tokens, radius, type scale, buttons, tables, and responsive breakpoints; do not redesign unrelated pages. At phone width, action rows wrap and card history becomes one column without horizontal body scrolling.

Run: `node --check src/smart_gate/presentation/static/assets/app.js && npm test`
Expected: PASS.

### Task 7: Unified three-factor Gate In/Gate Out SPA and history

**Files:**
- Modify: `src/smart_gate/presentation/static/assets/app.js`
- Modify: `src/smart_gate/presentation/static/assets/styles.css`
- Modify: `tests/demo-scripts/parking-ui.test.mjs`

**Interfaces:**
- Consumes the multipart contract and output flags from Task 5.
- Keeps `submitGateVerification(form, direction)` but posts only `event_id`, `gate_id`, `card_uid`, `face_image`, and `plate_image`.
- Produces consistent factor cards for `card_verified`, `face_verified`, `plate_verified`, and `authorization_verified` plus barrier status.
- Gate history renders direction, employee display name via `driverById`, plate, registered vehicle type, factor outcomes, reason labels, barrier state, and timestamp; never UID.

- [ ] **Step 1: Add failing static assertions for both gate forms**

Extend `parking-ui.test.mjs` to require one shared gate form implementation containing `name="card_uid"`, `name="face_image"`, and `name="plate_image"`, and to reject `slip_image`, QR selectors, order selectors, and warehouse refresh calls.

Run: `node --test tests/demo-scripts/parking-ui.test.mjs`
Expected: FAIL on the current Gate Out QR/order behavior.

- [ ] **Step 2: Rewrite the common gate form and submission**

Both tabs show numbered steps:

1. `Quẹt thẻ nhân viên` — password-style UID input with a device-neutral hint.
2. `Xác minh khuôn mặt chủ thẻ` — existing image upload/camera affordance.
3. `Nhận diện biển số xe` — existing image upload/camera affordance.

The submit labels are `Xác minh và mở Gate In` and `Xác minh và mở Gate Out`. Remove order loading and all QR controls. After a response, clear the raw card input immediately before rendering the result.

- [ ] **Step 3: Render per-factor decisions and registered vehicle type**

`renderVerificationResult` must present four named checks and use API booleans, not infer success from one aggregate status. A passed verification with barrier failure says `Xác thực hợp lệ — barrier chưa xác nhận`; it must not say the gate opened. On full success display employee name, observed plate, `vehicle_type`, and `Đã mở barrier`.

Map reason codes to safe Vietnamese guidance. `CARD_NOT_ACTIVE` must not reveal whether the card was blocked/lost/replaced beyond the ADMIN card screen. Do not render raw UID in results or history.

- [ ] **Step 4: Render entry/exit history and responsive factor layout**

Extend gate-log cards/table with factor badges and vehicle type. Add `.gate-steps`, `.gate-step`, `.factor-grid`, `.factor-result`, `.factor-pass`, `.factor-fail`, and responsive stacking. Keep at least 16px side gutters at narrow widths and no body-level horizontal scroll.

Run: `node --check src/smart_gate/presentation/static/assets/app.js && node --test tests/demo-scripts/parking-ui.test.mjs && npm test`
Expected: PASS.

- [ ] **Step 5: Inspect the running UI before rewriting the video**

Run: `docker compose up -d --build mongodb mongodb-init minio minio-init barrier-simulator camera-simulator api`
Expected: `/health/ready` returns HTTP 200 without deleting volumes.

Open the SPA at desktop `1440x900` and phone width near `400px`. Verify card dialogs, both gate tabs, rejection copy, result hierarchy, history, focus visibility, and no warehouse navigation/copy. Record concrete material issues for the later Impeccable pass rather than changing the visual direction ad hoc.

### Task 8: Real parking-only Playwright scenario

**Files:**
- Modify: `tests/demo/mvp-demo.spec.ts`
- Modify: `scripts/demo/security.mjs`
- Modify: `tests/demo-scripts/security.test.mjs`

**Interfaces:**
- Consumes real authenticated local APIs and visible SPA interactions.
- `DemoIdentity` becomes:
  ```typescript
  interface DemoIdentity {
    driverId: string;
    driverName: string;
    vehicleId: string;
    plateNumber: string;
    vehicleType: string;
    oldCardUid: string;
    newCardUid: string;
    faceImage: Buffer;
    plateImage: Buffer;
  }
  ```
- Produces timeline IDs and exact steps:
  ```text
  intro                 Mở trung tâm kiểm soát bãi xe EV Smart Gate
  login                 Đăng nhập bằng phiên vận hành an toàn
  identity-registration Hiển thị hồ sơ nhân viên, khuôn mặt, xe và loại xe
  card-issuance         Cấp thẻ nhân viên
  card-replacement      Thay thẻ và lưu lịch sử thẻ cũ
  gate-entry            Xác thực thẻ, khuôn mặt và biển số tại Gate In
  safe-rejection        Từ chối an toàn thẻ đã được thay thế
  gate-exit             Xác thực cùng ba yếu tố tại Gate Out
  history               Xem lịch sử vào, từ chối và ra
  success               Hoàn tất luồng kiểm soát bãi xe
  ```
- Raw card values are generated per run, entered only into password-style UI fields, never attached to timeline/log text, and redacted from Playwright trace/network payloads.

- [ ] **Step 1: Add failing security redaction coverage**

Extend sanitizer fixtures with JSON, multipart, and DOM snapshots containing keys/attributes `card_uid`, `oldCardUid`, and `newCardUid`. Assert the sanitized archive does not contain the sample UID while preserving non-sensitive driver/plate business data.

Run: `node --test tests/demo-scripts/security.test.mjs`
Expected: FAIL because card UID keys are not redacted.

- [ ] **Step 2: Extend the sanitizer's sensitive-field rules**

Treat case-insensitive `card_uid`, `cardUid`, `oldCardUid`, and `newCardUid` as credential-like values across JSON, form/multipart text, URL-encoded bodies, and trace DOM input values. Replace with the existing redaction marker; do not add the sample UID to logs or error text.

Run: `node --test tests/demo-scripts/security.test.mjs`
Expected: PASS.

- [ ] **Step 3: Rewrite demo identity preparation without warehouse data**

Remove `orderId`, `cargoImage`, camera cargo fetch, warehouse order creation, dock capture, slip issuance, and QR loading. Continue creating a unique employee face through the real API and reuse/create the simulator plate's active vehicle with `vehicle_type="Xe điện"` or the existing registered type. Create driver–vehicle authorization through the real endpoint.

Generate UIDs from the run label, for example `DEMO-OLD-<suffix>` and `DEMO-NEW-<suffix>`, but never print or attach them.

- [ ] **Step 4: Implement the ten visible business scenes**

Use semantic locators and visible assertions:

- Card issuance: open `/employee-cards`, choose the demo employee, submit old UID, assert masked suffix/status.
- Card replacement: use the visible `Thay thẻ` dialog, submit new UID and reason, assert old `Đã thay thế` plus new `Đang hoạt động`.
- Gate In: fill new UID and both images, submit, assert every factor passes, employee name/type appear, and heading says `Đã mở cổng`.
- Safe rejection: fill old UID and images, submit, assert rejection, `CARD_NOT_ACTIVE` guidance, and barrier closed/not requested.
- Gate Out: switch tab, use new UID and the same face/plate, assert every factor and barrier pass with no order/QR interaction.
- History: assert visible ENTRY success, rejection, EXIT success, plate, vehicle type, and no raw UID.
- Success: finish on parking dashboard/history, not warehouse UI.

At the start and end, assert `/Xuất kho|lệnh kho|dock|Exit Slip|QR phiếu xuất/i` is absent from the rendered body.

- [ ] **Step 5: Run the real Playwright scenario**

Run: `npm run demo:test`
Expected: one passing `mvp-demo` test, no page errors, a fresh video/trace/timeline/report, exactly ten timeline entries, and no warehouse scene.

Run: `node --test tests/demo-scripts/security.test.mjs`
Expected: PASS after the Playwright wrapper sanitizes generated artifacts.

### Task 9: Parking narration, subtitles, and reproducible documentation

**Files:**
- Modify: `demo/narration.json`
- Modify: `scripts/demo/run-demo.mjs`
- Modify: `tests/demo-scripts/narration.test.mjs`
- Modify: `demo/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes the ten exact timeline IDs/step labels from Task 8.
- Keeps the existing manifest shape and `vi-VN-HoaiMyNeural` Edge TTS default.
- Keeps `npm run demo:mvp` and final output paths unchanged.
- Existing `generate-voice.mjs`, `generate-srt.mjs`, `build-demo.mjs`, and `verify-demo.mjs` remain reusable unless tests expose a concrete synchronization defect.

- [ ] **Step 1: Replace narration tests with the parking segment contract**

Read `demo/narration.json` in the test and assert exact ordered IDs from Task 8. Join all `step` and `text` values and reject `/xuất kho|lệnh kho|dock|kiểm hàng|Exit Slip|QR/i`. Assert the manifest uses Vietnamese and the expected Edge TTS voice. Replace the stale OpenAI-key test with an Edge TTS invocation contract test that does not expect `OPENAI_API_KEY`.

Run: `node --test tests/demo-scripts/narration.test.mjs`
Expected: FAIL against current warehouse narration and stale OpenAI assertion.

- [ ] **Step 2: Write concise Vietnamese narration for all ten visible scenes**

Use these messages, keeping each short enough for its measured scene:

```json
[
  ["intro", "EV Smart Gate tập trung vào kiểm soát bãi xe ra vào bằng ba yếu tố độc lập."],
  ["login", "Quản trị viên đăng nhập bằng phiên vận hành được bảo vệ."],
  ["identity-registration", "Hồ sơ nhân viên liên kết khuôn mặt với xe, biển số và loại xe đã đăng ký."],
  ["card-issuance", "Mỗi nhân viên được cấp một thẻ hoạt động duy nhất."],
  ["card-replacement", "Khi thay thẻ, thẻ cũ bị vô hiệu hóa và toàn bộ lịch sử vẫn được giữ lại."],
  ["gate-entry", "Gate In chỉ mở khi thẻ hợp lệ, khuôn mặt đúng chủ thẻ và xe được cấp quyền."],
  ["safe-rejection", "Thẻ đã thay thế bị từ chối an toàn, vì vậy barrier luôn giữ đóng."],
  ["gate-exit", "Gate Out dùng cùng ba yếu tố và không phụ thuộc phiếu hay quy trình kho."],
  ["history", "Mọi lượt vào, lượt ra và lần từ chối đều lưu kết quả từng yếu tố để kiểm tra."],
  ["success", "Luồng bãi xe hoàn tất với quyết định rõ ràng, an toàn và có thể truy vết." ]
]
```

Do not mention internal IDs, raw card values, credentials, tokens, embeddings, or model secrets.

- [ ] **Step 3: Correct runner and README descriptions**

Change `run-demo.mjs` console copy from `OpenAI TTS` to `Edge TTS`. Document:

- parking-only scenes and three-factor requirement;
- `node-edge-tts`/network prerequisite, current Vietnamese voice, no OpenAI key;
- local `.env` credentials remain untracked and are never shown;
- `npm run demo:mvp` stages and outputs;
- reruns preserve Mongo/MinIO data and create unique demo identity/card history;
- warehouse backend is intentionally retained but absent from UI/video.

Remove stale Gate In → warehouse/dock/slip → Gate Out documentation.

Run: `node --test tests/demo-scripts/*.test.mjs && node --check scripts/demo/*.mjs`
Expected: PASS.

### Task 10: Full regression, Impeccable UI finish, and final MP4 verification

**Files:**
- Modify only concrete files identified by failing tests or the UI finish review.
- Create: `docs/reviews/2026-09-14-parking-ui-impeccable-review.md` if the Impeccable workflow requires a persistent review artifact.
- Create: `docs/reviews/2026-09-14-parking-flow-code-review.md`
- Create: `docs/verification/2026-09-14-parking-card-face-plate-flow.md`
- Output (generated/ignored): `dist/demo/MVP-Demo.mp4`

**Interfaces:**
- Consumes all previous tasks.
- Produces an independently reviewed implementation and a verified final media artifact.
- Verification report records commands, exit status, codec/resolution/duration/size, representative-frame inspection, and acceptance checklist results without credentials or raw UIDs.

- [ ] **Step 1: Run complete static/unit/contract/integration checks**

Run:

```bash
ruff check .
ruff format --check .
mypy src
pytest tests/unit/test_employee_cards.py -v
pytest tests/unit/test_gate_workflows.py -v
pytest tests/unit/test_warehouse.py -v
pytest tests/contract/test_openapi.py -v
pytest --cov=smart_gate --cov-report=term-missing
RUN_INTEGRATION=1 pytest tests/integration/test_mongo_minio.py tests/integration/test_employee_cards.py -v
python scripts/export_openapi.py
docker compose config --quiet
node --check src/smart_gate/presentation/static/assets/app.js
npm test
```

Expected: every available gate PASS. If integration infrastructure is unavailable, record it as BLOCKED rather than claiming a pass; start the specified local Compose dependencies and rerun before completion.

- [ ] **Step 2: Run the required Impeccable UI workflow**

Invoke the applicable Impeccable audit/critique/polish skills against the running employee-card page, both gate tabs, success/rejection results, history, and the `1440x900` video viewport. Preserve the existing design language. Fix material hierarchy, spacing, state clarity, overflow, focus, contrast, or responsive issues; do not reintroduce warehouse content or expand product scope.

After fixes, rerun:

```bash
node --check src/smart_gate/presentation/static/assets/app.js
node --test tests/demo-scripts/parking-ui.test.mjs
npm run demo:test
```

Expected: PASS at desktop and phone widths with no page errors.

- [ ] **Step 3: Run a code review and resolve confirmed findings**

Review the full diff for card uniqueness/races, terminal-state handling, event/barrier idempotency, privacy leakage, warehouse preservation, role/CSRF policy, UI forbidden copy, and test gaps. Save only verified findings and resolutions in `docs/reviews/2026-09-14-parking-flow-code-review.md`. Apply fixes with a failing regression test first, then rerun the affected suite.

Run: `git diff --check`
Expected: PASS; the review records no unresolved correctness/security findings.

- [ ] **Step 4: Build the complete video in one command**

Run: `npm run demo:mvp`
Expected: the pipeline ends with `MVP DEMO PIPELINE: PASS`, having run real Playwright, sanitized trace artifacts, Edge TTS, timeline-derived SRT, FFmpeg assembly, and ffprobe.

- [ ] **Step 5: Independently verify media properties**

Run: `npm run demo:verify`
Expected output reports:

```text
MVP-Demo.mp4 | 1440x900 | h264/aac | <positive duration> | <positive bytes>
```

Also run ffprobe directly without secrets:

```bash
ffprobe -v error -show_entries stream=index,codec_type,codec_name,pix_fmt,width,height -show_entries format=duration,size -of json dist/demo/MVP-Demo.mp4
```

Expected: one H.264 `yuv420p` video stream at `1440x900`, one AAC audio stream, positive duration, and positive size.

- [ ] **Step 6: Inspect representative frames and synchronized content**

Extract frames to an ignored `dist/demo/inspection/` directory at introduction, card replacement, Gate In success, safe rejection, Gate Out success, and history. Inspect them for:

- no blank/error/loading overlays;
- no warehouse/export/dock/order/QR content;
- no passwords, tokens, raw card UIDs, embeddings, or sensitive evidence;
- clear factor states and correct barrier decision;
- readable Vietnamese burned subtitles within frame bounds;
- narration/subtitle meaning matches the visible scene.

Listen through the final audio at scene transitions to verify narration is not clipped and does not overrun its timeline segment.

- [ ] **Step 7: Write the final verification report**

In `docs/verification/2026-09-14-parking-card-face-plate-flow.md`, record:

- current commit/working-tree scope and the pre-existing deleted skill file excluded from this task;
- every command from Steps 1, 2, 4, and 5 with actual result;
- final MP4 path, codecs, pixel format, dimensions, duration, and size;
- frame/audio/privacy inspection result;
- explicit confirmation that warehouse backend OpenAPI/regression tests pass while warehouse UI/video content is absent;
- each acceptance criterion from the spec marked PASS or BLOCKED with evidence.

Do not claim completion until every mandatory acceptance item is PASS and `dist/demo/MVP-Demo.mp4` has been generated and inspected.
