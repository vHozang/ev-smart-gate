## Context

Nguồn thiết kế là [báo cáo v1.3](../../../docs/frontend-architecture.md) và [proposal](proposal.md). Console hiện tại là static HTML/CSS/JS do FastAPI phục vụ; auth là session cookie/CSRF với ADMIN/WAREHOUSE/SECURITY. Chưa có JWT/refresh, users/roles CRUD, registry/pedestrian API, aggregate chuyên dụng hoặc report/model worker. Mục 10 của báo cáo phân biệt 44 HTTP + 1 WS hiện có với các API đề xuất; không dùng bảng đề xuất làm bằng chứng triển khai.

Change cũ `automated-smart-gate-warehouse` còn tài liệu Gate Out liên thông order. Change này bám router bãi xe và quyết định U-06: không tự hoàn tất order kho sau Gate Out. Không sửa/archive/sync change cũ trong lượt propose này. Chưa có baseline `openspec/specs/`; chín capabilities mới dùng ADDED requirements.

Stakeholders: frontend nhận contract/API thật; backend chịu policy/dữ liệu; edge/device chịu capture/RFID/ACK; vận hành xác minh nghiệp vụ và hiện trường; người quản trị duyệt quyền. Model/runtime/hardware và thiết bị hiện trường cụ thể: Unknown, phải benchmark trước bật chức năng phụ thuộc. Proposal/ADRs là Proposed, không giả định đã được team duyệt.

## Goals / Non-Goals

**Goals:**

- Backend contract + JWT/RBAC làm nền trước UI foundation, rồi tích hợp nhân viên đi bộ/xe máy/ô tô/xe tải bằng API thật.
- Một UI system cho mọi trang/state: composition, shared CSS + Tailwind cùng tokens, layout/sidebar/feedback/hooks/routes/types thống nhất.
- Face 1:1 với chủ thẻ cho mọi mode, trusted capture/encounter và idempotent device workflow, không ghép evidence tùy ý.
- Dashboard aggregate có nguồn và Assistant self-hosted read-only, áp quyền trên mọi đường dữ liệu và vòng đời job/artifact.
- Migration và rollback có giới hạn, testable contracts/negative cases; giữ Clean Architecture.

**Non-Goals:**

- Triển khai code, cài dependencies ứng dụng, thay database hoặc commit/merge trong lượt propose.
- Face-first 1:N, xác minh mọi hành khách, chấm công/occupancy/actual-crossing từ verify logs, multi-tenant/site isolation chưa có schema.
- Multi-role/hierarchy/direct-user grants, public registration, email reset giả khi chưa có provider.
- UI kho và nhận diện hành động video trong core change; giữ roadmap/contracts E1/E2. Không nối QR/order kho vào Gate Out, không cho AI điều khiển barrier hoặc quyết định kỷ luật nhân viên.

## Decisions

### D1. Contract và rollout chia chặng

OpenAPI runtime/Pydantic là nguồn DTO, được đối chiếu snapshot/router và permission matrix. M0 xác nhận OpenAPI runtime của các endpoint hiện hữu, đồng thời phê duyệt đặc tả versioned, payload, policy và contract tests cho các endpoint mới (đối chiếu runtime của API mới sẽ thực hiện khi backend triển khai xong, trước khi frontend tích hợp). Mỗi contract có chủ sở hữu backend và evidence compatibility; chưa có API thì feature chưa khả dụng. Phương án dựng UI bằng runtime mocks làm mất bằng chứng tích hợp nên không chọn.

Sau khi đạt Milestone Gate MG0, dự án mở khóa triển khai song song: Backend tiến hành M1 (JWT/RBAC) trong khi Frontend triển khai các thành phần nền tảng độc lập (Design System, Tokens, AppShell, Primitives, Feedback Hosts theo các tasks 5.1, 5.2, 6.1–6.6, 6.8–6.10).

Inventory chi tiết giữ tại báo cáo mục 10.2–10.9; ở đây không sao chép 39 route đề xuất thành API tồn tại. Các bổ sung cần chốt M0:

