# Hợp đồng M0 cho migration React

Phiên bản: `1.0.0-draft`, ngày 20/10/2026. Trạng thái: **MG0 được người dùng phê duyệt ngày 20/10/2026; API mới triển khai theo M1–M5, chưa mặc nhiên khả dụng**.

Nguồn: [báo cáo kiến trúc](../frontend-architecture.md), [proposal hiện tại](../../openspec/changes/migrate-react-frontend/proposal.md), [design](../../openspec/changes/migrate-react-frontend/design.md). Việc apply trên `TienThanh/FE` đã được người dùng cho phép bỏ riêng checkpoint proposal phải lên main; không suy ra các gate nghiệm thu kỹ thuật đã đạt.

## 1. Hai nguồn contract độc lập

| Nguồn | Nội dung | Cách dùng |
| --- | --- | --- |
| [Runtime OpenAPI](../openapi.json) | 44 HTTP operations hiện có, sinh từ create_app/Pydantic | Client tích hợp API hiện có, kiểm contract drift |
| [Runtime inventory](runtime-inventory.json) | 44 HTTP + 1 WS, quyền/CSRF/device scope/query/body/response hiện có | Đối chiếu quyền baseline và khả năng thật |
| [Migration OpenAPI](migration.openapi.json) | 49 HTTP operations mục tiêu và WS v2, DTO có type | Review MG0, sinh types mục tiêu sau review; không chứng minh endpoint đã chạy |
| [Permission seed](permission-seed.json) | Catalog, baseline và seed mới tách riêng | Review G2/migration, không tăng quyền hiện hữu ngầm |

Các DTO mục tiêu ở `src/smart_gate/presentation/contracts/migration.py` chưa được app import/register thành routes. FastAPI runtime không công bố routes mới hoặc trả fake success cho contract chưa triển khai. Sinh types mục tiêu không cho phép UI mở chức năng chưa có API thật.

## 2. Version và compatibility

- Giữ nguyên `/api/v1/auth/login`, `/me`, `/logout` và `/ws/v1/security/alerts` trong cửa sổ compatibility; không đổi response enum role thành object ngầm.
- Auth mới: `/api/v2/auth/login`, `/refresh`, `/logout`, `/me`, `/change-password`, `/ws-tickets`; alerts WS mới `/ws/v2/security/alerts`.
- Vehicle verify strict: `/api/v2/gates/entry/verifications` và `/exit/verifications`. Hai route v1 multipart hiện tại chỉ hoạt động khi compatibility policy cho phép; không được dùng để bypass strict-camera access point.
- API hoàn toàn mới cho admin/employee/pedestrian/analytics/report giữ prefix v1 theo proposal. Pedestrian verify dùng JSON tham chiếu trusted bundle, thay cho multipart giả định ban đầu ở báo cáo: không yêu cầu plate/vehicle giả.
- Ingest mới `POST /api/v2/capture-bundles`; lookup mới `GET /api/v2/access-events/{event_id}`. Đây là hai path được cụ thể hóa cho M0, cần review trước triển khai.
- Compatibility là feature flag có ngày cutoff cấu hình khi rollout; chưa có lịch phát hành nên **chưa đặt ngày cutoff giả**. Không bật production nếu chưa có cutoff/rollback policy. Rollback UI không khôi phục user/session/role đã revoke.

## 3. G1 - Auth, cookie và rotation

| Thuộc tính | Giá trị hợp đồng đề nghị |
| --- | --- |
| Access JWT | TTL 300 giây; thuật toán allowlist EdDSA, key pair operator riêng với key phiếu kho; `kid`, `iss`, `aud`, `sub`, `sid`, `jti`, `iat`, `nbf`, `exp`, session/authz versions |
| Issuer/audience | Issuer cấu hình theo deployment; audience `ev-smart-gate-console`; backend kiểm exact match |
| Refresh | Opaque random ít nhất 256 bit; lưu hash + family + lịch sử token đã consume đến absolute expiry; không trả JSON/URL |
| Cookie refresh | `evsg_refresh`; HttpOnly, Secure production, SameSite=Strict, Path=/api/v2/auth, không Domain để host-only |
| CSRF | Cookie `evsg_auth_csrf`, JS-readable, Path=/, SameSite=Strict và Secure production; `X-CSRF-Token` so với cookie + server session hash |
| Origin | POST auth bắt buộc Origin nằm trong allowlist cùng origin đã cấu hình; login cũng chống login-CSRF; không CORS wildcard credentials |
| Expiry | Absolute tối đa 7 ngày; idle tối đa 24 giờ, không vượt absolute; access clock skew tối đa 30 giây, đều configurable |
| WS ticket | TTL 30 giây, dùng một lần atomic, bind sid/user/channel/authz version; redact ticket khỏi URL/access logs |
| Rate limits | Login/refresh/ticket phải có giới hạn theo deployment, fail-closed khi dependency kiểm quyền lỗi; không dùng limiter process-local để giả global protection |

