# Task 1 Implementation Report: Employee-card domain and lifecycle service

Status: DONE_WITH_CONCERNS
Commits: `d5703ca3873fc303997b92c97703e054e50a7f4a` (initial),
`2012eb413318ab11a52798ab4e86f8aaa35403d4` (fix round 1)
Branch: `task-1-employee-cards` (in worktree `/Users/vhozang/ev-smart-gate/.claude/worktrees/agent-aa59e7d2286268df4`)

See "Fix round 1" at the end of this report for the verifier-finding evidence.

## Report location note

The requested report path was
`/Users/vhozang/ev-smart-gate/.claude/worktrees/parking-card-face-plate-flow/.superpowers/sdd/2026-09-14-parking-card-face-plate-flow/task-1-report.md`,
but worktree isolation blocks me from writing into the sibling worktree. This report is
written to the same relative path inside my own worktree. The orchestrator should copy it
across along with the commit.

## Worktree / branch note (read this first)

The worktree I was invoked in was checked out at `origin/main` (`3b47750`), which does
**not** contain the Python codebase at all — no `src/`, no `tests/`, no `pyproject.toml`.
The parking-flow branch content lives at commit `8717930` ("docs: add parking flow
implementation plan").

To work in my own isolated worktree as instructed, I created a local branch
`task-1-employee-cards` from `8717930` and committed there. The commit therefore sits on
a branch that the orchestrator must merge/cherry-pick into
`worktree-parking-card-face-plate-flow`. No other worktree was created and no subagents
were dispatched.

There is no `.venv` in my worktree, so I used the interpreter at
`/Users/vhozang/ev-smart-gate/.claude/worktrees/parking-card-face-plate-flow/.venv/bin/*`
as instructed. Verified it resolves my local sources, not the sibling worktree's:
`smart_gate.__file__` -> `/Users/vhozang/.../agent-aa59e7d2286268df4/src/smart_gate/__init__.py`,
and pytest reports `rootdir: /Users/vhozang/.../agent-aa59e7d2286268df4`.

## Files changed

Created:
- `src/smart_gate/application/cards.py` — `EmployeeCardService`
- `tests/unit/test_employee_cards.py` — 10 lifecycle tests

Modified:
- `src/smart_gate/domain/enums.py` — added `CardStatus`
- `src/smart_gate/domain/entities.py` — added `EmployeeCard` dataclass
- `src/smart_gate/domain/services.py` — added `normalize_card_uid`, `mask_card_uid`
- `src/smart_gate/domain/ports.py` — added `EmployeeCardRepository` protocol
- `src/smart_gate/application/dto.py` — added `IssueEmployeeCardInput`,
  `ReplaceEmployeeCardInput`, `ChangeEmployeeCardStatusInput`
- `tests/fakes.py` — added `EmployeeCardRepositoryFake`; made
  `DriverRepositoryFake.list_active()` and `VehicleRepositoryFake.list_active()` filter
  `RecordStatus.ACTIVE`
- `tests/unit/test_domain_services.py` — added the 3 parametrized normalization cases and
  the masking test verbatim from the brief

All values from the brief were used verbatim: enum members, dataclass field order and
defaults, DTO field constraints, protocol signatures, the `_change_status` helper body,
error codes (`CARD_UID_INVALID`, `CARD_NOT_FOUND`, `CARD_STATUS_INVALID`,
`CARD_UID_ALREADY_EXISTS`, `CARD_REPLACEMENT_CONFLICT`), and the default replacement
reason `"Cấp thẻ mới thay thẻ đang hoạt động"`.

## Tests added

`tests/unit/test_domain_services.py` (4 new cases):
- `test_normalize_card_uid` x3 (` ab-12 34 `, `AB:12:34`, `ab1234` -> `AB1234`)
- `test_mask_card_uid_never_returns_the_raw_uid`

`tests/unit/test_employee_cards.py` (10 cases, exactly the names in the brief):
- `test_issue_first_card_for_active_driver`
- `test_issue_normalizes_uid_and_rejects_short_normalized_uid`
- `test_issue_rejects_missing_or_inactive_driver`
- `test_duplicate_uid_is_rejected`
- `test_issue_over_active_card_atomically_marks_old_replaced_and_links_history`
- `test_replace_requires_the_selected_card_to_be_active`
- `test_block_active_card_preserves_history`
- `test_report_lost_active_card_preserves_history`
- `test_terminal_card_cannot_change_status_again`
- `test_list_for_driver_is_newest_first`

The replacement test asserts all seven required conditions from the brief verbatim
(status, `replaces_card_id`, old `REPLACED`, `replaced_by_card_id`, `get_by_uid(old)`,
`get_active_by_driver == replacement`, `list_by_driver` length 2).

## RED evidence

Step 1 — `pytest tests/unit/test_domain_services.py -k card_uid -v`:

```
tests/unit/test_domain_services.py:10: in <module>
    from smart_gate.domain.services import (
E   ImportError: cannot import name 'mask_card_uid' from 'smart_gate.domain.services'
ERROR tests/unit/test_domain_services.py
!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
=============================== 1 error in 0.10s ===============================
```

Step 2 — `pytest tests/unit/test_employee_cards.py -v`:

```
collecting ... collected 0 items / 1 error
tests/unit/test_employee_cards.py:7: in <module>
    from smart_gate.application.cards import EmployeeCardService
E   ModuleNotFoundError: No module named 'smart_gate.application.cards'
ERROR tests/unit/test_employee_cards.py
!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
=============================== 1 error in 0.05s ===============================
```

Both failures match the brief's predicted failure modes.

## GREEN evidence

Step 3 — `pytest tests/unit/test_domain_services.py tests/unit/test_employee_cards.py -v`:

```
collected 19 items
... all PASSED ...
============================== 19 passed in 0.18s ==============================
```

Full non-integration suite — `pytest tests -q -m "not integration and not e2e and not real_model"`:

```
36 passed, 1 deselected in 0.98s
```

Run after the `list_active` fake change specifically to confirm no existing test
(including warehouse tests) regressed. None did.

## Static checks

`ruff check src/smart_gate/domain src/smart_gate/application/cards.py tests/unit/test_employee_cards.py tests/fakes.py`
-> `All checks passed!`

`ruff format --check src tests` -> `77 files already formatted`

`mypy src/smart_gate/domain src/smart_gate/application/cards.py` -> **pre-existing
environment failure**, unrelated to this task:

```
.venv/lib/python3.12/site-packages/numpy/__init__.pyi:737: error: Type statement is only
supported in Python 3.12 and greater  [syntax]
Found 1 error in 1 file (errors prevented further checking)
```

Confirmed pre-existing by running mypy against an untouched module I did not modify
(`src/smart_gate/application/warehouse.py`) — identical error. Cause: `pyproject.toml`
sets `python_version = "3.11"` while the installed numpy stubs use 3.12-only `type`
statement syntax. With the interpreter's actual version:

`mypy --python-version 3.12 src/smart_gate/domain src/smart_gate/application/cards.py`
-> `Success: no issues found in 7 source files`

So my code is type-clean; the 3.11 failure is an environment/config issue that predates
Task 1. I did not change `pyproject.toml` since that is outside Task 1 scope.

Step 5 — `git diff --check` -> exit 0, no whitespace errors. `git status --short` listed
only the 9 planned files. (The brief mentioned a "pre-existing deleted skill file"; that
deletion is not present on the `8717930` tree I branched from, so nothing extra appeared.)

## Self-review findings

1. **Formatting fix caught by self-review.** My first commit (`42127ed`) passed
   `ruff check` but would have failed CI's `ruff format --check .` (a step the brief's
   Step 4 does not include) on `async def block`. I found this by reading
   `.github/workflows/ci.yml`, fixed it, and amended my own unpushed commit. Final SHA
   is `d5703ca`.