| Nhóm | Contract mục tiêu |
| --- | --- |
| Auth | Login/access response versioned, refresh/logout/change-password/me, session revoke và short-lived single-use WS ticket |
| RBAC | admin/users, roles, permissions, sessions và append-only audit theo 10.7 |
| Core | employees, access-points/grants, pedestrian verification/log/evidence và vehicle-types theo 10.9 |
| Trusted capture | Ingest capture bundle và verify reference/schema version; manifest server xác nhận nguồn/freshness/binding |
| Reconciliation | Lookup event/operation theo principal/device scope; verification/permit/command/ACK, pending/unknown rõ |
| Analytics/report | Hai analytics + sáu report operations theo 10.8, stream/download/cancel/expiry |

Chưa cố định path mới của ingest/lookup hoặc payload chưa được backend xác nhận trong proposal; task M0 phải xuất contract/version và test examples trước viết client/edge phụ thuộc. Không đổi semantics route hiện hữu trong im lặng. Error mapping giữ `error.code/message/details` và `X-Request-ID`; unsupported filter không bị bỏ qua.

### D2. React SPA và một chủ sở hữu mỗi loại state

Chọn React + TypeScript strict + Vite SPA, React Router Data Mode; stable versions/peer dependencies được xác minh tại task cài đặt và ghi lockfile trong `frontend/`, không đổi package demo gốc. Next/RSC có thêm deployment/runtime chưa cần; giữ vanilla không đáp ứng nhu cầu composition và thống nhất màn hình. Xem [ADR-0001](adr/0001-react-vite-console.md).

TanStack Query sở hữu server data/me/permissions/lists/analytics/jobs; Redux Toolkit giữ client preferences/workspace/auth lifecycle serializable; URL giữ filters có nhu cầu bookmark, form/local state giữ input. Axios là HTTP transport dùng chung; authenticated fetch chỉ cho report stream vì yêu cầu parse SSE, dùng cùng auth/error/cancel policy. Token chỉ ở auth service RAM; không đặt Blob/ReactNode/callback/controller/socket vào Redux, không persist cache nhạy cảm. Không dùng Zustand hoặc RTK Query thành cache song song. Xem [ADR-0002](adr/0002-state-ownership.md).

### D3. JWT có phiên bền vững và thu hồi xuyên worker

Access JWT ngắn hạn + opaque refresh cookie HttpOnly/Secure, rotation/hash token family/reuse detection; ký/verify keys và audience tách JWS phiếu kho. TTL đề xuất access 5 phút, refresh absolute tối đa 7 ngày; idle expiry, rotation concurrency và clock skew phải cấu hình/chốt ở contract gate, không dùng các số này làm bằng chứng benchmark hay lý do bỏ revoke.

Mỗi request kiểm chữ ký/algorithm allowlist/issuer/audience/expiry, User active, session version và effective authz version từ storage bền vững. Refresh dùng Origin/CSRF policy, không cấp business access cho must_change_password principal. Access JWT stateless đến hết TTL không đáp ứng revoke nên bị loại. WS ticket có scope/expiry/one-time consume; connection revalidate và đóng trước phát dữ liệu sau revoke. Report read/stream/download và worker cũng revalidate. Xem [ADR-0003](adr/0003-jwt-refresh-revocation.md).

Trong browser: bootstrap refresh -> me -> protected routes; single-flight mỗi tab, phối hợp đa tab bằng lock/logout signals không broadcast token. Phải chốt cách serialize rotation/retry hợp lệ ở M0; không coi mọi request refresh đồng thời hợp lệ là tấn công rồi revoke ngẫu nhiên. Không refresh 403, không loop auth endpoints, tối đa một replay đủ điều kiện; side effects chỉ replay khi server bảo đảm chưa thực thi và có idempotency. Logout tăng local lifecycle generation, abort/clear cache/close media+WS/modal; response cũ không phục hồi phiên.

### D4. Permission RBAC một role và tách physical access

User có một role_id; Role có stable code/is_system/is_active/version và permission codes từ catalog versioned. Seed ADMIN/WAREHOUSE/SECURITY bảo toàn quyền cũ, custom roles trong grantable policy; chưa multi-role/hierarchy/user-specific grants. Không nâng quyền chỉ nhờ prefix `/admin` hoặc role label. Xem [ADR-0004](adr/0004-permission-rbac.md).

Tất cả HTTP/evidence/download/WS/jobs dùng AuthorizationPolicy service; device scopes độc lập. Admin assignment/management permissions chỉ ADMIN theo phase đầu, guard ngay POST create/reset/update target. Profile PATCH allowlist không chứa role/password/status. Last-admin mutation và audit thành công cùng transaction/concurrency guard; role đang gán không deactivate/archive; expected_version conflict=409. Revoke role permissions tác động mọi users/sessions/jobs/cache/WS liên quan. Audit server actor/time/diff redact, append-only; không password/token/biometric/raw prompt. Seed/bootstrap không khôi phục admin đã bị quản trị vô hiệu trái policy.

