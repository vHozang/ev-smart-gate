## 1. M0 - Contract và bàn giao backend trước client

- [ ] 1.1 Đối chiếu runtime routers/Pydantic/OpenAPI với 44 HTTP + 1 WS trong báo cáo; lập inventory API giữ/sửa/mới và compatibility/version matrix. (API-01)
- [ ] 1.2 Chốt G1 auth contract: login/me/refresh/logout/change-password, errors, claims/lifetime/idle/absolute expiry, cookie/Origin/CSRF và deprecation client session cũ. (JWT-01/02/05/08)
- [ ] 1.3 Chốt rotation/retry/mất response/multi-tab policy và WS ticket/expiry/revoke contract; có examples concurrency không lộ tokens. (JWT-03/06/07)
- [ ] 1.4 Chốt DTO/API admin users/roles/catalog/sessions/audit theo mục 10.7 và G2 permission matrix/target guards/expected_version; tách quyền mới khỏi baseline migration. (RBAC-01..08)
- [ ] 1.5 Chốt employee/enrollment mapping, access points/grants, pedestrian/log/evidence và vehicle-types contracts theo mục 10.9; không plate/User/HR data giả. (PED-01..07, CAM-01)
- [ ] 1.6 Chốt G3 ingest/verify versioned CaptureBundle, source/binding/ROI/freshness/max-skew, idempotency namespace/fingerprint/retention và lookup/reconciliation paths/schema. (API-04, CAM-03..07)
- [ ] 1.7 Chốt hai analytics và sáu report API theo mục 10.8: typed filters/metric metadata, jobs/events/cancel/download/expiry và owner-domain permission rules. (ANA-01..06, AI-01..08)
- [ ] 1.8 Công bố list pagination/filter/search/cursor/coverage, unsupported behavior, errors/X-Request-ID, multipart/upload limits, bytes/Content-Type và realtime sequences/resync retention. (API-02/03/05)
- [ ] 1.9 Chuẩn bị test environment FastAPI/DB/storage thật, test accounts theo role, dữ liệu tổng hợp cô lập, migration/rollback deliverables và contract check commands; ghi chủ sở hữu/đầu ra G1–G7. (API-06)
- [ ] 1.10 Nghiệm thu Milestone Gate MG0 — Contract: Đối chiếu và phê duyệt OpenAPI runtime của các endpoint hiện hữu; phê duyệt đặc tả versioned, payload, policy và contract tests cho các endpoint mới (đối chiếu runtime của API mới sẽ thực hiện khi triển khai xong trước khi UI tích hợp); chuẩn bị môi trường test thật; mở khóa Backend M1 và song song các task Frontend độc lập (5.1, 5.2, 6.1–6.6, 6.8–6.10). (API-01..06)

## 2. M1 - JWT backend theo Domain -> Application -> Infrastructure -> Presentation -> Bootstrap -> Tests

Nhóm 2–4 cùng thuộc milestone M1. Hoàn thành domain/ports 2.1, 3.1 và 4.1 trước các application tasks phụ thuộc; phối hợp adapters theo Protocol đã chốt. Các unit tests chạy theo use case; integration tests JWT/RBAC/WS ở 2.12, 3.13 và 4.7–4.8 chỉ nghiệm thu sau khi bootstrap cả nhóm 2–4 sẵn sàng. UI foundation độc lập (5.1, 5.2, 6.1–6.6, 6.8–6.10) có thể làm song song từ MG0; tích hợp auth/admin thật (7.2–7.6) chỉ bắt đầu sau gate 4.9 (MG1).