Login/refresh/change-password trả AccessTokenResponse với effective principal. Response auth có `Cache-Control: no-store`; credentials không vào log, browser storage, Redux hoặc query persistence. Decode JWT không quyết định quyền; mỗi business request kiểm active/session/authz versions bền vững và resource policy. Forced-password principal chỉ me/change-password/logout/restricted refresh, không business API/WS/report.

Rotation concurrency:

1. Browser dùng single-flight mỗi tab và Web Lock cùng origin cho refresh đa tab. BroadcastChannel chỉ báo logout/phiên thay đổi, không gửi token.
2. Refresh thực hiện atomic compare-and-consume; request thắng rotate cookie/family một lần, không gia hạn absolute expiry.
3. Request dùng token vừa consume trong grace **5 giây** trả 409 `REFRESH_IN_PROGRESS`, không Set-Cookie và không revoke family. Client đợi lock/cookie cập nhật rồi retry tối đa một lần; lỗi này không được blanket replay business mutation.
4. Token consumed ngoài grace trả 401 `REFRESH_REUSE_DETECTED`, revoke family trên mọi worker. Token không biết/hết hạn trả lỗi tương ứng, không revoke family không liên quan.
5. Response đầu mất hoàn toàn và cookie không cập nhật: không trả lại refresh credential từ hash hoặc giữ plaintext; hết bounded retry yêu cầu đăng nhập lại. Đây là failure semantics được công bố, không promise phục hồi credential đã mất.
6. Logout/revoke/password reset/role change thắng race phải ngăn refresh/pending request hồi sinh phiên. Logout chấp nhận refresh-cookie + CSRF hoặc Bearer hợp lệ; restricted principal được logout.

Business mutation chỉ replay khi server xác nhận auth bị từ chối trước side effect và có idempotency phù hợp. Không refresh 403. Không timer retry vô hạn hoặc tự retry barrier/reissue/finalize khi timeout.

## 4. G2 - Users/RBAC và invariants

- Một active role/user. Catalog liệt kê code hoàn chỉnh; không wildcard, multi-role, hierarchy, direct-user grants hoặc tạo permission code từ UI.
- System roles ADMIN/WAREHOUSE/SECURITY có stable IDs; migration enum sang role_id giữ đúng baseline hiện hữu trong permission-seed.json. Quyền mới là seed mới cần review riêng, không trộn vào kết quả “không tăng quyền cũ”.
- `users:assign-admin` cần thêm vào create/assign ADMIN. Mọi profile/status/role/reset của target ADMIN cần action permission + `users:manage-admin` + target policy. Hai protected codes không cấp custom role.
- Last-admin, role inactive/assigned, permission dependency, version conflict và audit cùng mutation phải atomic. Không count rồi update hai transactions; system ADMIN và quyền quản trị cốt lõi không bị xóa/deactivate.
- Profile PATCH chỉ username/display_name + expected_version. Không nhận role/password/status/permissions; payload extra bị 422. Status/role/reset là operations riêng, có reason/version và audit.
- Reset mật khẩu tạm do admin đủ quyền nhập; response chỉ metadata, không trả password/hash. Lần login sau restricted principal. Chưa có email provider thì không giả gửi email.
- Catalog chỉ đọc; role code bất biến sau tạo, archive custom role chưa gán; role permissions replace cả tập, expected_version, không tự thêm dependency chưa xác nhận.
- Audit append-only actor/time từ server, redacted changes/request ID/outcome; không secret/hash/biometric/raw prompt. Không có CRUD sửa/xóa audit, kể cả ADMIN.
- Revoke user/role ảnh hưởng HTTP/evidence/download, WS đang mở, jobs, cache và artifacts trên mọi worker. Trước phát dữ liệu stream kiểm version/active hiện tại; kiểm không được thì dừng/fail-closed.

## 5. G3 - Identity, capture và verify

