## Cập nhật phân công 21/10/2026

Theo quyết định mới của người dùng, team khác triển khai backend/API; apply hiện tại tập trung Frontend. M2 và các màn hình không bị chặn bởi toàn bộ M1/MG1. Tích hợp và nghiệm thu theo từng endpoint đã sẵn sàng, ghi API thiếu tại `docs/contracts/frontend-api-gaps.md`. JWT/RBAC, capture và dữ liệu thống kê vẫn phải đạt contract/kiểm tra bảo mật trước bật chức năng phụ thuộc. Các thay đổi backend đang có chưa được nghiệm thu, được giữ để bàn giao. Điều chỉnh này thay thế thứ tự chặn Frontend bởi toàn milestone backend trong các đoạn kế hoạch cũ bên dưới; không tự đánh dấu backend đã hoàn tất.

## Why

Console hiện dùng HTML/JavaScript thuần, session cookie và enum role; chưa đáp ứng giao diện React đồng nhất, JWT/RBAC, luồng nhân viên đi bộ, Dashboard và Assistant nội bộ. Cần chuyển báo cáo kiến trúc [frontend-architecture.md v1.3](../../../docs/frontend-architecture.md) (phiên bản 1.3 cập nhật 20/10/2026, đã được đưa vào Git history trên branch `TienThanh/FE` tại commit `14df58b`) thành hợp đồng và kế hoạch triển khai có thể kiểm thử, tránh tình trạng tham chiếu đến các bản phác thảo cũ hoặc gây contract drift giữa tài liệu và mã nguồn.

Ưu tiên backend chốt hợp đồng và an ninh trước khi frontend tích hợp dữ liệu thật; tuy nhiên các cấu phần giao diện độc lập (Design System, Tokens, AppShell, Primitives) được triển khai song song ngay sau khi hợp đồng M0 được phê duyệt.

## What Changes

- Contract-first: đối chiếu 44 HTTP operations và 1 WebSocket hiện có, chốt API/DTO/permissions mới, pagination, lỗi, capture ingestion và tra cứu kết quả sự kiện để reconcile timeout.
- **BREAKING**: chuyển operator auth từ session/CSRF sang access JWT + refresh cookie có rotation/revocation; version hóa login/me/WS và giữ compatibility có thời hạn, không thay ngầm client cũ.
- **BREAKING**: chuyển một role enum/user thành một role_id/user với permission catalog, system/custom roles, quản trị users/sessions/audit và protected ADMIN guards; migration bảo toàn quyền hiện hữu.
- Bổ sung registry nhân viên tham chiếu enrollment, physical access grants và API/log/evidence cho người đi bộ. Nhân viên không mặc nhiên có tài khoản vận hành.
- Chuẩn hóa xe máy/ô tô/xe tải; face 1:1 bắt buộc ở mọi luồng. Sửa edge RFID/encounter/idempotency và liên kết evidence camera đáng tin cậy; mọi lỗi xác minh/thiết bị fail-closed.
- Tạo React + TypeScript strict + Vite SPA dưới `/console`; composition, hooks theo feature, Redux Toolkit cho client state, TanStack Query cho server state và Axios cho HTTP. Chọn stable/peer dependencies và lockfile riêng trong `frontend/`.
- Dùng chung CSS tokens/components/layouts, Tailwind cho bố cục riêng; AppShell/sidebar responsive, render-prop modal host và toast host, routes/barrels/types nhất quán.
- Tích hợp API thật cho nghiệp vụ core, Users/RBAC, ảnh/file và WS resync; loading/error/forbidden/outcome_unknown phản ánh trạng thái thật, không runtime mock mode.
- Bổ sung Dashboard aggregate có nguồn/coverage và Assistant báo cáo self-hosted, read-only, có jobs/events/cancel/export, kiểm chứng số liệu/citations và quyền xuyên suốt vòng đời.
- Giữ thiết kế/API kho như extension; UI kho và temporal action recognition phát triển ở change sau. Không nối order/QR kho vào Gate Out hoặc biến extension thành điều kiện phát hành core.

Lượt propose chỉ tạo tài liệu; không sửa code, dependency ứng dụng, database hoặc đánh dấu nhiệm vụ triển khai hoàn thành.

## Capabilities

### New Capabilities