- [ ] 2.1 Domain: mô hình auth session/token family, version/expiry/revoke và restricted principal; khai báo Protocol ports cho credential/session/clock/token service, tách keys/claims phiếu kho. (JWT-01/02/04/05)
- [ ] 2.2 Application: login/access principal use case kiểm tài khoản và permission version, không tin client claims. (JWT-01)
- [ ] 2.3 Application: refresh rotation/reuse use case atomic theo concurrency/retry policy đã chốt ở 1.3. (JWT-02/03)
- [ ] 2.4 Application: logout/revoke-session use cases cập nhật durable state và invalidation contracts. (JWT-04)
- [ ] 2.5 Application: change-password và forced-password restricted scope, xử lý phiên tạm/phiên mới theo contract. (JWT-05)
- [ ] 2.6 Infrastructure: Mongo session/family repositories, unique indexes/CAS/transaction cho rotate/revoke, chỉ lưu hash credential. (JWT-02/03/04)
- [ ] 2.7 Infrastructure: JWT sign/verify adapter và auth key config, algorithm/issuer/audience/expiry checks; clock/skew có kiểm soát. (JWT-01)
- [ ] 2.8 Infrastructure: durable authz/session-version resolver cùng notifier/outbox/invalidation xuyên worker; storage là nguồn xác nhận khi cache không tin cậy. (JWT-04)
- [ ] 2.9 Presentation: versioned auth DTO/routes/dependencies và cookie/Origin/CSRF errors đúng 1.2, bao gồm auth/me limited principal. (JWT-01/02/05/08)
- [ ] 2.10 Bootstrap: inject adapters, validate auth secrets/lifetime/origin/cookie config, không expose keys cho frontend hoặc dùng lại slip signing context. (JWT-01/02)
- [ ] 2.11 Tests: unit từng use case login/refresh/logout/revoke/change-password; invalid algorithms/audience, expiry/reuse/race/mất response/forced-password và fail-closed resolver. (JWT-01..05)
- [ ] 2.12 Tests: integration nhiều workers và browser reload/multi-tab policy; logout khi refresh pending không phục hồi credentials; ghi evidence contract/compatibility. (JWT-03/04/07/08)

## 3. M1 - Users và RBAC backend theo layer

- [ ] 3.1 Domain: Role/Permission catalog, một role_id/user, grantable/target policy và protected ADMIN/last-admin invariants; khai báo repository/authorization/audit/UoW Protocol ports. (RBAC-01/02/04/05)
- [ ] 3.2 Application: list/detail/create user với normalized unique username, role assignment guards ngay khi tạo và read DTO không secret. (RBAC-03/04)
- [ ] 3.3 Application: update profile/status/role use cases riêng, payload allowlist/reason/expected_version, last-admin concurrency. (RBAC-03..05)
- [ ] 3.4 Application: password reset và session metadata/revoke-all use cases, target ADMIN policy và must-change/revocation; không giả email delivery. (RBAC-07)
- [ ] 3.5 Application: role create/update/archive và replace permission set với catalog dependencies/protected/system/assigned-role guards. (RBAC-01/05/06)
- [ ] 3.6 Application: append-only audit và query filters/cursor, success audit atomic với sensitive mutation, actor/time từ server và diff redact. (RBAC-08)
- [ ] 3.7 Infrastructure: user/role/catalog/audit repositories, indexes, UoW/CAS/transaction và version propagation đến mọi user của role. (RBAC-03..08)
- [ ] 3.8 Infrastructure: viết migration enum -> stable role_id, seed baseline ADMIN/WAREHOUSE/SECURITY, đối chiếu tập quyền trước/sau và rollback additive. (RBAC-01)
- [ ] 3.9 Presentation: admin user/profile/status/role/reset/sessions routes và DTO/error/permissions theo 1.4, không mass-assignment fields. (RBAC-03/04/07)
- [ ] 3.10 Presentation: roles/catalog/audit routes và versioned me effective permissions/authz_version/must_change_password. (RBAC-06/08)
- [ ] 3.11 Bootstrap: inject policies/adapters/seed catalog; không tự tạo lại hoặc khôi phục ADMIN đã quản trị thay đổi trái policy. (RBAC-01/05)
- [ ] 3.12 Tests: unit từng use case, permission dependency/unknown code, mass assignment, protected ADMIN create/reset, expected_version, last-admin race và role còn gán. (RBAC-01..07)
- [ ] 3.13 Tests: integration migration không tăng quyền cũ; audit failure rollback mutation, redact secrets, đổi permission role revoke mọi users/workers. (RBAC-01/06/08)

## 4. M1 - Authorization toàn bộ entry points và WS backend