EmployeeRegistry tham chiếu identity/person_id đang enrollment qua Driver adapter, giữ một embedding; không tự tạo User. PedestrianAccessGrant theo employee/access-point/direction/time/version, không thay bằng User permission. Enrollment+registry từng bước có idempotency/compensation rõ. Xe vẫn dùng driver–vehicle authorization; người đi bộ không có vehicle/plate giả.

### D5. Trusted capture và kết quả thiết bị có ranh giới

Gateway/device đã xác thực ghi CaptureBundle manifest: schema_version, capture_bundle_id/encounter_id, access mode, gate/access point, camera/lane/ROI config version, frame refs/hash, captured_at/received_at và device identity. Backend kiểm binding, freshness/max-skew và candidates; metadata browser tự khai không đủ tin cậy. Lưu manifest/evidence qua private storage có kiểm quyền, không public URL. Legacy/manual multipart chưa đáp ứng không được bypass strict production camera policy. Xem [ADR-0005](adr/0005-trusted-capture-bundles.md).

Face 1:1 so chủ thẻ ở pedestrian/motorcycle/car/truck; xe cần RFID+plate+authorization cùng encounter. Chọn mặt lớn nhất không chứng minh người lái; ambiguity/occlusion/mismatch/stale/errors đều fail-closed. Vehicle catalog motorcycle/car/truck, mapping sedan->car rõ, unknown giữ unknown không suy AI category.

Edge nhận RFID thật, trigger một encounter, debounce và retry cùng event_id; bỏ dependency slip_image ở parking exit. Event identity bind device/gate/mode/direction/payload fingerprint bằng canonical server data; reuse khác scope/payload ->409, retry hợp lệ không tạo thêm command. Kiểm hiện trạng dedupe chỉ ID/direction trước migration. UI không gọi barrier trực tiếp; chỉ OPENED khi server PASSED + permit_granted + barrier OPENED ACK, không suy người/xe thực tế đã qua. Timeout reconcile lookup giữ event; lỗi lookup giữ unknown và không retry mù.

### D6. UI composition, CSS và feedback chung

`frontend/src` chia app/layouts/pages/widgets/features/shared như báo cáo mục 5. Page ghép widgets/features, shared không import lên feature/app, không deep import feature khác. Hooks màn hình ghép hooks nhỏ trả data/state/actions; API/query/schema/mapper độc lập. Generated DTO snake_case + runtime boundary schemas -> typed screen interfaces; không any/cast che lỗi hoặc bù score/status giả.

Một stylesheet entry import tokens/base/components/layouts/motion theo cascade layers thống nhất. Shared CSS sở hữu variants/interaction; Tailwind page/widget chỉ bố cục riêng từ cùng semantic tokens. Áp dụng design-taste baseline 8/6/4 theo báo cáo: neutral, một accent, typography tiếng Việt, không bố cục card lặp và motion cản vận hành. User yêu cầu CSS chung được ưu tiên hơn default Tailwind 90%/RSC của skill. React Bits chọn leaf phù hợp, kiểm dependency/license, reduced-motion và cleanup trước dùng.

AppShell/nested outlet ổn định; desktop expanded/rail, mobile drawer có focus/Escape/restore/aria. Registry routes quản lý paths/title/layout/capability/breadcrumb; helpers encode params/validate query. Mỗi component/layout/page có index.ts named exports/export type; page entry xuất Component/ErrorBoundary, lazy-import trực tiếp page entry; không barrel eager toàn pages hay vòng qua own barrel.

Một FeedbackProvider/ModalHost/ToastHost. Render props typed renderContent/renderFooter nhận context lifecycle; ModalShell lo focus/portal/size/scroll/motion, feature lo form và mutation. Một blocking modal, không auto-open theo refetch/render, dirty/pending policies; 422 giữ input. Mutation sở hữu kết quả toast, transport không toast trùng; stream/reconnect dedupe, errors quan trọng có inline. Confirmation không giả undo side effect vật lý.

