# API cần phối hợp theo tiến độ Frontend

Cập nhật 21/10/2026. **Team backend triển khai API; Frontend không đợi hoàn tất cả M1 để dựng UI.** Tích hợp từng endpoint khi có contract/runtime kiểm chứng. Mã backend dở dang trong working tree chưa được nghiệm thu. Không tiếp tục sửa backend trong lượt triển khai Frontend này.

Nguồn: [thiết kế](../frontend-architecture.md), [inventory v1](runtime-inventory.json), [contract mục tiêu](migration-v1.md), [OpenAPI mục tiêu](migration.openapi.json). OpenAPI mục tiêu là đề xuất đã duyệt MG0, không phải bằng chứng endpoint đã hoạt động.

## API hiện được Frontend sử dụng

| Màn hình | Method/path hiện có | Mức tích hợp Frontend |
| --- | --- | --- |
| Đăng nhập/phiên | POST `/api/v1/auth/login`, GET `/api/v1/auth/me`, POST `/api/v1/auth/logout` | Session cookie + CSRF trong RAM; permission adapter baseline v1; không giả JWT |
| Overview/Hệ thống | GET `/health/live`, GET `/health/ready` | Hiển thị đúng từng kết quả/error; không suy thiết bị khỏe |
| Phương tiện | GET/POST `/api/v1/vehicles`, PATCH/DELETE `/api/v1/vehicles/{vehicle_id}` | Danh sách + tạo/sửa/ngừng hoạt động; parse DTO; không tự retry mutation |
| Hồ sơ nhận diện | GET `/api/v1/drivers` | Danh sách chỉ đọc; chưa coi Driver là EmployeeRegistry hoặc User |
| Kho hàng | GET `/api/v1/warehouse/orders` | Danh sách chỉ đọc, giữ nghĩa trạng thái order và hiệu lực |

11 HTTP operations ở trên đã có lời gọi trong source Frontend. Unit tests dùng response tổng hợp cô lập; chưa nghiệm thu integration nghiệp vụ khi API thật tại `127.0.0.1:8000` chưa chạy. Các API CRUD/enrollment/dock/slip khác đã có ở v1 sẽ được tích hợp theo màn hình, không yêu cầu team backend viết lại chỉ vì Frontend chưa dùng.

## Khoảng trống và ưu tiên bàn giao

| ID | Màn hình / ưu tiên | Team backend cần bàn giao | Frontend hiện xử lý |
| --- | --- | --- | --- |
| FE-G01 | Auth/JWT, P0 | Auth v2 login/me/refresh/logout/change-password + WS ticket; public OpenAPI khớp runtime, examples không secret; access claims/TTL, cookie/Origin/CSRF, rotation 409/reuse policy, restricted principal, durable revoke, permission/authz versions, compatibility cutoff và test account theo role | Dùng session v1 tường minh; không refresh v2 hoặc fallback tự động. Chuyển adapter khi endpoint được nghiệm thu, không cần chờ cả các gói analytics/report |
| FE-G02 | Users/Roles/Audit, P0 | Các endpoint admin users/roles/catalog/sessions/audit trong contract mục tiêu; một role/user, expected_version/reason/allowlist, cursor/coverage, protected ADMIN/last-admin, grantable permissions, audit atomic đã redact và revoke xuyên worker. DTO đọc không password/hash/token | Route giữ trạng thái chưa khả dụng, không gửi request dự kiến. Bật từng màn hình theo endpoint bàn giao |
| FE-G03 | Cổng xe/nhân viên đi bộ, P1 | Employee/enrollment mapping, access-points/grants, pedestrian verify/log/evidence; vehicle catalog + legacy mapping; trusted capture bundle/encounter/freshness/ROI/calibration và idempotent verify/operation lookup. Giữ device ACK khác actual crossing; không plate giả cho đi bộ | Chưa bật workflow xác minh chưa đủ contract. Các API multipart legacy hiện có cần được review theo trust policy trước dùng cho vận hành camera |
| FE-G04 | Dashboard, P1 | Hai analytics endpoints đã chốt; typed filters, metric definitions/version/source, [from,to), timezone, watermarks/data_as_of/coverage, null vs zero, auth áp toàn tập. Không suy tổng từ list giới hạn; không gọi PASS là AI accuracy hoặc ACK là occupancy | Không hiện KPI/biểu đồ/số 0 giả; chỉ health thật và mô tả chức năng đang chuẩn bị |
| FE-G05 | AI Assistant, sau aggregate | Sáu report operations đã chốt: create/list/detail/events/cancel/download, durable jobs, authorization owner/domain, event cursor/expiry/retention, aggregate snapshot/citations/numeric validation. ModelGateway nội bộ/self-hosted, không tự fallback cloud, không barrier/action tools | Route chưa khả dụng, không gọi model trực tiếp hoặc dựng báo cáo mẫu trong runtime |
| FE-G06 | Tất cả list/mutations, bổ sung theo màn hình | Pagination/cursor/has_more/coverage và bộ lọc/search thực sự hỗ trợ cho vehicles/drivers/orders; thống nhất 409/422 và X-Request-ID. Tạo/cập nhật cần policy idempotency/lookup/version khi mất response để frontend reconcile thay vì gửi lặp | Tìm kiếm local chỉ trong tập đã tải; hiển thị số đã tải thay tổng. Save bị mất phản hồi/sai DTO → giữ outcome chưa rõ, chặn gửi lại và kiểm danh sách; không tự retry POST |
| FE-G07 | Hệ thống, theo nhu cầu vận hành | Health/telemetry riêng camera/model/device với timestamp và quyền; schema trạng thái unavailable/degraded, không expose secrets hoặc URL nội bộ tùy tiện | Chỉ hiển thị DB/app health; camera/model/barrier là chưa xác định |

P0/P1 thể hiện thứ tự hỗ trợ màn hình, không yêu cầu hoàn tất một gói khổng lồ trước khi Frontend được tiếp tục. Phạm vi kho trước mắt là màn hình, không gắn order/QR vào Gate Out. Enrollment, thẻ, logs/evidence và dock/slip hiện có sẽ được Frontend nối tiếp theo chức năng.

## Checklist bàn giao từng endpoint

1. Method/path/version và OpenAPI lấy từ môi trường chạy thật; request/query/multipart/bytes, enums/nullability/required fields và examples khớp DTO.
2. Permissions, target guards/state machine, session/JWT compatibility, CSRF/Origin và tài khoản test thật trong môi trường cô lập.
3. Success/error/status/validation/conflict, X-Request-ID, timeout/cancel/retry/idempotency/reconciliation và pagination/coverage có semantics rõ.
4. Unit/integration/negative/security evidence từ team backend; giới hạn môi trường và migration/cutoff nếu thay contract.
5. Frontend cập nhật generated types + runtime schema/API mapper/hook, ghép component dùng chung, chạy kiểm tra và chỉ bật chức năng khi dùng dữ liệu thật. Không đánh dấu thành công từ checkbox hoặc file contract đơn thuần.