- [ ] 4.1 Domain: xác định mapping permission/action/resource và device scopes độc lập cho mọi HTTP/evidence/file/WS, không suy physical grants từ RBAC. (RBAC-02)
- [ ] 4.2 Application: ticket issuance/one-time consumption và connection authorization lifecycle, scope/channel/expiry/revalidation. (JWT-06)
- [ ] 4.3 Infrastructure: WS ticket store/atomic consume và revoke fan-out cho live connections, không giữ quyền cũ đến hết JWT TTL. (JWT-04/06)
- [ ] 4.4 Presentation: thay hardcoded enum guards của API hiện có bằng equivalent permission policy, giữ state machine/device scope; bao gồm ảnh/slip và không mở thêm quyền cũ. (RBAC-02)
- [ ] 4.5 Presentation: ticket API/WS handshake, auth close/error codes và alerts REST sequence contract; redact ticket/credentials khỏi logs. (API-05, JWT-06)
- [ ] 4.6 Bootstrap: compatibility flag/cutoff cho session cũ và JWT, bảo đảm cả hai dùng cùng active/version/permission policy. (JWT-08)
- [ ] 4.7 Tests: unit ticket/state policy và integration allow/deny/IDOR mọi entry point, replay ticket/sai channel, revoke giữa stream trên nhiều workers. (JWT-04/06, RBAC-02)
- [ ] 4.8 Tests: xác nhận auth/RBAC backend gate đạt OpenAPI/contract/migration checks trước mở UI quản trị; ghi những API mới chưa sẵn sàng. (API-06)
- [ ] 4.9 Nghiệm thu Milestone Gate MG1 — Auth/RBAC: Xác nhận toàn bộ domain/application/infrastructure/presentation auth JWT, refresh rotation, revocation, role migration, audit và WS ticket vượt kiểm thử an ninh/concurrency/integration; mở khóa tích hợp Auth/Admin trên Frontend (7.2–7.6). (JWT-01..08, RBAC-01..08)

## 5. M2 - Frontend package, types, transport và state foundation

*Phụ thuộc*: 5.1 và 5.2 có thể bắt đầu ngay sau MG0 song song với M1. Tasks 5.3, 5.4, 5.6, 5.7 thuộc nền tảng foundation độc lập. Tasks 5.5 và phần tích hợp endpoint auth thật của 5.8 phụ thuộc Backend Auth sẵn sàng (sau MG1), không dùng để chặn nghiệm thu Foundation MG2.

- [ ] 5.1 Tạo frontend/ React + TypeScript strict + Vite package riêng; xác minh stable/peer dependencies React Router/Redux Toolkit/Query/Axios/RHF/Zod/Tailwind/UI/test tooling và tạo lockfile, không đổi package demo gốc. Có thể làm sau MG0 song song với M1. (FE-01)
- [ ] 5.2 Khai báo dependency boundaries app/layouts/pages/widgets/features/shared; alias/lint/test config thống nhất và commands typecheck/lint/build/test. Có thể làm sau MG0 song song với M1. (FE-02/04)
- [ ] 5.3 Sinh DTO từ OpenAPI đã đối chiếu M0/M1; thêm runtime schemas, mapper lỗi/X-Request-ID và nullable/enum/binary type handling, kiểm contract drift. Bắt đầu sau MG0 và cập nhật khi backend M1 hoàn thành. (API-01/02, FE-08)
- [ ] 5.4 Tạo Axios transport với timeout/AbortSignal/JSON/FormData/blob, không tự đặt multipart boundary, không toast tại transport. (API-02, FE-01/07)
- [ ] 5.5 Tạo auth service RAM và lifecycle generation guards/bootstrap; interceptor single-flight/đa tab theo contract, tối đa một safe replay, không refresh 403 hoặc loop auth endpoints. Chuẩn bị logic nền tảng ở M2, tích hợp endpoint auth thật sau MG1. (JWT-07, INT-02)
- [ ] 5.6 Thiết lập QueryClient/query-key conventions/invalidation và identity/authz-version scoping; không persist cache nhạy cảm hay copy lists/me sang Redux. (FE-01, ANA-06)
- [ ] 5.7 Thiết lập Redux store/typed hooks cho preferences/workspace/auth lifecycle serializable; URL/local/form ownership, không callbacks/Blob/tokens/controllers trong store. (FE-01)
- [ ] 5.8 Tạo root providers và logout/revoke cleanup orchestration cho query/auth/realtime/feedback/media, chặn late response sau đổi identity. Cấu trúc providers hoàn thành ở M2, hoàn thiện tích hợp luồng auth thật sau MG1. (JWT-07, INT-08)
- [ ] 5.9 Tests: unit/contract Axios DTO/schema/errors/FormData/bytes, malformed payload và auth concurrency/stale-response; fixtures chỉ trong tests cô lập. (API-02, FE-08)

## 6. M2 - CSS, composition, layout, routes và feedback dùng chung

*Phụ thuộc*: Tasks 6.1–6.6, 6.8–6.10 có thể thực hiện ngay sau MG0 song song với M1 để hoàn thiện Design System, layout và primitives.