- `api-contracts`: hợp đồng API versioned, quyền, DTO/lỗi/pagination, capture và reconciliation, bàn giao backend/frontend.
- `jwt-session-auth`: JWT/refresh/CSRF, rotation, revoke, forced-password principal, WS ticket và vòng đời browser.
- `users-rbac-administration`: quản trị users/roles/catalog/sessions/audit, migration và kiểm soát nâng quyền.
- `employee-pedestrian-access`: registry nhân viên/enrollment, physical grants, xác minh đi bộ và evidence.
- `trusted-camera-vehicle-access`: ba nhóm xe, capture trust, RFID/face/plate correlation, edge và idempotent device outcomes.
- `react-console-foundation`: composition/state ownership, design system/layouts/feedback, responsive, routes/hooks/types.
- `operational-console-integration`: màn hình core tích hợp thật, auth/permissions UX, logs/evidence/alerts/realtime/cleanup.
- `operational-analytics`: aggregate đúng nghĩa, definitions/provenance/coverage, Dashboard có quyền và drilldown.
- `self-hosted-quick-reports`: model gateway nội bộ, grounded reports, jobs/stream/cancel/export và privacy.

### Modified Capabilities

Không có: `openspec/specs/` chưa có baseline được công bố. Các specs trong change `automated-smart-gate-warehouse` chưa archive không được coi là baseline hay sửa trong change này. Khi khác luồng Gate Out cũ, áp dụng quyết định core của báo cáo và ghi rõ migration, không tự đồng bộ change cũ.

## Delivery Strategy & Milestone Gates

Change áp dụng cơ chế **Umbrella Change** — giữ trọn vẹn một change tổng thể gồm 9 capabilities để bảo toàn tính toàn vẹn kiến trúc và traceability, nhưng chia tiến độ thực thi thành 7 cột mốc nghiệm thu kỹ thuật (Milestone Gates MG0–MG6) độc lập.

Cần phân biệt rõ hai cơ chế kiểm soát:
1. **Decision Gates (G1–G7)** trong `design.md`: Các cổng đồng thuận kỹ thuật và nghiệp vụ giữa các bên liên quan trước khi bắt đầu nhóm task phụ thuộc (G1: Contract/auth, G2: Permission seed, G3: Camera/edge, G4: Metric coverage, G5: Model/runtime, G6: Report lifecycle, G7: Design baseline).
2. **Milestone Acceptance Gates (MG0–MG6)**: Các cổng nghiệm thu kiểm chứng bàn giao giữa các nhóm công việc:

| Milestone Gate | Điều kiện bắt buộc nghiệm thu | Kết quả / Mở khóa cho bước sau | Trách nhiệm phê duyệt |
| --- | --- | --- | --- |
| **MG0 — Contract** | Xác nhận OpenAPI runtime của các endpoint hiện hữu; phê duyệt đặc tả versioned, payload, policy và contract tests cho các endpoint mới; đối chiếu runtime của API mới sẽ thực hiện khi triển khai xong trước khi UI tích hợp; chuẩn bị test env thật | Mở Backend M1 và song song phần FE độc lập (Design System, AppShell, Primitives, 5.1, 5.2, 6.1–6.6, 6.8–6.10) | Tech Lead + Backend Lead + FE Lead |
| **MG1 — Auth/RBAC** | JWT, refresh rotation, revocation, migration seed, audit, WS ticket vượt test bảo mật và concurrency | Mở tích hợp Auth/Admin trên Frontend (7.2–7.6) và kích hoạt auth service thật (5.5, 5.8) | Backend Lead + Security |
| **MG2 — FE Foundation** | Nền tảng frontend độc lập đạt chuẩn: React build, strict types, AppShell, design tokens, feedback hosts (modal/toast), responsive và component tests (không gồm tích hợp auth thật 5.5/5.8) | Mở tích hợp UI nghiệp vụ trên nền shell chuẩn; các task tích hợp auth thật thực hiện sau MG1 | Frontend Lead |
| **MG3 — Core Access** | Người đi bộ và 3 nhóm xe chạy API thật, CaptureBundle manifest, ACK/Edge và timeout reconciliation nghiệm thu | Core pilot vận hành thực tế tại cổng | Backend Lead + Edge/Device + Ops |
| **MG4 — Analytics** | KPI aggregate có nguồn, quyền, telemetry thật, coverage, đối chiếu khớp dữ liệu thật | Mở màn hình Dashboard vận hành | Backend Lead + Product Owner |
| **MG5 — Assistant** | Model nội bộ benchmark tiếng Việt (G5), durable jobs worker, storage/retention (G6), citations, privacy, cancel đạt | Mở tính năng AI Assistant | AI/ML Lead + Security + Ops |
| **MG6 — Release** | Regression, security DoD, thử nghiệm hiện trường 4 mode, rollback và traceability đầy đủ; nghiệm thu toàn diện phần implementation | Xác nhận hoàn thành verification, sẵn sàng merge implementation vào main và archive | Toàn bộ Stakeholders |

