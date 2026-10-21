# Tiến độ React Frontend — 21/10/2026 (Hoàn tất 100% M0–M6 & Nhóm 12 — Đạt Cổng MG6 Release)

Cả 3 nhánh Kỹ thuật (Backend, Frontend, Design & A11Y) đã hoàn tất 100% các hạng mục Giai đoạn P0 (`MG1`, `MG2`), P1 (`FE-G03` Core Access `MG3`, `FE-G04` Analytics `MG4`, `FE-G05` AI Assistant `MG5`, `FE-G08` Device Settings Nhóm 12) và nghiệm thu phát hành `MG6` (Nhóm 11), vượt qua toàn bộ cổng kiểm thử đơn vị, hợp đồng, bảo mật phủ định và trình duyệt.

## Phần đã hoàn thành (100% UI, Hooks, Schemas, API Integration & Tests P0/P1)

Package `frontend/` riêng: React 19.3.1, Vite 8.3.4, TypeScript strict 5.9.3, React Router 8.5.0, Redux Toolkit 2.13.0, TanStack Query 5.104.5, Axios 1.20.0, Tailwind 4.3.3 và Zod 4.6.7.

1. **Nền tảng kiến trúc & Thiết kế (M2 Foundation — `5.1–5.9`, `6.1–6.15`, `G7`, `MG2`)**:
   - CSS semantic tokens dùng chung (`tokens.css` & `components.css`) theo chuẩn `design-taste-frontend-v1`: High-Craft Light Surface (`#F8FAFC` / `#FFFFFF`) kết hợp **Light Liquid Glass Sidebar** (`rgba(255, 255, 255, 0.78)`, `backdrop-filter: blur(20px) saturate(180%)`, viền kính phản xạ `inset -1px 0 0 rgba(255, 255, 255, 0.75)`), kiến trúc lưới kỹ thuật phẳng, font Geist/Geist Mono tiếng Việt (`tabular-nums`), chống tràn ngang `320px–360px` và hỗ trợ `prefers-reduced-motion`.
   - Bộ React Bits / Tactile UI Primitives tái sử dụng tại `src/shared/ui/`: `SpotlightCard` (cập nhật biến CSS `--mouse-x`/`--mouse-y` trực tiếp qua DOM ref ngoài vòng lặp state React), `SegmentedTabs` (hỗ trợ điều hướng bàn phím WAI-ARIA `ArrowLeft`/`ArrowRight`/`Home`/`End`), `DecryptedText` (mã định danh/request-id/version `tabular-nums` hỗ trợ `prefers-reduced-motion`), và `Badge` mở rộng `tone="info"` kèm `pulse` indicator.
   - `AppShell` + `AuthLayout` / `ListPageLayout` / `DetailPageLayout` / `WorkspaceLayout`, một `routeRegistry` với lazy-loaded pages cho toàn bộ 13 route nghiệp vụ.
   - `DataTable` sticky header, `DataTablePagination`, `DataTableFilter`, `EvidenceViewer` tự động dọn dẹp `URL.revokeObjectURL`, `AsyncBoundary` & State helpers (`EmptyState`, `ErrorState`, `ForbiddenState`, `OutcomeUnknownState`), Modal & Toast hosts.
   - RAM-only token storage, single-flight 401 refresh interceptor, `BroadcastChannel` multi-tab sync, scoped `QueryClient` và serializable Redux store.

2. **Xác thực Auth v2 & Quản trị RBAC (`FE-G01`, `FE-G02` — Tasks `2.1–4.9`, `7.2–7.6`, `MG1`)**:
   - **Auth v2 & Đổi mật khẩu bắt buộc (`7.2`)**: `ChangePasswordModal`, `changePasswordSession`, `loginSessionV2`, `refreshSessionV2`, `logoutSessionV2`, `getPrincipalV2` tích hợp trong `RootLayout` và `AuthProvider`; tự động khóa thao tác nghiệp vụ khi `must_change_password === true` và không áp dụng nhầm bộ lọc prompt AI lên mật khẩu hợp lệ (`FE-NEG-03`).
   - **Quản trị Users / Roles / Audit (`7.3–7.6`)**: `UsersPage`, `RolesPage`, `AuditPage`, `PermissionEditor` (tính selection diff, tự động chọn dependency), `UserDetail`, `UserForm`, `UserStatusModal`, `UserRoleModal`, `PasswordResetModal`, `RoleDetail`, `RoleForm`, `AuditDetail` khớp 100% với 17 endpoints `/api/v1/admin/*`.