- [ ] 6.1 Chốt G7 semantic tokens/palette/font tiếng Việt/breakpoints/motion và baseline screenshots theo design skill, shared CSS ưu tiên yêu cầu người dùng. Có thể làm sau MG0 song song với M1. (FE-03)
- [ ] 6.2 Tạo một stylesheet entry và layers tokens/base/components/layouts/motion; ánh xạ Tailwind vào cùng variables, không page theme/hex overrides tùy ý. Có thể làm sau MG0 song song với M1. (FE-03)
- [ ] 6.3 Tạo primitives Button/Field/Input/Select/Badge/EmptyState/ErrorState/Skeleton với typed variants, focus/disabled/loading/error CSS chung. Có thể làm sau MG0 song song với M1. (FE-02/03)
- [ ] 6.4 Tạo shared DataTable/filter/pagination/evidence viewer wrappers với internal scroll, dài/nullable content và resource cleanup. Có thể làm sau MG0 song song với M1. (FE-03/05)
- [ ] 6.5 Tạo AuthLayout/AppShell/ListPageLayout/DetailPageLayout/WorkspaceLayout bằng slots/children/outlet, shell không remount khi chuyển trang. Có thể làm sau MG0 song song với M1. (FE-02/05)
- [ ] 6.6 Tạo sidebar expanded/rail/mobile drawer cùng topbar/breadcrumb, active state/aria/tooltip/Escape/focus restore, preferences không nhạy cảm. Có thể làm sau MG0 song song với M1. (FE-05)
- [ ] 6.7 Tạo route registry/helpers/guards và named lazy page entry index.ts, không eager barrel mọi pages; kiểm alias/circular/deep imports. (FE-04)
- [ ] 6.8 Tạo FeedbackProvider/ModalHost/ModalShell với renderContent/renderFooter typed lifecycle, portal/focus/scroll/size, một blocking modal. Có thể làm sau MG0 song song với M1. (FE-06)
- [ ] 6.9 Tạo Notice/Confirm/Form/Detail/Evidence modal compositions với dirty/pending/double-submit guards, giữ form khi lỗi và không auto-open từ refetch. Có thể làm sau MG0 song song với M1. (FE-06)
- [ ] 6.10 Tạo ToastHost/useFeedback variants/queue/dedupe/pause/dismiss/live region, feature sở hữu feedback kết quả và lỗi bền tại vùng liên quan. Có thể làm sau MG0 song song với M1. (FE-07)
- [ ] 6.11 Tạo common async/render boundaries và loading/empty/error/forbidden/outcome_unknown components, không expose raw exception hoặc progress giả. (INT-07)
- [ ] 6.12 Tạo public index.ts/named exports/export type cho mỗi component/layout/page; custom hook screen contracts data/state/actions và shared hook boundaries. (FE-02/04/08)
- [ ] 6.13 Tests: component keyboard/focus/dirty/pending/toast-dedupe và layout/route/lazy-chunk/circular checks; kiểm reduced motion/theme không đổi theo page-load order. (FE-03..07)
- [ ] 6.14 Tests: responsive foundation tại 320/360/768/1024/1440/1920, zoom 200%, keyboard/nội dung dài/landscape; lưu baseline cho every-page QA sau. (FE-05)
- [ ] 6.15 Nghiệm thu Milestone Gate MG2 — FE Foundation: Xác nhận nền tảng frontend độc lập đạt chuẩn: React package, TypeScript strict, Vite build, AppShell, design tokens, feedback hosts (modal/toast), responsive layout và component tests đạt chuẩn (các tác vụ tích hợp auth thật 5.5 và 5.8 sẽ kiểm thử sau MG1); mở khóa tích hợp giao diện nghiệp vụ. (FE-01..09)

## 7. M3 - Tích hợp auth, quản trị và dữ liệu core bằng API thật

*Phụ thuộc*: Tasks 7.2–7.6 chỉ bắt đầu sau khi đạt MG1 (Backend Auth/RBAC sẵn sàng) và nền tảng giao diện từ MG2. Tasks 7.7–7.10 sử dụng các API core hiện có.