## Release Boundaries & Git Discipline

- **Phát hành theo từng đợt (Phased Rollout)**: Hệ thống cho phép phát hành và đưa vào sử dụng thực tế theo từng phần:
  1. *Đợt 1*: Core Access Control (Cổng xe và cổng đi bộ - sau MG3).
  2. *Đợt 2*: Operational Analytics Dashboard (sau MG4).
  3. *Đợt 3*: Self-hosted Quick Reports Assistant (sau MG5).
- **Nguyên tắc Git Lifecycle & Archive**:
  Tuân thủ nghiêm ngặt Git Discipline của dự án:
  1. *Review & commit proposal*: Toàn bộ artifacts của change được review và commit trên branch đề xuất.
  2. *Merge proposal vào main*: Đưa đề xuất đã phê duyệt lên nhánh `main` trước khi tiến hành triển khai.
  3. *Triển khai & Kiểm chứng*: Chạy `/opsx-apply`, code, unit/integration/E2E test và thu thập bằng chứng verification.
  4. *Merge implementation vào main*: Hoàn thành nghiệm thu MG6 là điều kiện tiên quyết để tạo PR/merge mã nguồn triển khai vào `main`.
  5. *Archive từ main*: Lệnh `/opsx-archive` và đồng bộ specs chỉ chạy trên `main` sau khi phần implementation đã được merge thành công. Không archive khi còn bất kỳ capability nào chưa hoàn thành kiểm chứng.

## Impact

- **Backend**: domain entities/policies/Protocol ports; application auth/authorization/access/analytics/report use cases; Mongo/MinIO/device/model adapters; presentation schemas/routers/dependencies/WS; bootstrap/config/migrations/tests. Giữ `Presentation -> Application -> Domain <- Infrastructure`.
- **Edge**: nguồn RFID, encounter/capture envelope, trusted gateway, retries và xử lý ACK. Không cam kết chọn mặt lớn nhất là người điều khiển hay suy actual crossing từ ACK.
- **Frontend mới**: Đặt tại `frontend/`, tách hoàn toàn khỏi package demo gốc; FastAPI/reverse proxy phục vụ assets `/console`, UI cũ phục vụ rollback có thời hạn. Không thay `/api`, `/ws`, `/health` bằng SPA fallback.
- **API & Bàn giao**: Dựa trên mục 10.7–10.9 và bàn giao BE-01–BE-07 tại mục 19 của báo cáo kiến trúc. Mọi endpoint/schema phải chốt ở MG0 trước khi client tích hợp.
- **Rủi ro chính**: Nâng quyền ngoài ý muốn, token/biometric egress, stale permissions trên workers/WS/reports, ghép sai evidence, tràn VRAM/RAM khi chạy model AI cục bộ và số liệu/AI output sai. Kiểm soát bằng deny-by-default, transactional invariants, revoke bền vững, capture trust, grounded aggregates, lightweight model config và negative tests.


## Bổ sung cấu hình thiết bị 21/10/2026

Người dùng yêu cầu thêm và triển khai Frontend cho Camera/Model/Barrier/Reader/Cổng-làn/History. Bổ sung trong capability `operational-console-integration` (INT-10..13), nhóm task 12. API quản trị cấu hình do team backend triển khai riêng; Frontend làm route/panels/forms bản nháp và unavailable semantics trước, không fake config/save/apply. Phần tích hợp thật theo từng endpoint vẫn pending và theo dõi FE-G08. Không mở rộng sang API điều khiển barrier hoặc thay secrets/env từ browser.
