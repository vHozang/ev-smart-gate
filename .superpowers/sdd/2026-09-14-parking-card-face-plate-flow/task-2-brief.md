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