Employee registry liên kết person_id đang enrollment qua Driver adapter, không duplicate embedding/User. Employee code unique; create dùng Idempotency-Key, update có expected_version. Onboarding nhiều bước phải hiển thị partial/recovery; registry không tồn tại thì không báo hoàn tất. Physical grant theo employee/lối/hướng/[valid_from,valid_until), không suy từ RBAC hoặc vehicle authorization; inactive/revoke kiểm lại trước lệnh thiết bị.

Capture ingest chỉ cho authenticated gateway/device có `capture:ingest` và access-point/lane/calibration binding. Multipart gồm `metadata` application/json, `face_image` bắt buộc và `plate_image` bắt buộc với vehicle. Server tính hash/frame refs/received_at/device identity; client không tự cấp device identity, ROI hoặc received_at. UID trong metadata write-only, không response/log. Verify chỉ gửi event_id/gate_id/capture_bundle_id; policy dùng card binding đã ingest, không nhận UID mới để ghép lại ảnh.

Camera policy version `1.0`: calibration/ROI/clock/freshness/max-skew theo access point và thiết bị được vận hành duyệt. **Không có calibration hoặc không xác minh được clock/source thì `CAPTURE_CONFIG_REQUIRED`/`CAPTURE_UNTRUSTED`, fail-closed.** Không đặt ROI/freshness hiện trường giả chỉ để mở MG0. Values/calibration thực tế và matrix bốn mode còn chờ G3 trước MG3.

Vehicle modes motorcycle/car/truck đều cần RFID + mặt người lái + plate + driver–vehicle authorization; đi bộ cần RFID + face 1:1 + registry + grant, không plate/order. Face lớn nhất không mặc nhiên là người lái; nhiều candidates/stale/skew/mismatch/che mặt/AI-storage-device lỗi không tạo permit. Catalog sedan->car theo mapping công bố; unknown không tự thành loại hợp lệ.

Idempotency: server namespace + event_id bind mode/direction/device/access point/canonical bundle fingerprint; atomic claim/command idempotency xuyên worker. Cùng key/payload trả operation cũ; khác binding ->409 `EVENT_BINDING_CONFLICT`. Giữ dedupe ít nhất 24 giờ và không ngắn hơn cửa sổ command reconciliation; expiry/replay policy cần cấu hình trước rollout. Lookup chỉ trả event đúng operator permission/object policy hoặc device binding; không lộ card/evidence bytes. Không tìm thấy/hết retention không chứng minh lệnh chưa thực thi: UI giữ outcome_unknown, không tự tạo event mới để retry.

Verification, permit, command và ACK tách biệt. PASSED + permit true + OPENED ACK mới hiển thị barrier đã mở, không gọi đó là actual crossing. Lookup trả pending/unknown/final thật; request abort không hoàn tác barrier.

## 6. Query, errors, upload và realtime