3. **Nghiệp vụ Cốt lõi & Cổng kiểm soát (`FE-G03` — Tasks `7.1`, `7.7–7.13`, `8.1–8.17`, `8.19`)**:
   - **Hồ sơ nhận diện (`7.7`) & Thẻ nhân viên RFID (`7.9`)**: `DriversPage` tích hợp CRUD hồ sơ nhận diện (`FormData` `face_image <= 10 MiB`, `JPEG/PNG/WebP`) và phân hệ `EmployeeCardsPanel` (`list/detail/issue/block/report-lost/replace`, hiển thị `card_uid_masked`, xóa UID thô khỏi RAM ngay sau khi phát hành/thay thế, yêu cầu lý do + xác nhận).
   - **Phương tiện & Ủy quyền Tài xế – Xe (`7.8`)**: `VehiclesPage` tích hợp CRUD phương tiện và phân hệ `AuthorizationsPanel` (`list/create/revoke`, kiểm tra `valid_until > valid_from`).
   - **Nhật ký cổng & Cảnh báo an ninh thời gian thực (`7.10–7.12`)**: `OverviewPage` tích hợp `GateLogDetail` (tách 3 vùng Quan sát AI, Quyết định nghiệp vụ, Chấp hành Barrier), `AlertsStreamController` & `AlertsPanel` (WS ticket v2 / WS v1, buffer 1000, dedupe out-of-order, multi-batch `after_sequence`, phát hiện `410 ALERT_HISTORY_GAP` / `4409` hiển thị banner cảnh báo thay vì báo đồng bộ đầy đủ, chống XSS).
   - **Kiểm soát phương tiện tại cổng (`VehicleGatePage` — `8.15–8.17`)**: Tích hợp `ingestCaptureBundle()` (`POST /api/v2/capture-bundles`), xác minh gói thu nhận (`CaptureBundle`) với schema `.strict()`, chuẩn hóa danh mục loại phương tiện (`VehicleTypeView`, ánh xạ legacy `sedan -> car`, chặn mở tự động với `unknown`), ghi chú rõ Cổng Ra (`EXIT`) độc lập với đơn hàng xuất kho, tích hợp `VerificationResultCard` (chỉ báo `Đã mở barrier (OPENED)` khi đồng thời `PASSED` + `permit_granted=true` + `barrier_status=OPENED`, xử lý `score=null` thành `'Chưa có điểm'` theo `FE-NEG-07`, và hỗ trợ tra cứu đối soát cùng `event_id` khi `OUTCOME_UNKNOWN`).
   - **Kiểm soát nhân viên đi bộ (`PedestrianPage` — `8.15–8.17`, `8.19`)**: 3 phân khu (Xác minh cổng đi bộ 4 yếu tố Thẻ + Khuôn mặt 1:1 + Employee Registry + Pedestrian Grant; Quản lý Danh bạ nhân viên tham chiếu `person_id` & cấp/thu hồi Quyền đi bộ; Nhật ký lượt đi bộ `/api/v1/person-access-logs` tách biệt với nhật ký xe, kèm `coverage` badge và `PersonLogEvidenceModalBody` tự thu hồi Blob URL).

4. **Thống kê hoạt động (`FE-G04` — `DashboardPage`, Tasks `9.1–9.10`)**:
   - Bộ lọc kỳ báo cáo (`from`, `to`, `timezone`, `granularity`), phương thức truy cập (`access_mode`), chiều di chuyển (`direction`).
   - Banner nguồn dữ liệu & độ phủ (`snapshot_id`, `data_as_of`, `metric_definition_version`, `coverage`, `warnings`).
   - `MetricStrip` hiển thị giá trị định dạng theo đơn vị, trạng thái `available` / `partial` / `unavailable` (tách quyền nguồn `can_person_logs` khỏi `dashboard:read` cho role `WAREHOUSE`), `sample_size`, `excluded_count`, `unavailable_reason`, `source_ref` và liên kết drilldown theo allowlist quyền.
   - `ChartPanel` kèm **Bảng dữ liệu văn bản tương đương (`ANA-07`)** có đầy đủ ngữ nghĩa trợ năng (`<table>`, `<caption>`, `<th scope="col">`).

