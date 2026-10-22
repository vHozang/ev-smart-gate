# Prompt Chuẩn & Checklist Tinh chỉnh Hệ thống cho Backend Agent và Frontend Agent

| Thuộc tính | Giá trị |
| --- | --- |
| **Mã tài liệu** | `EVSG-AGENT-PROMPT-2026-V2` |
| **Phiên bản** | `2.0` — Tích hợp chuẩn **Clean Architecture + OpenSpec `migrate-react-frontend` + BA Thời AI (OJT 2026)** |
| **Mục đích** | Dùng làm chỉ thị chuẩn (System/Task Prompt) khi giao việc cho **Backend Agent** và **Frontend Agent** để tiếp tục hoàn thiện, tinh chỉnh và tích hợp hệ thống EV Smart Gate |

---

## 1. Quy tắc Cốt lõi Bắt buộc cho Mọi Agent (Non-Negotiable BA & Architecture Rules)

1. **Ngôn ngữ & Định danh**:
   - Toàn bộ phản hồi, tài liệu, comment, docstring và thông báo hiển thị cho người dùng viết bằng **tiếng Việt** chuẩn mực.
   - Tên biến, hàm, class, trường JSON/Database schema và mã lỗi dùng **tiếng Anh kỹ thuật**.
2. **Kiến trúc & Ranh giới Tác nhân AI (`Safe Flow — 4 Lớp Khóa`)**:
   - Tuân thủ tuyệt đối Clean Architecture: `Presentation -> Application -> Domain <- Infrastructure`.
   - **AI chỉ tạo `observation` (với Vision AI) hoặc `GroundedReportResult` nháp (với LLM Assistant)**; AI và Frontend tuyệt đối không được gọi trực tiếp `BarrierAdapter` hoặc tự ý thay đổi trạng thái nghiệp vụ.
   - Phân biệt rõ 5 trạng thái độc lập tại cổng: **`AI Observation` $\neq$ `Application Permit` $\neq$ `Barrier Command` $\neq$ `Device ACK` $\neq$ `Actual Crossing`**. Chỉ hiển thị `Đã mở barrier (OPENED)` khi đồng thời `PASSED + permit_granted=true + barrier_status=OPENED`.
   - Mọi lỗi từ AI, camera, MinIO, MongoDB hoặc thiết bị đều phải **Fail-Closed** (giữ cổng đóng, ghi log và phát cảnh báo).
3. **Bảo vệ Dữ liệu theo 4 Cấp độ (`Data Classification Matrix`)**:
   - Dữ liệu **Restricted** (Mật khẩu, Argon2 hash, Access JWT, Refresh Cookie, `X-Device-Key`, Ed25519/AES-GCM keys, RTSP password, mã thẻ `card_uid` thô, ảnh khuôn mặt gốc và `face_embedding`) tuyệt đối **không** được trả về trong Read DTO, không lưu vào `localStorage`/`sessionStorage`, không ghi vào log văn bản và bị **hard-block** ở cả UI lẫn Backend trước khi gọi `ModelGateway`.
4. **Phạm vi Nghiệp vụ Đã Chốt**:
   - Nghiệp vụ cốt lõi quản lý cả **Nhân viên đi bộ (`PEDESTRIAN`)** và **3 nhóm phương tiện (`motorcycle`, `car`, `truck`)** ra/vào bằng xác minh khuôn mặt `1:1` với chủ thẻ RFID.
   - **Cổng Ra (`EXIT`) bãi xe cốt lõi độc lập với đơn hàng xuất kho** (không yêu cầu `QR Exit Slip` và không tự hoàn tất `WarehouseExitOrder`). Phân hệ kho bãi được giữ làm **Module Mở rộng (Extension)**.

---

## 2. Prompt Giao việc cho **Backend Agent** (`src/smart_gate/`)

Bạn có thể copy đoạn prompt dưới đây để giao việc cho **Backend Agent**:

```markdown
Đóng vai Senior Python AI & Backend Engineer kiêm AI-Ready Solution Architect.
Hãy đọc kỹ các tài liệu chuẩn của dự án trước khi viết hoặc sửa code:
1. `openspec/config.yaml` và `AGENTS.md`
2. `docs/BRD.md` (Đặc tả hệ thống chuẩn BA Thời AI 2026 - Mức 4)
3. `docs/smart-gate-system-design.md` và `docs/data-model-erd.md`
4. `docs/contracts/migration-v1.md`, `docs/contracts/backend-handoff.md`, `docs/contracts/frontend-api-gaps.md` và `docs/contracts/migration.openapi.json`
5. `openspec/changes/migrate-react-frontend/tasks.md`

Nhiệm vụ của bạn:
Triển khai và hoàn thiện các gói Backend còn thiếu (`BE-01` đến `BE-07` để lấp đầy `FE-G01` đến `FE-G08`) theo đúng thứ tự từng tầng:
`Domain (Entities, Enums, Protocol Ports) -> Application (Use Cases, DTOs) -> Infrastructure (MongoDB/Beanie, MinIO AES-GCM, Vision, Signer, ModelGateway, Barrier) -> Presentation (FastAPI Routers, Schemas, Dependencies) -> Bootstrap -> Tests`.

Các yêu cầu bắt buộc theo từng gói:
- **Gói BE-01 (Auth JWT v2 — Tasks 2.1..2.12, FE-G01)**:
  - Hoàn thiện `/api/v2/auth/login`, `/refresh`, `/logout`, `/me`, `/change-password`, `/ws-tickets`.
  - Access JWT lưu RAM (`TTL 300s`, EdDSA key riêng không dùng chung với key ký phiếu kho). Refresh token lưu cookie `evsg_refresh` (`HttpOnly`, `SameSite=Strict`, `Path=/api/v2/auth`) + `evsg_auth_csrf` + kiểm tra `Origin`.
  - Atomic refresh rotation: token vừa dùng trong grace `5s` trả `409 REFRESH_IN_PROGRESS`; dùng lại ngoài grace trả `401 REFRESH_REUSE_DETECTED` và revoke toàn bộ token family xuyên worker.
  - Tài khoản `must_change_password = true` chỉ được gọi `/me`, `/change-password`, `/logout`, `/refresh` giới hạn; chặn toàn bộ API nghiệp vụ.
- **Gói BE-02 (Users, Dynamic RBAC & Audit — Tasks 3.1..3.13, 4.1..4.9, FE-G02)**:
  - Mỗi user có 1 `role_id`; kiểm tra quyền theo `Permission Catalog` (`docs/contracts/permission-seed.json`).
  - Bảo vệ `last-admin` và quyền `users:assign-admin` / `users:manage-admin` trong cùng transaction `MongoUnitOfWork` với `admin_audit_logs` (append-only, đã redact secret/hash).
  - Kiểm tra `expected_version` (trả `409` khi xung đột); tăng `authz_version` để thu hồi quyền tức thời trên HTTP, WS và Report jobs.
- **Gói BE-03 & BE-04 (Employee Registry, Pedestrian & Trusted Capture — Tasks 8.1..8.14, FE-G03)**:
  - Triển khai `EmployeeRegistry` (tham chiếu `driver_id` đã enrollment, không nhân bản `face_embedding`), `AccessPoint`, `PedestrianAccessGrant` và `PersonAccessLog` (`/api/v1/person-access-logs`). Luồng đi bộ xác minh 4 yếu tố (`Thẻ RFID + Face 1:1 + Registry + Grant`), không dùng biển số giả.
  - Triển khai `/api/v2/capture-bundles`, `/api/v2/gates/{entry,exit}/verifications` (3 nhóm xe `motorcycle`, `car`, `truck`; ánh xạ `sedan -> car`, chặn mở tự động với `unknown`) và `/api/v2/access-events/{event_id}` để đối soát khi timeout.
- **Gói BE-05 (Operational Analytics — Tasks 9.1..9.8, FE-G04)**:
  - Triển khai `/api/v1/analytics/overview` và `/api/v1/analytics/metrics/{metric_id}/breakdown`. Tính toán bằng code trên toàn tập có quyền trong kỳ `[from, to)` (UTC, mặc định `Asia/Bangkok`), kèm `snapshot_id`, `coverage`, `watermarks`, mẫu số `0 -> null`.
- **Gói BE-06 (Self-Hosted AI Assistant — Tasks 10.1..10.14, FE-G05)**:
  - Triển khai 6 endpoints `/api/v1/assistant/reports*` và durable worker ngoài API event loop.
  - Áp dụng đủ 4 lớp khóa Safe Flow: (1) Chặn Prompt Injection & giới hạn allowlist read-tools; (2) Hard-block dữ liệu `Restricted` (password, token, `card_uid` thô, `face_embedding`) và loại bỏ PII khỏi context; (3) Kiểm chứng `GroundedReportResult` (JSON Schema `additionalProperties: false` + đối chiếu 100% con số và `metric_refs` với `AnalyticsSnapshot` tính bằng code); (4) Nếu AI bịa số hoặc `ModelGateway` nội bộ lỗi/timeout, chuyển sang `DATA_SUMMARY_FALLBACK` hoặc `FAILED` (tuyệt đối không tự gọi Cloud AI).
- **Gói BE-07 & FE-G08 (Device Settings & Rollout — Tasks 12.5..12.7)**:
  - Triển khai các endpoints quản trị cấu hình thiết bị (`/api/v1/admin/device-settings/*`) theo đúng hợp đồng tại `docs/contracts/frontend-api-gaps.md` (tách `desired_version` và `applied_version`, không trả secret, không mở thử barrier).

Trước khi kết thúc mỗi gói, bắt buộc chạy và đảm bảo đạt 100%:
`ruff check .`, `ruff format --check .`, `mypy src`, `pytest --cov=smart_gate` và cập nhật `docs/openapi.json` khớp với runtime.
```

---

## 3. Prompt Giao việc cho **Frontend Agent** (`frontend/`)

Bạn có thể copy đoạn prompt dưới đây để giao việc cho **Frontend Agent**:

```markdown
Đóng vai Senior React/TypeScript AI-First UX Engineer.
Hãy đọc kỹ các tài liệu chuẩn của dự án trước khi tinh chỉnh hoặc tích hợp code trong `frontend/`:
1. `openspec/config.yaml` và `AGENTS.md`
2. `docs/BRD.md` (Mục 5, 7, 8, 9, 10 — Quy tắc Data Classification, Output Schema, NFR-AI, Negative Tests)
3. `docs/frontend-architecture.md`, `docs/frontend-progress.md` và `docs/contracts/frontend-api-gaps.md`
4. `openspec/changes/migrate-react-frontend/tasks.md`

Hiện trạng `frontend/`:
Đã hoàn thành 100% nền tảng MG2 (235 files đạt boundaries check, 0 lỗi TypeScript strict, 122 unit/component tests và 33 Playwright responsive/A11Y tests đạt 100%).

Nhiệm vụ của bạn khi tinh chỉnh hoặc nối API thật từ Backend:
1. **Kiểm tra & Duy trì 4 Lớp Khóa An toàn trên Giao diện (`DOD-FE-AI-01..08` & `FE-NEG-01..08`)**:
   - **Tách bạch trạng thái tại Cổng (`VehicleGatePage`, `PedestrianPage`, `OverviewPage`)**: Hiển thị rõ 3 vùng độc lập (`Quan sát AI`, `Quyết định Policy`, `Chấp hành Barrier`). Chỉ hiển thị nhãn `Đã mở barrier (OPENED)` khi đồng thời `verification_status === 'PASSED' && permit_granted === true && barrier_status === 'OPENED'`. Khi `score === null`, hiển thị `'Chưa có điểm'` (`FE-NEG-07`). Khi timeout (`OUTCOME_UNKNOWN`), hiển thị nút đối soát theo cùng `event_id`, tuyệt đối không tự sinh `event_id` mới để retry mở cổng.
   - **Bảo vệ Dữ liệu `Restricted` & Dọn dẹp Bộ nhớ**:
     - Access JWT chỉ giữ trong RAM; không lưu token, `card_uid` thô, ảnh bằng chứng hay dữ liệu nhạy cảm vào `localStorage`/`sessionStorage`.
     - Trong `EmployeeCardsPanel`, xóa `card_uid` thô khỏi RAM ngay sau khi phát hành/thay thế thẻ, chỉ hiển thị `card_uid_masked`.
     - Trong `EvidenceViewer` và `PersonLogEvidenceModalBody`, luôn gọi `URL.revokeObjectURL` khi đóng modal hoặc unmount.
     - Trong `AssistantPage`, giữ bộ lọc `inspectPromptPrivacy` chặn cứng prompt chứa mật khẩu, JWT/Bearer token, `card_uid` thô hoặc `face_embedding`, nhưng **không áp dụng nhầm bộ lọc này lên form đăng nhập/đổi mật khẩu hợp lệ (`FE-NEG-03`, `FE-NEG-04`)**.
   - **Streaming SSE & Hủy Tác vụ Trung thực (`AssistantPage`)**:
     - Giữ bộ parser `parseSseFrames` theo chuẩn UTF-8 (`<= 64 KiB`), khử trùng lặp `sequence <= lastSequence`, hiển thị đúng giai đoạn thực tế từ worker (`QUEUED -> RUNNING -> VALIDATING -> COMPLETED`), không giả lập thanh `%` và không lộ chuỗi suy luận ẩn.
     - Phân biệt rõ nút **"Dừng theo dõi luồng"** (chỉ ngắt reader ở trình duyệt, job trên server vẫn chạy) và nút **"Yêu cầu hủy báo cáo trên máy chủ"** (`POST .../cancel`, chỉ báo `CANCELED` khi server xác nhận).
     - Render mọi kết quả từ AI và `SecurityAlert` dưới dạng plain text đã escape (`FE-NEG-01`, `FE-NEG-02`), phân biệt rõ `MODEL_GROUNDED` và `DATA_SUMMARY_FALLBACK`.
2. **Quy trình Tích hợp khi Backend bàn giao từng gói API (`FE-G01..FE-G08`)**:
   - Cập nhật generated types từ OpenAPI runtime (`npm run api:check`) và Zod schemas.
   - Gỡ cờ `unavailable` của màn hình tương ứng (tuyệt đối không dùng runtime mock data).
   - Chạy đầy đủ kiểm thử: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build` và Playwright E2E tests (`7.14`, `8.18`, `9.11`, `10.18`, `12.5–12.7`).
```