- [ ] 7.1 Tạo feature API/query/runtime mapper modules cho các API auth/admin/dữ liệu hiện có đã sẵn sàng sau M1; không component gọi URL tùy tiện hoặc runtime mock mode. API mới nhóm8–10 được tích hợp sau backend tương ứng. (INT-01, FE-08)
- [ ] 7.2 Tích hợp Login/bootstrap/forced change-password/logout UI với auth service thật, protected routes và useAuthorization từ me permissions. Bắt đầu sau MG1 và MG2. (INT-02, JWT-05/07)
- [ ] 7.3 Tích hợp Users list/detail/profile/status CRUD qua hooks/forms/modals chung, filter/cursor/version/conflict, không request secrets. Bắt đầu sau MG1 và MG2. (INT-03, RBAC-03)
- [ ] 7.4 Tích hợp gán role/reset password/session list/revoke-all với target/reason/confirmation và principal/query invalidation sau response. Bắt đầu sau MG1 và MG2. (INT-03, RBAC-04/07)
- [ ] 7.5 Tích hợp Roles permission editor/system guards/catalog read-only, selection diff/expected_version/409, không cấp quyền optimistic. Bắt đầu sau MG1 và MG2. (RBAC-05/06, FE-06)
- [ ] 7.6 Tích hợp Audit list/detail filters/cursor/redacted diffs, không chức năng sửa/xóa audit. Bắt đầu sau MG1 và MG2. (RBAC-08)
- [ ] 7.7 Tích hợp Driver enrollment/list/detail/forms theo API hiện có, giữ Driver/User khác nghĩa và không giả registry/HR; Employee API/mapping mới tích hợp tại 8.15 sau 8.11–8.14. (PED-01/02, INT-03)
- [ ] 7.8 Tích hợp Vehicle CRUD và driver–vehicle authorizations theo API đã sẵn, lookups theo quyền; catalog legacy/unknown mới tích hợp tại 8.15 sau backend 8.11–8.14. (CAM-01, INT-03)
- [ ] 7.9 Tích hợp employee cards issue/block/report-lost/replace, UID mask/reason/confirmation và invalidation đúng identity/card. (INT-03)
- [ ] 7.10 Tích hợp vehicle gate-log/evidence hooks/viewers theo API đã có, auth blob/Content-Type/cleanup và supported filters/coverage thật; person-log API mới tích hợp tại 8.19. (INT-05)
- [ ] 7.11 Tạo alerts WS client theo ticket contract, subscribe/buffer/snapshot merge/dedupe/out-of-order/gap/multi-batch REST resync và bounded backoff/buffers; kiểm thử client khi backend báo gap để giao diện không hiển thị trạng thái "đã đồng bộ đầy đủ". (INT-06)
- [ ] 7.12 Tích hợp Alerts list/detail/status actions và inbox/badge, feedback gom nhóm/dedupe, lỗi event chỉ ảnh hưởng vùng liên quan. (INT-06, FE-07)
- [ ] 7.13 Tích hợp System health theo live/ready thực tế, scope DB readiness rõ, không giả camera/GPU/model status. (INT-05)
- [ ] 7.14 Tests: integration/E2E FastAPI/DB/storage test thật cho auth/admin/master data/cards/logs/alerts, quyền direct-link/IDOR/revoke và 409/422/network states. (INT-01..09)

## 8. M3 - Nhân viên đi bộ, camera/edge và tích hợp cổng

*Phụ thuộc*: Backend/Edge đi từ 8.1 đến 8.14. Frontend 8.15–8.19 chỉ bắt đầu sau khi Backend/Edge nhóm 8 và contract tương ứng hoàn thành.