Responsive mọi page/state tại 320/360/768/1024/1440/1920, portrait/landscape, zoom 200%, keyboard/nội dung dài; không dùng body overflow-x hidden để che vỡ bố cục. Chart có text/table tương đương. Motion transform/opacity, không giật bảng/focus; reduced motion giữ chức năng.

### D7. Tích hợp thật và realtime có thể phục hồi

Core pages: login/bootstrap, Dashboard, employees/driver adapter, vehicles, authorizations, cards, vehicle/pedestrian gates, logs/person logs/evidence, alerts, system health, users/roles/catalog/audit và Assistant/report detail. Kho routes chỉ dành extension khi server module triển khai/bật với permission; không render placeholder success.

Feature API modules gọi Axios; Query definitions dùng cùng cache với route loaders. Lists khai báo coverage/filters đúng contract; invalidation theo entity/action, không sao chép vào Redux. Auth lifecycle errors tách 401/403; assets/blob/file cần auth và revoke URL. Readiness hiện chỉ DB, không giả GPU/camera khỏe.

WS alerts giữ REST sequence resync: subscribe+buffer -> snapshot -> merge ID/sequence -> drain -> fetch tiếp batches khi gap; bounded buffer/backoff+jitter/ping-pong và local invalid-event fallback. Nếu server chọn handshake cursor thay thế phải chốt contract. Logout/revoke/unmount dừng socket/readers/timers/controllers/media/Blob URLs và stale-request writes.

Loading phản ánh idle/validating/uploading/waiting/success/failure/outcome_unknown; upload progress không là inference progress. ErrorBoundary cho render, async/mutation lỗi xử lý riêng. Browser abort không chứng minh server cancel. Không thông báo đã chuyển xử lý thủ công nếu chưa có task backend.

### D8. Aggregate có nguồn trước LLM

AnalyticsQueryService query toàn tập có quyền, khoảng [from,to), timezone Asia/Bangkok chuyển UTC, typed filters. GateLog bổ sung gate/access mode/vehicle category snapshot và telemetry cần thiết; backfill không xác định ghi unknown/coverage. Không chỉ join GateCommand vì mất denied events. Không tuyên bố site isolation/filter khi chưa có site schema; site_id lịch sử chưa biết không tự gán.

Metric definition version quy định formula/unit/source, event flow hay current snapshot, sample/excluded counts. PASSED ratio không là AI accuracy, ACK không là crossing, reason counts đa nhãn có thể lớn hơn log count; zero khác null/forbidden. Thiếu journal/crossing/ground truth thì KPI tương ứng unavailable. Current order/slip/alert snapshots không giả là lịch sử cuối kỳ. Thêm telemetry trước đo latency.

Report dùng aggregate snapshot bất biến; nếu nguồn không thể snapshot nhất quán, lưu source watermarks/data_as_of riêng và partial, không suy tỷ lệ cross-source thiếu đồng thời. Cache keys gồm principal/scope/authz_version/filters/definition version; revalidate quyền và không leak qua totals/cache/artifact. Xem [ADR-0006](adr/0006-grounded-aggregate-reporting.md).

### D9. Assistant self-hosted qua worker và gateway read-only

Browser -> FastAPI report use cases -> durable job/worker -> authorized AnalyticsQueryService -> minimal context -> ModelGateway nội bộ -> schema/numeric/citation validator -> final report. Backend tính số/tỷ lệ; model diễn đạt, findings gắn metric/source refs và limitations, giả thuyết không giả thành nhân quả. Allowlist typed read tools; không arbitrary DB/URL/action hoặc chain-of-thought. Không cloud fallback; model failure giữ Dashboard và có thể trả template “Tổng hợp dữ liệu” từ số thật.

Phase đầu owner-only read/cancel, không ADMIN read-all ngầm; cần reports permission + source/domain analytics permissions cho create/read/events/reconnect/export. Context mặc định aggregate không raw PII/notes/alert.data/cargo_metadata/biometric; Restricted hard-block server trước model và client submit, regex đơn lẻ không đủ. Prompt/source untrusted không đổi policy/tool scope. Text/JSON render an toàn; HTML artifact nếu cần renderer kiểm soát/cách ly, không inject vào app.

