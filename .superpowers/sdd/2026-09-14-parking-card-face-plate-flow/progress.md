# SDD ledger — plan: docs/superpowers/plans/2026-09-14-parking-card-face-plate-flow.md

Baseline: Node 18/18 PASS; Python 22 PASS, 1 SKIP; worktree branch worktree-parking-card-face-plate-flow at e59cfe8.
User verification requirement: run real-app Playwright review at 1440x900 and ~400px; inspect UI, console, network, then verify final MP4.

## Pre-flight task/interface scan

| Pair / task | Producer → consumer or internal check | Finding |
|---|---|---|
| Task 1 → Task 2 | `EmployeeCard`, `CardStatus`, repository protocol → Beanie model/repository | Consistent names and lifecycle transitions. |
| Task 1 → Task 3 | `EmployeeCardService` → HTTP card endpoints | Consistent method and DTO contracts. |
| Task 1 → Task 5 | active-card lookup/normalization → shared gate verification | Consistent fail-closed order; raw UID remains internal. |
| Task 2 → Task 3 | `BeanieEmployeeCardRepository` → container/service wiring | Consistent singleton composition. |
| Task 2 → Task 10 | transaction/index guarantees → integration verification | Exact Mongo replica-set test requirement present. |
| Task 3 → Task 6 | masked card response and routes → SPA card management | Consistent; UI never receives history raw UID. |
| Task 4 → Task 5 | audit DTO/entity fields → shared verifier persistence/output | Consistent optional defaults preserve legacy records. |
| Task 4 → Task 7 | factor fields and vehicle type → result/history rendering | Consistent field names. |
| Task 5 → Task 7 | common multipart gate contract → common SPA form | Exact fields align; Gate Out removes `slip_image`. |
| Task 5 → Task 8 | parking endpoints/results → real Playwright scenes | Consistent three-factor success and fail-closed rejection. |
| Task 6 → Task 7 | parking/card SPA structure → gate form and history | Same files shared intentionally; Task 7 builds on Task 6. |
| Task 6 → Task 8 | card UI → issue/replace demo scenes | Semantic actions and masked UID assertions specified. |
| Task 7 → Task 8 | gate UI → entry/rejection/exit demo scenes | Semantic fields and expected outcomes match. |
| Task 8 → Task 9 | ten timeline IDs → narration manifest | Exact ordered IDs and scene semantics match. |
| Task 8 → Task 10 | real Playwright artifacts → browser/video review | User-required desktop/mobile, console/network checks retained. |
| Task 9 → Task 10 | Edge TTS/SRT pipeline → final H.264/AAC MP4 | Exact output and ffprobe checks align. |
| Task 1 | Tests vs implementation and files | Internally consistent; TDD order explicit. |
| Task 2 | Tests vs atomic repository semantics | Internally consistent; concurrency and rollback covered. |
| Task 3 | API contract vs wiring | Internally consistent; warehouse API remains mounted. |
| Task 4 | Legacy compatibility vs expanded audit fields | Internally consistent; old fields default safely. |
| Task 5 | Gate semantics vs tests/router | Internally consistent; all failures fail closed. |
| Task 6 | Warehouse UI removal vs backend preservation | Internally consistent; Python warehouse routes untouched. |
| Task 7 | Three-factor display vs API fields | Internally consistent; no aggregate-status inference. |
| Task 8 | Real demo vs privacy sanitizer | Internally consistent; raw card UID is redacted. |
| Task 9 | Narration vs current TTS engine | Internally consistent; explicitly corrects stale OpenAI copy. |
| Task 10 | Review/verification vs acceptance criteria | Internally consistent; Playwright, Impeccable and media inspection mandatory. |

Ruling: Task commits are permitted only inside this isolated implementation branch because the user selected the Subagent-Driven execution method, whose review boundaries depend on task commits; no push, merge, or original-checkout mutation is permitted — if this interpretation is wrong, the cost is reversible local history only.
Ruling: The plan says Python 3.11–3.13 and uses `python` in commands; this worktree has Python 3.12 at `.venv/bin/python`, so every native Python command will use `.venv/bin/*` — if wrong, the cost is environment-only re-execution.
Ruling: The environment has no usable CodeGraph index despite a resume notice; follow the MCP result and use task briefs/review packages plus source reads, without initializing an index — if wrong, the cost is less semantic indexing, mitigated by per-task and final review.

Task 1 review: spec compliant, quality has 4 Important findings requiring fix round.
Ruling: The brief-mandated mask formula exposes a valid 4-character UID, conflicting with the spec privacy requirement; reveal no suffix when normalized length is 4 and add regression coverage — if wrong, the cost is less operator-visible card differentiation for shortest UIDs.
Task 1: fix round 1/5 started (4 open — shortest UID masking leak; untested CAS conflicts; repository-owned link invariant undocumented/unverified; retirement reason copied to active replacement; fix base c58d8d5).
Task 1: minor (deferred): service uniqueness precheck is TOCTOU; Task 2 unique index is authoritative.
Task 1: minor (deferred): fake add does not enforce UID uniqueness; Task 2 persistence tests must cover it.
Task 1: minor (deferred): production history tie-breaking must be deterministic in Task 2.
Task 1: minor (deferred): DTO metadata dict aliases entity metadata.
Task 1: minor (deferred): raw entity return must be masked at Task 3 response boundary.
Task 1: fix round 1/5 (4 addressed, 0 open — shortest UID masking; CAS tests; linking contract; retirement reason; commits c58d8d5..dab5456).
Task 1: complete (commits 8717930..dab5456, review clean).
Task 2 review: spec noncompliant and quality blocked by 4 Important findings.
Task 2: fix round 1/5 started (4 open — raw Mongo WriteConflict; cold-pool concurrency test false green; inconsistent active-card race code; CAS not scoped to driver; fix base 41aca59).
Task 2: minor (deferred): history sorting needs deterministic secondary `_id`.
Task 2: fix round 1/5 (4+1 addressed — WriteConflict mapping; warm-pool test; error code consistency; CAS driver_id scope; deterministic sort; commits 41aca59..5dce00f).
Task 2: review 2/5 FAIL — 1 finding: mypy error from int literal in compound sort; fixed inline with DESCENDING constant, amend at 5dce00f.
Task 2: complete (commits 8717930..5dce00f, review clean after inline fix).
Task 3: gemini-coder complete (commit a15fbcf — 6 card endpoints, schemas, wiring, contract test, router unit tests, openapi.json).
Task 3: sol-verifier review dispatched, awaiting result.
Task 4: gemini-coder dispatched (parking audit fields in GateLog/DTO/mappings).
Task 4: gemini-coder complete (commit 430c61e — 7 audit fields in GateLog/Document/DTO/mappings, legacy direction pass-through, factor-audit test).
Task 4: sol-verifier FAIL — 1 Important: ParkingGateVerificationInput missing from dto.py (plan requires it in Task 4 scope). Fixed inline, amend at 4a78b51.
Task 4: complete (commits a15fbcf..4a78b51, review clean after inline fix).
Task 3: sol-verifier findings: Finding 1 already resolved (openapi.json in amend). Finding 2 (contract test depth) minor — deferred.
Task 3: complete (commits 8717930..a15fbcf, review clean).
Task 5: gemini-coder dispatching.
Task 5: gemini-coder complete (commit 0842827 — VerifyParkingGateUseCase, container rewiring, gate router card_uid, 19 parking tests, contract tests, fakes enhancement, openapi.json regen; 73 passed, 3 skipped).
Task 5: sol-verifier pending — dispatch tomorrow.