- [ ] 8.1 Domain: EmployeeRegistry/PedestrianAccessGrant/access-point invariants, references enrollment và Protocol ports, không sao chép embedding/User. (PED-01..03)
- [ ] 8.2 Domain: CaptureBundle/EventIdentity scope-fingerprint, vehicle catalog/mapping và factor/permit/command/ACK outcome types. (CAM-01..04/06/07)
- [ ] 8.3 Application: employee onboarding/update/recovery use cases, employee_code unique/version/audit/idempotency hoặc compensation khi nhiều bước. (PED-01/02)
- [ ] 8.4 Application: access-point list và grant create/read/revoke/deactivate policy; final policy recheck trước device command khi grant thay đổi trong inference. (PED-03/05)
- [ ] 8.5 Application: pedestrian entry/exit verify thẻ+face1:1+registry+grant, logs/evidence/lookup, không plate/vehicle/order giả. (PED-04/06/07)
- [ ] 8.6 Application: trusted ingest/verify validators và vehicle verify association/freshness/ambiguity/replay, face bắt buộc ba nhóm xe, không bypass legacy/manual. (CAM-02..04)
- [ ] 8.7 Application: atomic event reservation/dedupe với immutable binding/fingerprint, command correlation và lookup reconciliation theo quyền, không side effect lặp. (API-04, CAM-06/07)
- [ ] 8.8 Infrastructure: Mongo employee/grant/access-point/event/capture repositories/indexes/UoW và private evidence manifest/storage; giữ lịch sử không xác định với coverage. (PED-01..07, CAM-03/08)
- [ ] 8.9 Infrastructure: authenticated device/gateway capture adapter và calibration/clock/ROI config, hash/integrity/binding kiểm server, không tin metadata browser. (CAM-03/04)
- [ ] 8.10 Infrastructure: sửa edge RFID card_uid thật, trigger/presence/encounter/debounce, stable retry event, bỏ slip_image exit core, bounded retry theo loại lỗi. (CAM-05)
- [ ] 8.11 Presentation: employee/grants/access-points, vehicle-types, pedestrian/log/evidence, ingest/verify và lookup DTO/routes versioned đúng M0 và permissions/device scope. (API-04, PED-01..07, CAM-01..08)
- [ ] 8.12 Bootstrap: inject core ports/vision/device gateway, migration mapping legacy/unknown, capture strict-policy config và features không phụ thuộc kho. (CAM-01..04)
- [ ] 8.13 Tests: unit mọi use case nhân viên/grants/verify/ingest/idempotency/reconcile, duplicate/fingerprint conflict/concurrency/deactivate trước command và errors fail-closed. (PED-01..07, CAM-01..08)
- [ ] 8.14 Tests: edge/backend contract thật không 422 thiếu card_uid, bốn mode/ROI/multiple faces/mũ/kính/stale/replay/skew/mismatch/ACK sai device và timeout; lưu acceptance gaps hiện trường. (CAM-02..08)
- [ ] 8.15 Frontend: sau backend 8.11–8.14, tích hợp Employee registry/Driver mapper, access-point/grant UI, onboarding recovery/version và vehicle-types catalog/legacy/unknown; hooks theo feature, tái dùng forms nhóm7. (PED-01..03/05, CAM-01, INT-03)
- [ ] 8.16 Frontend: tích hợp vehicle/pedestrian workspaces và camera capture hook theo trusted bundle contract, không tự dựng metadata đáng tin hoặc gọi barrier. (CAM-02..05, INT-04/08)
- [ ] 8.17 Frontend: result factor/observation/permit/command/ACK tách biệt, timeout outcome_unknown + lookup cùng event, không retry mù hoặc giả hủy lệnh. (CAM-06/07, PED-06, INT-04)
- [ ] 8.18 Tests: E2E nhân viên đi bộ/xe máy/ô tô/xe tải dùng backend thật; chỉ OPENED khi server xác nhận đúng, Gate Out không yêu cầu hoặc hoàn tất order kho. (INT-04/09)
- [ ] 8.19 Frontend và tests: tích hợp person-log/evidence hooks/viewers bằng API nhóm8 đã có, filters/kỳ/cursor/coverage, permission/IDOR/blob cleanup; không suy từ vehicle logs. (PED-07, INT-05/08)
- [ ] 8.20 Nghiệm thu Milestone Gate MG3 — Core Access: Nghiệm thu toàn diện luồng xác minh 4 mode (người đi bộ, xe máy, ô tô, xe tải) chạy trên API thật, CaptureBundle manifest, ACK/Edge và kịch bản timeout/reconciliation; sẵn sàng cho Core Pilot tại cổng. (PED-01..07, CAM-01..08, INT-04/09)

## 9. M4 - Dashboard aggregate theo layer rồi tích hợp UI

*Phụ thuộc*: Các tasks thiết kế/domain 9.1–9.3 và bổ sung telemetry 9.4 bắt đầu sau khi hoàn thành Core Access (M3). Chỉ yêu cầu dữ liệu nguồn và telemetry đầy đủ ở bước nghiệm thu MG4 (9.12).