2. **Raw UID handling.** `EmployeeCardService` never logs or prints `card_uid`; it has no
   logger at all. Raw UID is stored on the entity solely for lookup, per the brief.
   `mask_card_uid` normalizes before masking, so `mask_card_uid("ab-12-34") == "••••1234"`
   and the raw/normalized form is never embedded in the output.

3. **`issue` unifies both paths through `replace_active`.** When the driver has no active
   card, `expected_active_card_id=None` and `replace_active` returns
   `(replacement, None)`, creating the first card. When one exists, the same atomic call
   marks it `REPLACED` and links both directions. This avoids a second code path and
   makes the no-card and has-card races both detectable by the repository.

4. **Duplicate-UID check ordering.** `_validate_new_uid` validates length before
   uniqueness, so `"--a-b--"` raises `CARD_UID_INVALID` rather than a confusing lookup
   miss. The uniqueness check is a read-then-write and is therefore advisory in the
   service layer; the real guarantee must be a unique index in Task 2's persistence
   layer (see concerns).

5. **`list_for_driver` newest-first tie-breaking.** Cards issued inside the same test run
   can share a `datetime.now(UTC)` value at microsecond resolution. I sort by
   `(issued_at, storage_index)` descending so ordering is deterministic rather than
   dependent on clock granularity. Production ordering should ultimately come from the
   database sort; this is the correct behavior for the in-memory fake either way.