- API hiện hữu giữ query/array/limits như runtime-inventory; chưa có cursor/total/date filter thì UI không giả có. Unsupported query ở legacy hiện có thể bị bỏ qua, nên client chỉ phát query công bố; API mới phải 422 unknown filters.
- API mới list: CursorPage `{items,next_cursor,has_more,coverage,total}`; limit mặc định 50, tối đa 200. Cursor opaque có integrity/signature, bind principal/authz_version/filters và stable order created_at DESC,id DESC; invalid/stale cursor trả 400 `CURSOR_INVALID` hoặc 409 `CURSOR_SCOPE_CHANGED`, không dùng cursor raw DB query.
- Catalog/permission definitions cũng có thể nhiều trang; client không coi trang đầu là toàn catalog. Total nullable, không tự suy từ items/has_more.
- Kỳ [from,to), timezone Asia/Bangkok mặc định, UTC query boundary, hỗ trợ UTC; từ/đến phải aware, to > from. Analytics tối đa 366 ngày, report tối đa 31 ngày; granularity hour/day theo definitions. Filter gate/site không hỗ trợ đến khi có nguồn/backfill đầy đủ; không arbitrary Mongo/SQL/regex input.
- Error envelope `{error:{code,message,details}}`, request ID ở `X-Request-ID`, không field requestId giả trong body. 401 auth; 403 permission/restricted; 404 resource; 409 state/version/replay; 410 expired report/event history; 413 upload; 422 schema; 429 quota; 503 dependency. Validation không echo password/token/card/image input.
- Mỗi ảnh tối đa 10 MiB; kiểm decoded image/type/dimensions và bộ nhớ, không chỉ filename/header. Server không nhận public object-store URL hay arbitrary URL ingestion. Frontend không tự đặt multipart boundary. Evidence bytes có Content-Type đúng, no-store/private API, Blob URL cleanup.
- Alerts WS v2 dùng `AlertDelta`; resync mới `GET /api/v2/security/alerts` với `after_sequence` mặc định 0, `limit` 1–200 (50 mặc định), `epoch` và `watermark`. API v1 giữ array hiện tại. Durable delta log ghi cả create/status update bằng outbox cùng transaction; delivery sequence khác sequence tạo alert, không bỏ mất status update.
- Batch đầu chốt watermark, client giữ watermark/epoch khi tải các trang theo next_after_sequence; items tăng dần sequence, has_more=false mới bắt kịp snapshot. Không tự đặt watermark vượt server. Delta sequence có thể không liên tục do scope; next_after_sequence là tiến độ server đã quét trong scope, không lấy max của dữ liệu ẩn. Scope/user/authz version đổi phải bootstrap lại, không reuse cursor cũ.
- Retention delta đề nghị 7 ngày, cấu hình trước rollout. Cursor ngoài retained range hoặc epoch reset trả 410 `ALERT_HISTORY_GAP` với oldest_sequence/watermark/epoch đã kiểm quyền; client xin bootstrap từ 0, hiển thị coverage=partial/retained_from khi lịch sử đã bị purge. Đây là đồng bộ trong phạm vi retention, không chứng minh toàn bộ lịch sử đã đầy đủ. Empty stream: oldest_sequence=1, watermark/next_after_sequence=0, has_more=false.
- WS gửi `{"type":"hello","schema_version":"1.0","epoch":"…","watermark":0}` sau khi subscribe trước khi chụp watermark; client buffer delta trong lúc REST catch-up rồi dedupe delivery_id/upsert alert.id theo delivery sequence. Client ping/ server pong mỗi 20 giây; quá 60 giây không phản hồi thì reconnect. Frame tối đa 64 KiB, buffer tối đa 1000 events; overflow không drop im lặng, close 4409 và REST resync. Revoke/expiry close 4401/4403, không reconnect bằng credential cũ. Alert.data được server allowlist/redact, không đưa credential/raw sinh trắc học; UI render untrusted text.
- Report SSE xác thực fetch Bearer, Last-Event-ID sequence, UTF-8 framing/bounds/terminal thật. Sequence gap/expired job phải resync qua status hoặc 410, không bỏ mất sự kiện ngầm.

## 7. G4 - Analytics

Dashboard cần dashboard:read + permission nguồn + analytics domain cho từng metric; không trả totals chứa domain bị ẩn. DTO có period/snapshot/data_as_of/definition version/authz version/metrics/coverage/source watermarks/warnings. Cache scope user/permissions/authz_version/filters/definition version, revoke làm cache cũ không sử dụng được.

Core metric catalog đầu tiên: verification attempts ENTRY/EXIT; PASSED/(PASSED+FAILED), mẫu số 0 ->null; reason counts mỗi code/log dedupe; barrier ACK counts; pedestrian verification counts có registry đủ điều kiện. Gate attempts không phải số người/xe đã qua; PASS ratio không accuracy. Chưa crossing/session/baseline/ground truth thì occupancy/chấm công/AI accuracy unavailable. G4 chốt metric IDs/formula/telemetry/backfill trước MG4, không tự gán cổng hoặc lịch sử chưa biết.

Số liệu do code tính, current snapshot không đổi tên thành cuối kỳ quá khứ; source không đồng thời ghi watermark/partial và không tính cross-source ratio không hợp lệ. Charts có unit/definition/source và bảng text tương đương; drilldown chỉ route/filter đã hỗ trợ cùng quyền.

## 8. G5/G6 - Assistant và vòng đời report