Worker tách API event loop, durable atomic claim/lease/deadline/recovery, bounded concurrency/rate/length/time range. QUEUED -> RUNNING -> VALIDATING -> COMPLETED; FAILED/CANCEL_REQUESTED/CANCELED và expiry policy rõ. Cancel best-effort có server ACK, completion thắng race vẫn COMPLETED. Phase đầu stream stage/status thật bằng fetch Bearer/SSE framing UTF-8 incremental/bounded buffer; chỉ công bố final sau validation, không fake percent/token thinking. Report storage giữ owner/scope/authz_version/snapshot/model/version/expiry; enforcement read/events/download và purge prompt/context/snapshot/artifacts theo retention, audit metadata redact. Chọn durable worker thay synchronous inference request để có recovery/cancel độc lập kết nối; xem [ADR-0007](adr/0007-durable-report-jobs.md).

### D10. Layer, Protocol ports và adapters

| Layer | Trách nhiệm/Protocol đề xuất | Adapter/composition liên quan |
| --- | --- | --- |
| Domain | Role/Permission policies, EmployeeRegistry/AccessGrant, CaptureBundle invariants, EventIdentity, metric definitions/report state | Không phụ thuộc FastAPI, React, Mongo hoặc model SDK |
| Domain/application ports | UserRepository, RoleRepository, AuditRepository, AuthSessionRepository; UnitOfWork, PermissionResolver/RevocationNotifier; EmployeeRepository/AccessGrantRepository; CaptureBundleRepository/TrustedCaptureVerifier/EventResultRepository; AnalyticsReadRepository; ReportJobRepository/ReportArtifactStore/ModelGateway | Protocol signatures/types trong layer hướng vào trong; tái sử dụng ports hiện có khi cùng trách nhiệm, không nhân đôi repositories |
| Application | Auth/refresh/revoke/change-password; user/role/audit; employee/grants/pedestrian/vehicle verify/reconcile; analytics/report lifecycle/grounding | Điều phối policy, transaction, idempotency; AI observation không gọi DeviceGateway trực tiếp |
| Infrastructure | Mongo repositories/UoW/CAS/indexes/outbox, JWT/refresh hash/keys, MinIO encrypted artifacts/captures, vision/device/edge adapters, internal model client và report worker | Dùng Mongo replica set hiện có; notifier/outbox bảo đảm nhiều worker, storage source-of-truth trước cache; không mặc định thêm Redis/Celery khi chưa benchmark |
| Presentation | Pydantic DTO/OpenAPI, HTTP auth/error/CSRF dependencies, admin/core/analytics/report routers, WS ticket/stream | Không nhét business logic, không expose ORM/secrets/raw biometrics |
| Bootstrap | Config/auth keys/lifetime/features/origin, inject ports/adapters, worker lifecycle, metrics/health, static/proxy /console | Production cùng origin; device/model credentials chỉ server |
| Frontend | API/runtime guard/mapper/query -> hooks -> feature/widget/page composition | Auth RAM + Query + Redux boundaries, CSS/feedback/layout providers |

### D11. Traceability và evidence

| Nguồn | Capability/thiết kế | Nhóm task |
| --- | --- | --- |
| U-01/02/04 | react-console-foundation, D2/D6 | 5–6 |
| U-03/15 | jwt-session-auth, users-rbac-administration, D3/D4 | 1–5, 7 |
| U-05/06/20 | operational-console-integration/trusted-camera-vehicle-access, D5/D7 và Non-Goals | 1, 8, 11; extension riêng |
| U-07/08/09/10/13/14 | react-console-foundation, D6 | 5–7, 11 |
| U-11/12 | api-contracts, operational-console-integration, D1/D7 | 1, 5, 7–11 |
| U-16/17 | operational-analytics, self-hosted-quick-reports, D8/D9 | 9–11 |
| U-18/19/21 | employee-pedestrian-access, trusted-camera-vehicle-access, D4/D5 | 1, 8, 11 |
| DOD-FE-AI-01..08; FE-NEG-01..08 | Báo cáo mục 16, acceptance matrix bên dưới | 11 |

| Capability | Requirement IDs | Nhóm task triển khai/kiểm chứng |
| --- | --- | --- |
| api-contracts | API-01..06 | 1, 4–5, 11 |
| jwt-session-auth | JWT-01..08 | 1–2, 4–5, 7, 11 |
| users-rbac-administration | RBAC-01..08 | 1, 3–4, 7, 11 |
| employee-pedestrian-access | PED-01..07 | 1, 7–8, 11 |
| trusted-camera-vehicle-access | CAM-01..08 | 1, 7–9, 11 |
| react-console-foundation | FE-01..09 | 5–7, 11 |
| operational-console-integration | INT-01..09 | 5–8, 11 |
| operational-analytics | ANA-01..08 | 1, 5, 9, 11 |
| self-hosted-quick-reports | AI-01..09 | 1, 10–11 |

