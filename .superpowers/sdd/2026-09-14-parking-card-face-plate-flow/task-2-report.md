# Task 2 Report: Mongo employee-card persistence and atomic replacement

## Scope

Implemented `EmployeeCardDocument`, `BeanieEmployeeCardRepository`, and the
required indexes on top of the already-completed Task 1 domain/service/fake
layer, per
`.superpowers/sdd/2026-09-14-parking-card-face-plate-flow/task-2-brief.md`.

## Environment note (worktree lineage anomaly)

This worktree directory (`agent-aa482ed93326d390f`) was checked out at an
unrelated commit (`3b47750`, an unrelated demo/landing-page project) with no
`src/`, `tests/`, or `pyproject.toml`. Per instructions to work directly in
this worktree without creating a new one, I created a local branch
`task-2-employee-cards` from the real Task 1 commit `dab5456` inside this same
worktree directory (`git checkout -b task-2-employee-cards dab5456`), then
built a fresh Python 3.12 virtualenv (`.venv`) since no Python tooling existed
and the system Python was 3.9.6 (incompatible with
`requires-python = ">=3.11,<3.14"`).

Integration tests were run against the host-published MongoDB/MinIO ports
(`mongodb://localhost:27017/?directConnection=true`,
`MINIO_ENDPOINT=localhost:9000`) since the host shell is outside the
docker-compose network and cannot resolve the `mongodb`/`minio` hostnames.
Existing Docker volumes were not touched or deleted.

## TDD evidence

### Step 1 — RED: failing index test

`RUN_INTEGRATION=1 pytest tests/integration/test_employee_cards.py -k indexes -v`
failed before `EmployeeCardDocument` existed (import error / missing model).
After adding `EmployeeCardDocument` (with the four required `IndexModel`
entries, using the literal string `"ACTIVE"` in `partialFilterExpression`) and
registering it in `DOCUMENT_MODELS` right after `DriverDocument`, `test_indexes`
went GREEN, confirming both the global unique `card_uid_normalized` index and
the unique partial `driver_id` index (`partialFilterExpression == {"status":
"ACTIVE"}`).

### Step 2 — mapping + basic queries

Added `_employee_card_from_document`, `add`, `get`, `get_by_uid`,
`get_active_by_driver`, `list_by_driver`, `list_all` (sorted `-issued_at`).
`pytest tests/unit/test_employee_cards.py -v` remained GREEN throughout (all
15 existing unit tests continued passing against the in-memory fake — no fake
behavior was touched).

### Step 3 — RED: replacement/rollback/concurrency integration test

Wrote `tests/integration/test_employee_cards.py::test_issue_replace_rollback_and_concurrency`
covering:
1. issuing the first card,
2. issuing a second card marking the first `REPLACED` with bidirectional
   links and exactly one `ACTIVE` record,
3. duplicate normalized UID variants (`"ab-12-34"` vs `"ab1234"`) raising
   `CARD_UID_ALREADY_EXISTS`,
4. a deliberate `RuntimeError` raised after `cards.replace_active(...)` inside
   an outer `unit_of_work.transaction()`, asserting both the new-card insert
   and the old-card status update are rolled back,
5. two concurrent `service.replace(...)` calls (`asyncio.gather(...,
   return_exceptions=True)`) against the same active card, asserting exactly
   one `EmployeeCard` success and one `ConflictError`, and exactly one
   remaining `ACTIVE` card.

This failed as expected (`AttributeError`/`NotImplementedError`-equivalent)
before `change_active_status`/`replace_active` were implemented on
`BeanieEmployeeCardRepository`.

### Step 4 — GREEN: CAS + atomic replace_active

Implemented `change_active_status` via
`collection.find_one_and_update({"_id": card_id, "status": "ACTIVE"}, {"$set":
...}, return_document=ReturnDocument.AFTER, session=current_session())`, and
`replace_active`:
- when `expected_active_card_id is not None`: CAS-updates that old record
  (`status=ACTIVE` -> `REPLACED`, `status_reason`, `replaced_by_card_id`,
  `updated_at`) with `session=current_session()`; raises
  `ConflictError("CARD_REPLACEMENT_CONFLICT", "Thẻ đang hoạt động đã thay đổi")`
  if the CAS misses (no matching old-active document); links
  `replacement.replaces_card_id = old.id`;
- when `expected_active_card_id is None`: checks for an existing active card
  for the same driver via `find_one(..., session=current_session())` and
  raises the same conflict if one exists;
