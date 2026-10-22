# Resume — Parking Card-Face-Plate Flow

**Ngày dừng:** 2026-09-15 02:00 ICT
**Branch:** `worktree-parking-card-face-plate-flow`
**HEAD:** `0842827` — feat: thêm VerifyParkingGateUseCase thay thế entry/exit riêng lẻ
**Tests:** 73 passed, 3 skipped

## Trạng thái hoàn thành

| Task | Trạng thái | Commit |
|------|-----------|--------|
| Task 1 | ✅ Complete | c58d8d5..dab5456 |
| Task 2 | ✅ Complete | 41aca59..5dce00f |
| Task 3 | ✅ Complete | a15fbcf |
| Task 4 | ✅ Complete | 4a78b51 |
| Task 5 | 🔶 gemini-coder done, sol-verifier pending | 0842827 |
| Task 6 | ⬜ Not started | — |
| Task 7 | ⬜ Not started | — |
| Task 8 | ⬜ Not started | — |
| Task 9 | ⬜ Not started | — |
| Task 10 | ⬜ Not started | — |

## Bước tiếp theo (đúng thứ tự)

1. **Dispatch sol-verifier cho Task 5** — review VerifyParkingGateUseCase, container rewiring, gate router, 19 tests
2. **Fix nếu sol-verifier FAIL** — fix round rồi re-review
3. **Dispatch gemini-coder cho Task 6** — Parking-only dashboard + employee-card SPA
   - Context đã chuẩn bị xong từ session trước (tất cả SPA files đã đọc, warehouse code locations đã xác định)
   - Plan chi tiết: `docs/superpowers/plans/2026-09-14-parking-card-face-plate-flow.md` lines 720-810
   - Gồm: xoá warehouse UI, thêm parking KPIs, employee-card CRUD screen, card_uid input type=password
4. **Task 7** — Unified three-factor Gate In/Gate Out SPA and history
5. **Task 8** — Real parking-only Playwright scenario
6. **Task 9** — Parking narration, subtitles, documentation
7. **Task 10** — Full regression, Impeccable UI finish, final MP4 verification
8. **Mandatory Playwright/MCP review** of running app (playwright-verifier agent)
9. **Final whole-branch code review**

## Files quan trọng

- **Plan:** `docs/superpowers/plans/2026-09-14-parking-card-face-plate-flow.md`
- **Progress ledger:** `.superpowers/sdd/2026-09-14-parking-card-face-plate-flow/progress.md`
- **Parking use case:** `src/smart_gate/application/parking_gate.py`
- **SPA (cần sửa Task 6-7):** `src/smart_gate/presentation/static/assets/app.js`
- **Container:** `src/smart_gate/bootstrap/container.py`
- **Gate router:** `src/smart_gate/presentation/routers/gates.py`

## SDD Pipeline reminder

gemini-coder implements → sol-verifier reviews → fix loop → re-review → next task

## Lưu ý kỹ thuật

- `.venv` là symlink — dùng `PYTHONPATH=".:src" .venv/bin/python` hoặc `.venv/bin/python -m pytest`
- `DESCENDING` constant from pymongo, không dùng `-1` literal
- `mask_card_uid` — không expose raw card_uid trong API responses
- Face matching: `face_matcher.matches_driver(observation, card_owner)` — KHÔNG dùng `best_match`
- Agent type cho SDD: `gemini-coder` và `sol-verifier` (KHÔNG dùng fork)