6. **Driver validation follows existing convention.** `warehouse.py:75` already treats
   missing-or-inactive driver as `NotFoundError("DRIVER_NOT_FOUND", ...)`. I matched that
   rather than inventing a `DRIVER_INACTIVE` code, so the test asserts `DRIVER_NOT_FOUND`
   for both the missing and inactive cases.

7. **Warehouse behavior untouched.** No changes to `application/warehouse.py`,
   `gate_entry.py`, `gate_exit.py`, order state machine, or slip logic. The only shared
   change is the two `list_active()` fakes, which the brief explicitly requires; all
   warehouse tests still pass.

8. **`_EPOCH` is timezone-aware** (`datetime.min.replace(tzinfo=UTC)`) so comparisons
   against timezone-aware `issued_at` values cannot raise on naive/aware mismatch.

## Concerns

1. **Branch placement requires orchestrator action.** The commit is on
   `task-1-employee-cards` branched from `8717930`, not on
   `worktree-parking-card-face-plate-flow`, because my assigned worktree was checked out
   at `origin/main` which lacks the entire Python codebase. This is the highest-priority
   item for the orchestrator to reconcile.

2. **Uniqueness is not yet enforced at the storage layer.** `CARD_UID_ALREADY_EXISTS`
   currently relies on a service-level read-then-write and is racy under concurrency.
   Task 2 must add a unique index on the normalized UID and surface duplicate-key errors
   as the same code.

3. **`replace_active` conflict semantics live in the fake.** The fake raises
   `ConflictError("CARD_REPLACEMENT_CONFLICT", ...)` on a stale expected-active ID. The
   real repository in Task 2 must reproduce this contract (conditional update on the
   expected active card, inside a transaction) or the race protection is fake-only.
   No test currently forces a genuine concurrent race.

4. **`mypy src` per CI will still fail** on the pre-existing numpy-stub/`python_version`
   mismatch. Someone should decide whether to bump `python_version` to 3.12 or pin numpy
   stubs, but that is out of Task 1 scope and I deliberately left `pyproject.toml` alone.

5. **`mask_card_uid` is defined but not yet consumed.** Nothing in Task 1 returns cards
   over an API. Tasks that add list/history/gate-log responses must actually call it;
   the "never expose raw UID" guarantee is currently only convention plus the unit test,
   not enforced by a serialization boundary.

6. **`metadata` dict is stored by reference** from the DTO onto the entity. Pydantic
   gives each validated payload its own dict, so this is safe in practice, but a caller
   reusing one DTO instance across two `issue` calls would share the dict. Not exercised
   by any test.

---

# Fix round 1/5 — verifier findings

Commit: `2012eb413318ab11a52798ab4e86f8aaa35403d4`
All four IMPORTANT findings addressed. Files changed in this round:

- `src/smart_gate/domain/services.py` — `mask_card_uid` short-UID behavior (finding 1)
- `src/smart_gate/domain/ports.py` — `replace_active` + `change_active_status` contract
  docstrings (finding 3)
- `src/smart_gate/application/cards.py` — retirement reason no longer copied to the new
  ACTIVE card (finding 4)
- `tests/unit/test_domain_services.py` — 4-char masking regression assertions (finding 1)
- `tests/unit/test_employee_cards.py` — CAS conflict tests, contract helper, broken-repo
  proof, reason-ownership tests (findings 2, 3, 4)

`tests/fakes.py` was deliberately **not** changed this round.

## Finding 1 — mask_card_uid leaked a legal 4-character UID

Root cause: `"••••" + normalized[-4:]` returns the entire UID when the normalized form is
exactly 4 characters, i.e. `mask_card_uid("ab12") == "••••AB12"`. Since the DTO minimum is
`min_length=4`, a legal shortest UID was fully exposed.

Fix in `src/smart_gate/domain/services.py`:

```python
normalized = normalize_card_uid(card_uid)
if len(normalized) <= _MASK_SUFFIX_LENGTH:
    return _MASK_PREFIX
return _MASK_PREFIX + normalized[-_MASK_SUFFIX_LENGTH:]
```