- inserts the new document with `status=ACTIVE`, `status_reason=None`,
  `replaced_by_card_id=None`, using `session=current_session()`;
- maps `DuplicateKeyError` (unique-index violations on insert) to stable
  conflict codes via `_card_conflict_from_duplicate_key` (`keyPattern ==
  {"card_uid_normalized": 1}` -> `CARD_UID_ALREADY_EXISTS`; `keyPattern ==
  {"driver_id": 1}` -> `ACTIVE_CARD_ALREADY_EXISTS`; otherwise
  `CARD_REPLACEMENT_CONFLICT`).
- No nested transaction is opened in the repository; `EmployeeCardService`
  (from Task 1) owns the `unit_of_work.transaction()` boundary.

`RUN_INTEGRATION=1 pytest tests/integration/test_employee_cards.py -v` went
GREEN, including the concurrency assertion — verified stable across 5 repeated
runs during development.

### Step 5 — full regression

`RUN_INTEGRATION=1 pytest tests/integration/test_mongo_minio.py
tests/integration/test_employee_cards.py -v` — all 3 tests PASSED (driver
encryption, MinIO storage, authorization overlap/indexes, warehouse rollback,
and the new card invariants all hold together).

## Post-implementation verification (this session)

After a `ruff format` auto-reformat of `repositories.py` (multi-line
`ConflictError`/`$set` blocks collapsed to the project's preferred single-line
style), re-ran full verification:

- `RUN_INTEGRATION=1 pytest tests/integration/test_mongo_minio.py
  tests/integration/test_employee_cards.py -v` → 3 passed.