- [ ] 9.1 Domain: chốt G4 metric catalog/formula/units/event-vs-snapshot/coverage/null/sample/excluded counts và supported filters; cấm KPI không đủ crossing/history/ground truth. (ANA-01..04)
- [ ] 9.2 Domain: khai báo AnalyticsReadRepository/snapshot ports và typed filter/period/scope/provenance contracts, không arbitrary Mongo query. (ANA-02/05/06)
- [ ] 9.3 Application: aggregation/metric-definition use cases kiểm quyền nguồn+aggregate, UTC [from,to), dedupe/ratios/comparison/partial watermarks và immutable report snapshot. (ANA-01..06)
- [ ] 9.4 Infrastructure: bổ sung gate/access mode/category provenance và received/verify/command/ACK telemetry; indexes/backfill giữ unknown/coverage, không bỏ denied-before-command. (CAM-08, ANA-03/04)
- [ ] 9.5 Infrastructure: aggregate repositories/snapshot store/cache scope principal/authz_version, query bounds và source consistency/watermarks đúng contract. (ANA-05/06)
- [ ] 9.6 Presentation: hai analytics routes/DTO/error/permissions, supported filters/definitions và pagination/drilldown contract cần cho metric. (ANA-01/02/08)
- [ ] 9.7 Bootstrap: inject analytics adapters/cache/invalidation/config/query limits và metric definition version. (ANA-01/06)
- [ ] 9.8 Tests: unit formulas/filter/period/permission và integration nguồn thật với biên timezone, duplicate/zero/null/partial/unknown/history thiếu, cache cross-user/revoke. (ANA-01..06/08)
- [ ] 9.9 Frontend: Dashboard hooks/filters/MetricStrip/ChartPanel/Trend/Breakdown/Context và bảng text tương đương dùng chung tokens. (ANA-07)
- [ ] 9.10 Frontend: source/unit/coverage/last-updated, per-panel loading/stale/partial/unavailable, rate-limited invalidate và supported drilldown allowlist cùng kỳ/quyền. (ANA-07/08)
- [ ] 9.11 Tests: đối chiếu số Dashboard với aggregates và nguồn thật, responsive/keyboard/chart text, không list-limit totals hoặc KPI demo/accuracy/occupancy giả. (ANA-01..08)
- [ ] 9.12 Nghiệm thu Milestone Gate MG4 — Analytics: Nghiệm thu Dashboard aggregate có nguồn số liệu, coverage, phân quyền, bảng text tương đương và đối chiếu khớp với dữ liệu thật; mở khóa màn hình Dashboard vận hành. (ANA-01..08)

## 10. M5 - Assistant self-hosted theo layer rồi tích hợp UI

*Phụ thuộc*: Task 10.1 khởi động sau khi contract Analytics và yêu cầu báo cáo đã rõ. Các tasks triển khai ModelGateway, worker, storage, retention và phát hành Assistant (10.2–10.18) chỉ bắt đầu sau khi G5 (benchmark model) và G6 (storage/lifecycle contract) được phê duyệt.

- [ ] 10.1 Khởi động và chốt G5 model/license/runtime/hardware benchmark tiếng Việt và G6 expiry/retention/artifact format/quotas/deadlines (sau khi contract Analytics và yêu cầu báo cáo đã rõ); phê duyệt G5/G6 để mở khóa các tasks triển khai tiếp theo (10.2–10.18); không cloud fallback. (AI-01/04/08)
- [ ] 10.2 Domain: ReportJob state machine/owner/scope/version/expiry/idempotency, GroundedReportResult và Protocol ports ModelGateway/JobRepository/ArtifactStore/clock. (AI-03/04/06/08)
- [ ] 10.3 Application: create/list/detail report use cases với typed intent/templates/period/filters, owner+source+aggregate permissions, allowlist read tools. (AI-02/08)
- [ ] 10.4 Application: privacy/egress context builder hard-block secrets/Restricted, minimum aggregate context và injection guard không nâng scope/tools. (AI-02/07)
- [ ] 10.5 Application: deterministic snapshot context + schema/numeric/citation/domain validator trước publish, limitations và labeled template fallback khi model/output lỗi. (AI-03)
- [ ] 10.6 Application: cancel/status/event/download use cases có versioned terminal transition, completion race/expiry/revoke checks và audit metadata redact. (AI-05/06/08)
- [ ] 10.7 Infrastructure: durable job/snapshot/event/artifact repositories/indexes, atomic claim/lease/deadline/recovery/idempotency, bounded concurrency/retention. (AI-04/08)
- [ ] 10.8 Infrastructure: self-hosted ModelGateway adapter với timeout/cancel capability, credential server-only và không arbitrary DB/URL/action tools. (AI-01/02)
- [ ] 10.9 Infrastructure: worker ngoài API event loop, stages thật/validation/cancel/recovery, version checks trước publish/read và cross-worker revoke. (AI-04..06/08)
- [ ] 10.10 Infrastructure: purge prompt/context/snapshot/artifact theo retention và encryption/access policy; private exports theo format đã chốt, không model HTML tùy ý. (AI-07/08/09)
- [ ] 10.11 Presentation: sáu report endpoints/DTO, authenticated fetch-compatible SSE/event framing/sequence/resume, status/cancel/download permissions/error/expiry đúng M0. (AI-04..06/08)
- [ ] 10.12 Bootstrap: inject report/model adapters, worker lifecycle/readiness/limits/secrets/observability, model unavailable không làm mất Dashboard. (AI-01/04)
- [ ] 10.13 Tests: unit từng lifecycle/intent/privacy/grounding/cancel use case, numeric/citation/schema/domain reject, owner/IDOR/direct API/forced-password. (AI-02..08)
- [ ] 10.14 Tests: model nội bộ thật trong môi trường cô lập; worker crash/lease/deadline/recovery, quota/idempotency/cancel-completion race, revoke giữa stream/download và expiry/purge. (AI-01/04/06/08)
- [ ] 10.15 Frontend: Assistant composer/period/templates/history/detail/result/source components bằng WorkspaceLayout/hooks chung; chỉ hiển thị dữ liệu/module có quyền. (AI-09)
- [ ] 10.16 Frontend: authenticated fetch SSE UTF-8/frame parser/bounds/dedupe/resume/stale guards, stage thật; final chỉ sau validate, không fake percent hoặc chain-of-thought. (AI-05)
- [ ] 10.17 Frontend: phân biệt dừng theo dõi/yêu cầu hủy/CANCELED, safe text/JSON output/exports, context privacy submit guard và cleanup readers/buffers. (AI-06/07/09)
- [ ] 10.18 Tests: E2E Assistant dùng model thật, hallucination/citations/injection/Restricted/cross-user/revoke/expiry/cancel và A11Y/live-region/responsive; Dashboard vẫn hoạt động khi model lỗi. (AI-01..09)
- [ ] 10.19 Nghiệm thu Milestone Gate MG5 — Assistant: Nghiệm thu ModelGateway nội bộ, durable jobs worker, citations, grounding, context privacy guard và stream/cancel/expiry; mở khóa tính năng AI Assistant. (AI-01..09)