Longer UIDs keep the masked last four. Added
`test_mask_card_uid_hides_every_character_of_a_short_uid` (parametrized over `ab12`,
`a-b-1-2`, ` AB:12 `, `ab1`, `a-b`) which asserts the result is exactly `"••••"`, that the
normalized value is not a substring, and that *no individual character* of the normalized
UID appears in the output. Also added
`test_mask_card_uid_reveals_at_most_the_last_four_of_a_long_uid` to lock the long-UID path
(`"ab-12-34-56"` -> `"••••3456"`, and `"AB12"` absent).

RED evidence (before the fix), `pytest tests/unit/test_domain_services.py -k mask_card_uid -q`:

```
.FFFFF.                                                                  [100%]
>       assert masked == "••••"
E       AssertionError: assert '••••AB12' == '••••'
E         - ••••
E         + ••••AB12
...
E       AssertionError: assert '••••AB1' == '••••'
E       AssertionError: assert '••••AB' == '••••'
5 failed, 2 passed, 8 deselected in 0.12s
```

The `'••••AB12' == '••••'` line is the leak reproduced directly.

GREEN after fix: `pytest tests/unit/test_domain_services.py -q` -> `15 passed in 0.07s`.

## Finding 2 — CAS conflict branches now have executable tests

Two focused subclass stubs of `EmployeeCardRepositoryFake` in
`tests/unit/test_employee_cards.py`:

- `_LosingStatusCasRepositoryFake.change_active_status` always returns `None`, simulating a
  lost compare-and-set.
- `_ConcurrentReplacementRepositoryFake.replace_active` inserts a different ACTIVE card for
  the same driver immediately before delegating, so the expected-active-ID check is stale.
  `race_on_call` selects which call is raced (1-based), letting a test set up the first card
  normally and only race the later `replace`.

Three new tests, all asserting `CARD_REPLACEMENT_CONFLICT`:

- `test_change_status_conflict_when_cas_loses_the_race` — both `block` and `report_lost`
  raise it, and additionally asserts the card is left untouched (`status` still `ACTIVE`,
  `status_reason` still `None`), so a service that mutated before checking would fail.
- `test_replace_conflict_when_active_card_changed_concurrently` — `replace` raises it, and
  asserts the replacement was not persisted (`get_by_uid("CD5678") is None`).
- `test_issue_conflict_when_active_card_appears_concurrently` — covers the `issue` path
  where a card appears concurrently for a driver the service saw as having none
  (`expected_active_card_id=None` becomes stale); asserts no partial write.

## Finding 3 — replacement linking is now an explicit protocol obligation

Added a docstring to `EmployeeCardRepository.replace_active` in
`src/smart_gate/domain/ports.py` enumerating six binding requirements: CAS on the active
card with `ConflictError("CARD_REPLACEMENT_CONFLICT", ...)` and no writes on mismatch; old
card set to `REPLACED` with reason and `updated_at`; bidirectional linking
(`old.replaced_by_card_id` / `replacement.replaces_card_id`); replacement stored `ACTIVE`
with the reason belonging to the old card; old record preserved for history; all-or-nothing.
Also documented `change_active_status` (ACTIVE-only CAS, returns `None` rather than raising,
mapped by the Application layer to `CARD_REPLACEMENT_CONFLICT`).

Strengthened the tests with a shared `_assert_replacement_contract` helper used by both the
`issue`-over-active and `replace` tests. Beyond the brief's seven assertions it checks:
`replacement.replaced_by_card_id is None`, `replacement.status_reason is None`,
`old.updated_at is not None`, both UIDs still resolvable via `get_by_uid`, and that the
links point at the correct opposite card rather than at themselves.

To prove the assertions have teeth rather than merely restating the fake,
`test_replace_active_contract_is_violated_by_a_non_linking_repository` runs the service
against `_NonLinkingRepositoryFake` (stores the replacement, skips retiring and linking) and
requires `_assert_replacement_contract` to raise `AssertionError`.

Independent mutation check: I temporarily deleted the line
`current.replaced_by_card_id = replacement.id` from
`EmployeeCardRepositoryFake.replace_active` in `tests/fakes.py` and reran:

```
FAILED tests/unit/test_employee_cards.py::test_issue_over_active_card_atomically_marks_old_replaced_and_links_history
FAILED tests/unit/test_employee_cards.py::test_issue_over_active_card_keeps_reason_on_the_retired_card_only
FAILED tests/unit/test_employee_cards.py::test_replace_requires_the_selected_card_to_be_active
3 failed, 12 passed in 0.13s
```