| Evidence ID | Điều kiện kiểm chứng khi triển khai |
| --- | --- |
| DOD-FE-AI-01 | Observation, operator decision và barrier result tách biệt qua component/E2E |
| DOD-FE-AI-02 | Confirm, disabled/pending, keyboard/double-submit/server rejection cho action rủi ro |
| DOD-FE-AI-03 | Loading gate/report theo response/events thật, không timer/progress giả |
| DOD-FE-AI-04 | Runtime schema + boundary với thiếu field/sai enum/render crash |
| DOD-FE-AI-05 | Cleanup WS/report stream khi unmount/logout/reconnect, không leak |
| DOD-FE-AI-06 | Abort client, reconcile và server cancel/completion race đúng semantics |
| DOD-FE-AI-07 | Privacy/egress/prompt guard, storage/telemetry/Restricted/masking checks |
| DOD-FE-AI-08 | Keyboard/live region/status/alert, automated + manual A11Y |
| FE-NEG-01 | Script trong alert/ghi chú không thực thi |
| FE-NEG-02 | Img/onerror không tạo executable DOM |
| FE-NEG-03 | Password trong prompt bị hard-block, không áp nhầm login |
| FE-NEG-04 | Restricted/card data bị chặn trước model |
| FE-NEG-05 | Dừng stream khác hủy report; server xác nhận CANCELED |
| FE-NEG-06 | WS disconnect/gap/resync nhiều batch không crash |
| FE-NEG-07 | Thiếu field Verification/Dock DTO -> fallback, không confidenceScore giả; Dock khi extension bật |
| FE-NEG-08 | Unmount/logout cleanup, response cũ không ghi lại |

Mã DoD chính thức và nội dung đầy đủ vẫn theo báo cáo mục 16; bảng này ánh xạ evidence triển khai, không thay định nghĩa hoặc tuyên bố đã đạt. Backend use cases mới có unit tests; E2E dùng FastAPI/DB/storage test thật. Fixtures chỉ ở unit/component tests, không runtime mocks hay biometric thật trong repo/traces.

## Risks / Trade-offs

- [Contract drift hoặc scope rộng] -> milestone có deliverables, không mở UI trước API thật, traceability đến spec và task.
- [Refresh đa tab tạo false reuse/revoke hoặc revive sau logout] -> serialized rotation policy, durable family/version, local generation và concurrency tests.
- [Role cache/WS/report cũ lộ dữ liệu] -> durable authz versions + notifier/outbox; kiểm storage khi không xác minh cache; fail-closed trước phát tiếp dữ liệu.
- [Sai ghép mặt hành khách/xe kế bên] -> trusted bundle/ROI/encounter/freshness, ambiguity reject; benchmark thực tế mọi nhóm, không cam kết accuracy từ simulator.
- [Idempotency trả nhầm event cũ] -> scope/fingerprint conflict, lookup có quyền, retry không tạo side effect mới.
- [Mongo aggregate/snapshot/worker quá tải] -> indexes/limits/source watermarks, bounded worker benchmark, không query arbitrary; thêm hạ tầng chỉ khi có evidence.
- [LLM bịa số/citations hoặc prompt injection] -> aggregate deterministic, least-privilege tool scope, final validator và labeled template fallback; self-hosted vẫn là untrusted output.
- [Hai UI/auth compatibility kéo dài] -> cutoff/version/rollback rehearsals, không rollback security/revoked credentials.
- [Theme/responsive chỉ đúng một số trang] -> CSS ownership, every-page/state QA và design review theo skill, không che overflow.

## Migration Plan