- `pytest tests/unit -q` → 45 passed.
- **Test-layout collision found and fixed**: `tests/unit/test_employee_cards.py`
  (pre-existing, from Task 1) and the newly created
  `tests/integration/test_employee_cards.py` share the same basename. Neither
  `tests/unit/` nor `tests/integration/` had an `__init__.py`, so pytest's
  default "prepend" import mode collided on the bare module name
  `test_employee_cards` whenever both directories were collected in the same
  session (`pytest tests -q`, matching CI's `pytest --cov=smart_gate
  --cov-report=term-missing`). This is not a regression in my repository code;
  it is a test-package-layout gap exposed by the brief's exact required
  filename. Fixed by adding empty `tests/unit/__init__.py` and
  `tests/integration/__init__.py` (consistent with the existing
  `tests/__init__.py` and with `tests/unit/test_employee_cards.py`'s existing
  `from tests.fakes import ...` package-style import). After the fix:
  `pytest tests -q` → 47 passed, 3 skipped (skipped = integration tests
  without `RUN_INTEGRATION=1`); `RUN_INTEGRATION=1 pytest tests -q` → 50
  passed.
- `ruff check .` → all checks passed.
- `ruff format --check .` → the 5 Task-2-related files (`documents.py`,
  `repositories.py`, `tests/integration/test_employee_cards.py`,
  `tests/unit/__init__.py`, `tests/integration/__init__.py`) are all already
  formatted. One pre-existing, unrelated markdown doc
  (`docs/superpowers/plans/2026-09-14-parking-card-face-plate-flow.md`) was
  flagged for a code-fence formatting nit — not touched, out of scope.
- `mypy src` → fails with `numpy/__init__.pyi:737: error: Type statement is
  only supported in Python 3.12 and greater [syntax]`. Verified via
  `git stash` (temporarily setting aside all Task 2 changes and restoring
  immediately after) that this failure is **pre-existing and unrelated**: it
  reproduces identically with Task 2 changes removed. Root cause: this venv's
  numpy (2.5.3) ships stub syntax valid only under Python 3.12+, while
  `pyproject.toml` pins `mypy` to `python_version = "3.11"`; CI installs an
  actual Python 3.11 interpreter where this conflict does not arise. Ran
  `mypy` directly against the two changed source files' closest clean
  dependents (`domain/entities.py`, `domain/ports.py`) — both pass with no
  issues, and the numpy stub error occurs before mypy can analyze any file
  that transitively imports numpy, independent of my changes. This is a
  known environment limitation, not something I introduced or could safely
  fix without changing shared dependency/config outside Task 2 scope.

## Files changed

- `src/smart_gate/infrastructure/database/documents.py` — added
  `EmployeeCardDocument` (with the four required indexes, literal `"ACTIVE"`
  string in the partial filter) and registered it in `DOCUMENT_MODELS`.
- `src/smart_gate/infrastructure/database/repositories.py` — added
  `_employee_card_from_document`, `_card_conflict_from_duplicate_key`, and
  `BeanieEmployeeCardRepository` (`add`, `get`, `get_by_uid`,
  `get_active_by_driver`, `list_by_driver`, `list_all`,
  `change_active_status`, `replace_active`).
- `tests/integration/test_employee_cards.py` (new) — index verification and
  full replacement/rollback/concurrency integration test.
- `tests/unit/__init__.py` (new, empty) — fixes basename collision with
  `tests/integration/test_employee_cards.py`.
- `tests/integration/__init__.py` (new, empty) — same fix.

No warehouse-related files were modified (confirmed via `git diff --name-only`
and `git status --short`).

## Self-review checklist against the brief

- [x] Global normalized UID uniqueness — `IndexModel([("card_uid_normalized",
      ASCENDING)], unique=True)`.
- [x] At most one ACTIVE card per driver — unique partial index with literal
      `"ACTIVE"` string.
- [x] Deterministic history ordering — `list_by_driver`/`list_all` sorted
      `-issued_at` (newest first); verified in integration test
      (`[card.id for card in history] == [second.id, first.id]`).
- [x] Conditional CAS, no partial writes — `find_one_and_update` with
      `return_document=ReturnDocument.AFTER`; every write in
      `change_active_status`/`replace_active` passes
      `session=current_session()`; no nested transaction opened in the
      repository (caller/`EmployeeCardService` owns
      `unit_of_work.transaction()`).
- [x] Bidirectional links — `replacement.replaces_card_id = old.id`,
      old record's `replaced_by_card_id = replacement.id`.
- [x] `status_reason` only on the retired (old) card, never the new ACTIVE
      card — new document always inserted with `status_reason=None`.
- [x] Rollback verified — deliberate exception inside an outer transaction
      after `replace_active` rolls back both the old-record update and the
      new insert.
- [x] Concurrency verified — two concurrent replacements against the same
      active card yield exactly one success and one `ConflictError`, never
      two ACTIVE cards.

## Commit

Committed the following files only, with the required attribution trailer:
- `src/smart_gate/infrastructure/database/documents.py`
- `src/smart_gate/infrastructure/database/repositories.py`
- `tests/integration/test_employee_cards.py`
- `tests/unit/__init__.py`
- `tests/integration/__init__.py`

(Commit SHA recorded in the final response to the orchestrator.)

## Concerns / known risks

1. **Worktree lineage anomaly**: this worktree directory was originally
   checked out at an unrelated commit. I branched from the correct Task 1
   commit (`dab5456`) inside the same directory rather than creating a new
   worktree, per instructions. The orchestrator should confirm this worktree
   points at the intended branch/commit lineage going forward.
2. **Fresh `.venv` and host-network Mongo/MinIO connection strings**: no
   Python environment existed in this worktree; I created one with Python
   3.12. Integration tests were run with `directConnection=true` and
   `localhost` ports instead of the docker-compose service hostnames, since
   the host shell sits outside that network. CI (`.github/workflows/ci.yml`)
   already uses the equivalent `directConnection=true` host-based connection
   string for its own integration job, so this matches an established
   pattern, not a new one.
3. **Test basename collision (fixed)**: `tests/unit/test_employee_cards.py`
   and `tests/integration/test_employee_cards.py` shared a basename with no
   `__init__.py` in either directory, which breaks whole-suite collection
   (`pytest tests -q`, matching CI's coverage run). Fixed by adding two empty
   `__init__.py` files. This is a small, targeted, non-behavioral fix; flagging
   it explicitly since it touches test package structure beyond the brief's
   literal file list.
4. **mypy numpy/Python-version mismatch**: `mypy src` fails immediately on a
   numpy stub syntax error in this local venv (Python 3.12 numpy stubs vs.
   `python_version = "3.11"` mypy config) and never reaches the point of
   analyzing any project file. Confirmed via `git stash` that this reproduces
   identically without any Task 2 changes present, so it's a pre-existing
   local-environment limitation, not a defect introduced by this task.
   Verification was not possible for whole-`src` mypy in this session; ran
   mypy successfully against `domain/entities.py` and `domain/ports.py`
   (the closest numpy-independent related files) with no issues.