A deliberately broken linking repository does fail the suite. `tests/fakes.py` was then
restored; confirmed by `git status --short`, which does not list it among this round's
modified files.

## Finding 4 — retirement reason no longer copied onto the new ACTIVE card

`issue` and `replace` both passed `status_reason=payload.status_reason` into the new
`EmployeeCard`, so the reason for retiring the *old* card was duplicated onto the new active
one. Removed that argument from both constructors (the value is still forwarded to
`replace_active` as the old card's retirement reason) and added clarifying comments.

RED evidence (before the fix):

```
        assert old.status_reason == "Thẻ cũ bị cong"
>       assert replacement.status_reason is None
E       AssertionError: assert 'Thẻ cũ bị cong' is None
...
        assert old.status_reason == "Thẻ bị gãy"
>       assert replacement.status_reason is None
E       AssertionError: assert 'Thẻ bị gãy' is None
3 failed, 12 passed in 0.18s
```

Tests updated/added: `test_issue_over_active_card_atomically_marks_old_replaced_and_links_history`
and `test_replace_requires_the_selected_card_to_be_active` now assert
`replacement.status_reason is None` via the shared contract helper; new
`test_issue_over_active_card_keeps_reason_on_the_retired_card_only` supplies an explicit
`status_reason` on `issue` and asserts it lands on the retired card only;
`test_issue_first_card_for_active_driver` now asserts `card.status_reason is None`.

## Fix round 1 verification commands

```
pytest tests/unit/test_domain_services.py -k mask_card_uid -q   -> 5 failed, 2 passed  (RED, finding 1)
pytest tests/unit/test_employee_cards.py -q                     -> 3 failed, 12 passed (RED, findings 2-4)
pytest tests/unit/test_employee_cards.py tests/unit/test_domain_services.py -q
                                                                -> 30 passed in 0.14s (GREEN)
pytest tests -q -m "not integration and not e2e and not real_model"
                                                                -> 47 passed, 1 deselected in 0.78s
ruff check src tests                                            -> All checks passed!
ruff format --check src tests                                   -> 77 files already formatted
mypy --python-version 3.12 src/smart_gate/domain src/smart_gate/application/cards.py
                                                                -> Success: no issues found in 7 source files
git diff --check                                                -> exit 0, no whitespace errors
```

Test count went from 36 to 47 passing (11 new: 6 masking, 5 lifecycle/CAS/contract).

Two lint items surfaced during this round and were fixed before committing: `ruff check`
flagged `I001` on `services.py` (blank-line spacing around the new module constants, fixed
via `ruff check --fix`), and `ruff format --check` flagged `ports.py` spacing after the new
docstrings (fixed via `ruff format`). Both are formatting-only.

`mypy src/smart_gate/domain` under the configured `python_version = "3.11"` still fails on
the pre-existing numpy-stub issue described earlier in this report; unchanged by this round
and reproducible on untouched modules.

## Concerns after fix round 1

1. **Branch placement still requires orchestrator action** (unchanged, highest priority).
   Both commits sit on `task-1-employee-cards` branched from `8717930`, because the assigned
   worktree was checked out at `origin/main` which contains no Python code.

2. **Report path** — still written inside my own worktree because isolation blocks writes to
   the `parking-card-face-plate-flow` worktree.

3. **CAS guarantees remain fake-level.** The new tests prove the *service* maps conflicts to
   `CARD_REPLACEMENT_CONFLICT` and that the contract assertions catch a broken repository,
   but Task 2's real MongoDB repository must actually implement the documented
   `replace_active` contract (conditional update inside a transaction) and the unique index
   on the normalized UID. The docstring is now the specification for that work.

4. **`mask_card_uid` masking policy is now stricter than "last four".** For UIDs of exactly
   4 normalized characters the output carries no identifying suffix at all, so UI/API
   consumers cannot disambiguate two short UIDs from the masked form alone. This is the
   correct security tradeoff but worth knowing before building card-list screens; consider
   showing an issue date or card id prefix alongside the mask.

5. **`mypy src` per CI still fails** on the pre-existing `python_version = "3.11"` vs numpy
   3.12-stub mismatch. Out of Task 1 scope; `pyproject.toml` left untouched.

6. **`mask_card_uid` still has no production caller.** Enforcement at a serialization
   boundary remains future work for the API tasks.