- ModelGateway self-hosted; model/runtime/license/hardware/latency/memory benchmark còn chờ G5. Không cài model lớn hoặc fallback cloud trong M0.
- Chỉ owner được read/history/events/cancel/export, cần quyền hiện tại của source + aggregate; ADMIN không read-all ngầm. Request filters typed, prompt max 4000 chars, không arbitrary DB/URL/action tools.
- Chỉ aggregate snapshot bất biến/metric refs vào model; không raw face/embedding/UID/phone/plate/notes/alert.data/cargo_metadata mặc định. Secrets/Restricted hard-block UI và server; prompt/source không nâng scope/tools.
- Code tính số và final schema/numeric/citation/domain validator trước publish. Sai số/source/citation ->FAILED hoặc labeled data_summary từ số thật; không trả report “AI thành công” giả.
- Durable jobs QUEUED ->RUNNING ->VALIDATING ->COMPLETED; FAILED/CANCEL_REQUESTED/CANCELED; worker claim/lease/deadline/recovery/bounded concurrency. Submit có Idempotency-Key scope owner/payload, khác payload cùng key ->409.
- Stream phase đầu chỉ stage/status thật, không chain-of-thought hoặc timer %. Abort là dừng theo dõi; cancel request khác worker xác nhận CANCELED; completion thắng race vẫn COMPLETED. Adapter không dừng tức thì phải giữ trạng thái thật và chặn publish sau revoke.
- Contract artifact phase đầu JSON có citations; download chỉ hoàn tất/có artifact và còn quyền/expiry; không raw model HTML. PDF là lựa chọn sau khi có renderer/retention riêng.
- Retention/expiry/quotas/lease/deadline cụ thể cần G6; chưa có số production được duyệt. Không bật worker/export production khi thiếu G5/G6. Hết expiry chặn read/events/download/cache/artifact; purge prompt/context/snapshot/artifacts có evidence, chỉ audit metadata redact còn lại.

## 9. Migration và rollback bàn giao

Migration files ở M1 phải additive/idempotent, có indexes và version state: map enum-role trước mở readers mới, so baseline quyền cũ, seed quyền mới theo review G2, migrate sessions có cutoff và không phục hồi credentials revoke. Audit transaction và version fan-out trước bật custom roles. Registry/capture/telemetry backfill unknown có coverage; không suy person/gate/vehicle category từ source không đủ.

Rollback ưu tiên feature/deployment switch trong compatibility window; giữ schema/data/audit mới, không drop collection hoặc khôi phục password/role/session cũ. Model unavailable tắt generation nhưng giữ Dashboard thật. Core release không bị chặn bởi kho/action extension. Không archive/commit/merge tự động trong apply.

## 10. Bằng chứng và decision gates

| Gate | Đầu ra cần review | Trạng thái hiện tại |
| --- | --- | --- |
| G1 | Auth/version/cookie/rotation/TTL/compatibility tại mục 2–3 | Review candidate, chưa phê duyệt |
| G2 | DTO admin, permission-seed, protected/last-admin/version/audit | Review candidate, chưa phê duyệt |
| G3 | DTO ingest/verify/lookup/registry và trust policy; calibration/reader/ROI thật | Contract candidate; hiện trường chưa xác nhận |
| G4 | Metric definitions/filters/telemetry/coverage | Policy candidate; cần triển khai/đối chiếu nguồn M3–M4 |
| G5 | Model/runtime/hardware/license benchmark | Chưa chọn/benchmark |
| G6 | Expiry/retention/limits/artifact/storage | Schema/lifecycle candidate; chưa phê duyệt tham số vận hành |
| G7 | Theme/sidebar/screenshot/page-state matrix | Theo design report; chưa có UI để visual acceptance |
| MG0 | Runtime snapshot, target spec, contract tests, test env thật và review | Chưa đạt cho tới khi đủ evidence và review |

Lệnh kiểm tra cục bộ:

```powershell
.venv\Scripts\python.exe scripts/export_openapi.py --check
.venv\Scripts\python.exe scripts/export_api_inventory.py --check
.venv\Scripts\python.exe scripts/export_migration_contracts.py --check
.venv\Scripts\python.exe -m pytest tests/contract -q
```

`--check` không ghi đè snapshots; drift phải export/review có chủ đích. Không đánh dấu MG0/MG1 hoặc UI integration hoàn thành từ việc sinh JSON hay pass unit tests. Môi trường Mongo/MinIO thật và các approvals chưa đủ là blockers được ghi rõ, không thay bằng runtime mocks.

## 11. Phê duyệt MG0

Người dùng đã đồng ý gói MG0 ngày 20/10/2026 trong hội thoại. Quyết định này chốt contract/policy/seed đề nghị để bắt đầu M1 và foundation độc lập; không xác nhận hardware G3, coverage G4, benchmark G5, tham số vận hành G6 hoặc UI G7 đã nghiệm thu. Trạng thái review candidate ở các bảng trên là lịch sử lúc chuẩn bị, không phải yêu cầu hỏi lại MG0.