| Chặng | Kết quả và gate trước chặng sau |
| --- | --- |
| M0 Contract | MG0 xác nhận OpenAPI runtime của các endpoint hiện hữu; phê duyệt đặc tả versioned, payload, policy và contract tests cho endpoints mới (đối chiếu runtime của API mới sau khi backend triển khai xong); chuẩn bị test environment thật; mở khóa Backend M1 và song song Frontend Foundation độc lập |
| M1 Backend auth/RBAC | Domain -> application -> infrastructure -> presentation -> bootstrap -> tests; migrations seed một role, JWT/revoke/must-change/WS, unit+contract+integration evidence; MG1 mở khóa tích hợp Auth/Admin trên Frontend và kích hoạt auth service thật |
| M2 UI foundation | React package/lockfile/type generation/transport/providers/layout/CSS/feedback/routes; MG2 nghiệm thu nền tảng độc lập (AppShell, tokens, modal/toast, responsive, component tests); các task tích hợp auth thật (5.5, 5.8) thực hiện sau MG1 |
| M3 Core integration | Employee/grants/pedestrian và camera/edge backend theo layer + tests; UI users/master data/gates/logs/alerts/health dùng API thật và permissions; MG3 nghiệm thu 4 mode sẵn sàng cho Core Pilot tại cổng |
| M4 Dashboard | Thiết kế metric catalog và bổ sung telemetry sau M3; MG4 nghiệm thu Dashboard aggregate có nguồn số liệu, coverage, telemetry thật, bảng text tương đương và đối chiếu khớp dữ liệu thật |
| M5 Assistant | Task 10.1 khởi động sau khi contract Analytics rõ; phê duyệt G5 (benchmark model) và G6 (storage/lifecycle contract) để mở khóa ModelGateway, worker, snapshot, privacy, grounding, events, cancel, export, retention; MG5 nghiệm thu trước khi phát hành Assistant |
| M6 Core release | Negative tests, all-page responsive/A11Y, nghiệm thu hiện trường 4 mode, security/migration/rollback evidence; hoàn thành verification để mở PR merge implementation vào main; archive từ main sau khi implementation đã merge |

Deploy schema mở rộng/backfill có coverage trước readers mới; seed không tăng quyền; contract auth có thời gian compatibility được cấu hình. Dev Vite proxy /api,/ws,/health; production build static `/console` bằng Node build stage, FastAPI/reverse proxy cùng origin, không Node server SPA bắt buộc. Base/basename/assets và fallback chỉ `/console`, giữ /api,/ws,/health,/docs nguyên semantics. Hash assets cache, HTML bootstrap không stale kéo dài.

Rollback UI qua deployment/feature switch về UI cũ chỉ trong cửa sổ compatibility; database ưu tiên additive forward fix, không xóa role/session/audit/registry mới để rollback. Test bản client cũ với auth compatibility và không khôi phục revoked credentials. Disable report generation nếu model lỗi nhưng giữ Dashboard thật; dừng worker an toàn giữ job trạng thái tra cứu/recovery. E1/E2 lập change riêng với contracts/specs/tests, không nối order vào core ngầm.

## Open Questions

Các gate dưới chưa đủ dữ liệu hiện trường; chủ sở hữu phải chốt trước task phụ thuộc, không hỏi lại scope đi bộ/ba nhóm xe hoặc lựa chọn self-hosted đã xác nhận.

| Gate | Chủ sở hữu / đầu ra | Chặn |
| --- | --- | --- |
| G1 Contract/auth | Backend + frontend: endpoint/version/DTO, pagination/lookup/ingest, cookie/CSRF/TTL/idle/rotation đa tab, compatibility cutoff | Task implementation tương ứng sau nhóm 1 |
| G2 Permission seed | Backend + quản trị nghiệp vụ: permissions mới và protected policy, role migration diff | Bật quyền mới; migration quyền cũ phải giữ nguyên |
| G3 Camera | Edge/device + vận hành: reader/camera/ROI/lane/clock/freshness/max-skew, trusted ingestion và acceptance matrix | Tự động cho qua; không bypass bằng manual legacy |
| G4 Metric coverage | Backend + nghiệp vụ: supported filters/telemetry/history, semantics/definition versions/backfill unknown | Nghiệm thu Dashboard MG4; telemetry thật bắt buộc trước khi nghiệm thu |
| G5 Model/runtime | Backend + hạ tầng: benchmark tiếng Việt, model/license/version/hardware/limits/provider deadline (khởi động từ task 10.1) | Triển khai ModelGateway và worker (10.2 trở đi); Dashboard không phụ thuộc |
| G6 Report lifecycle | Backend + vận hành: expiry/retention/purge, artifact text/JSON/PDF, concurrency/SLO (khởi động từ task 10.1) | Triển khai storage/worker và release Assistant (10.2 trở đi) |
| G7 Design baseline | Frontend + người dùng: theme/sidebar defaults, screenshots, page/state matrix | UI visual acceptance, không thay contract bảo mật |