5. **AI Assistant nội bộ (`FE-G05` — `AssistantPage`, Tasks `10.1–10.17`)**:
   - Bộ lọc bảo mật dữ liệu hạn chế tại trình duyệt & máy chủ (`inspectPromptPrivacy` — `AI-07`, `FE-NEG-03`, `FE-NEG-04`, `422 SENSITIVE_PROMPT_BLOCKED`): chặn cứng các prompt chứa mật khẩu, JWT/Bearer token, mã thẻ RFID thô (`card_uid`), CCCD/SĐT/email/biển số hoặc vector sinh trắc (`face_embedding`) trước khi gửi request.
   - Bộ phân tích khung sự kiện SSE tăng dần theo chuẩn UTF-8 (`parseSseFrames` — `10.16`): giới hạn bộ đệm `64 KiB`, loại bỏ sự kiện trùng lặp (`sequence <= lastSequence`), hiển thị đúng giai đoạn thực tế từ worker mà không giả lập phần trăm tiến độ hay lộ chuỗi suy luận ẩn.
   - Tách biệt rõ hai thao tác (`10.17`, `DOD-FE-AI-06`, `FE-NEG-05`): **Dừng theo dõi luồng (Client)** chỉ ngắt kết nối trình duyệt và giữ nguyên trạng thái đang chạy trên máy chủ, trong khi **Yêu cầu hủy báo cáo trên máy chủ** gọi `POST /api/v1/assistant/reports/{id}/cancel` (`202 CANCELED`) và chỉ hiển thị `CANCELED` khi máy chủ xác nhận.
   - Hiển thị kết quả đã kiểm chứng (`ReportResult`) với schema `.strict()` dưới dạng văn bản đã escape an toàn, phân biệt rõ `model_report` và `data_summary` (mẫu dự phòng), kèm trích dẫn `metric_refs` và tải artifact.

6. **Cấu hình thiết bị & Nhận diện (`FE-G08` — `DeviceSettingsPage`, Nhóm `12.1–12.9` — Đã hoàn tất 100%)**:
   - Hoàn thiện tích hợp API thật cho cả 6 phân hệ (`cameras`, `models`, `barriers`, `readers`, `bindings`, `history`) trong `frontend/src/features/device-settings/api.ts`, `useDeviceSettingsScreen.tsx`, `SettingsSectionPanel.tsx` và `DeviceSettingsPage.tsx`.
   - Hỗ trợ đầy đủ đọc snapshot cấu hình (`12.5`), lưu/validate/connectivity-test/apply/reconcile với `expected_version`, `reason`, `restart_required`, đối soát `operations/{operation_id}` (`12.6`), và xem lịch sử kiểm toán cấu hình đã redact (`12.7`).

## Bằng chứng đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| Backend Lint & Typecheck | Đạt (`ruff` 0 lỗi, `mypy src/smart_gate` 81 files — 0 lỗi) |
| Backend Unit/Contract/HTTP/Release-Gate Tests | **193 đạt 100%** (`pytest tests/unit tests/contract -q` — `193 passed, 0 failed`, bao gồm `tests/unit/test_m6_release_gate.py`) |
| Frontend TypeScript strict | Đạt (`tsc --noEmit` — 0 lỗi) |
| Frontend ESLint + boundaries/circular | Đạt, **250 files** (`npm run lint` + `node scripts/check-boundaries.mjs` — 0 lỗi) |
| Generated DTO vs API v1 snapshot | Đạt (`npm run api:check`) |
| Frontend Unit/Component/M6 Release Tests (Vitest) | **146 đạt 100%** (`17/17 test suites PASS`, bao gồm `frontend/tests/m6-release-gate.test.tsx` kiểm chứng `DOD-FE-AI-01..08` & `FE-NEG-01..08`) |
| Chrome Production-Preview & E2E Tests (Playwright) | **37 đạt 100%** (`37/37 tests PASS` trong `frontend/tests/browser/foundation.spec.ts` trên 6 viewports `320px` -> `1920px`: responsive, không tràn ngang `320px–360px`, drawer mobile, rail desktop, accessibility, `/console/*` vs `/api/*` routing) |
| Production build | Đạt (`npm run build`); tách chunk độc lập cho từng trang lazy-loaded |

## Trạng thái Cổng Nghiệm thu (`MG0` → `MG6` — ĐẠT 100%)

- Danh mục API & trạng thái đồng bộ: [frontend-api-gaps](contracts/frontend-api-gaps.md) · [Bàn giao Backend](contracts/backend-handoff.md) · [Ma trận Truy vết RTM](requirements-traceability.md).
- Toàn bộ các cổng **MG0, MG1, MG2, MG3, MG4, MG5, Nhóm 12 (`FE-G08`) và MG6 (Release Gate)** trong `openspec/changes/migrate-react-frontend/tasks.md` đã hoàn tất 100% (`0 unchecked tasks`).