## 11. M6 - Nghiệm thu core, deployment và rollback

- [ ] 11.1 Hoàn thiện traceability từng requirement/scenario -> test/evidence; chạy typecheck/lint/build và backend checks theo pyproject.toml, không ghi đạt chỉ từ checkbox/design. (API-06, INT-09)
- [ ] 11.2 Chạy DOD-FE-AI-01..04: nhãn observation/decision/ACK, confirmation/pending/double-submit, loading thật, runtime schema/render boundaries; lưu evidence. (INT-04/07, FE-06)
- [ ] 11.3 Chạy DOD-FE-AI-05..08: cleanup WS/report/media, client abort/server cancel, privacy/egress, keyboard/live region; lưu evidence. (INT-08/09, AI-05..09)
- [ ] 11.4 Chạy FE-NEG-01/02/03/04: script/img onerror không executable, prompt password/Restricted bị hard-block cả direct API; guard không chặn login hợp lệ. (INT-09, AI-07)
- [ ] 11.5 Chạy FE-NEG-05/06/07/08: cancel race, WS disconnect/resync, missing Verification DTO fallback, unmount/logout late-response cleanup; Dock DTO case chỉ khi extension triển khai. (INT-04..09, AI-05/06)
- [ ] 11.6 Kiểm mỗi core page/state ready/loading/empty/error/forbidden và modal submit/validation/error tại ma trận viewport/zoom/orientation/keyboard; screenshots/video shared CSS/sidebar/motion review. (FE-03..07)
- [ ] 11.7 Chạy nghiệm thu camera hiện trường riêng cho pedestrian/motorcycle/car/truck và lỗi AI/camera/storage/device; ghi rõ điều kiện/coverage chưa đạt, không suy từ simulator/một loại xe. (CAM-02..08, PED-04)
- [ ] 11.8 Kiểm production build /console base/basename/assets/deep links/cache, dev proxy và API/WS/health/docs không thành SPA HTML; cùng-origin cookie/CSRF hoạt động. (FE-09, JWT-02)
- [ ] 11.9 Diễn tập migration/rollback client/backend compatibility, permission diff, additive schemas/backfill coverage và revoked credentials không sống lại khi rollback. (JWT-08, RBAC-01)
- [ ] 11.10 Kiểm runtime không mock/fixtures/secrets/biometric/prompt/output nhạy cảm trong bundle/storage/logs/traces; provider/device keys chỉ server. (API-06, INT-09, AI-07)
- [ ] 11.11 Tổng hợp bàn giao backend BE-01–BE-07, contract/version/test evidence và hạn chế vận hành; xác nhận kho/action không là điều kiện core, lập change E1/E2 riêng nếu tiếp tục. (API-06)
- [ ] 11.12 Nghiệm thu Milestone Gate MG6 — Release: Xác nhận toàn bộ DoD, negative security tests, all-page responsive/A11Y, kiểm nghiệm hiện trường 4 mode, diễn tập rollback và traceability matrix đầy đủ; xác nhận hoàn thành verification của implementation, sẵn sàng tạo PR merge implementation vào main và tiến hành archive từ main theo Git Discipline. (API-06, INT-09, DOD-FE-AI-01..08, FE-NEG-01..08)
