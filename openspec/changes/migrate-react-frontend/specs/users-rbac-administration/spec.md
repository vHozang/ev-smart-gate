## ADDED Requirements

### Requirement: RBAC-01 - Mô hình một role và catalog versioned

Hệ thống SHALL dùng một role_id hoạt động/User, catalog backend versioned và concurrency/revocation versions. Migration SHALL map enum sang system roles ADMIN/WAREHOUSE/SECURITY với quyền tương đương baseline, không tăng quyền. Catalog MUST chỉ chứa codes/dependencies tường minh; không thêm multi-role, hierarchy, direct-user grants hoặc deny overrides.

#### Scenario: Migration user từ enum role
- **GIVEN** user cũ thuộc ADMIN, WAREHOUSE hoặc SECURITY
- **WHEN** migration map role enum sang role_id
- **THEN** user SHALL liên kết đúng role_id ổn định, giữ quyền tương đương baseline và có báo cáo chênh lệch trước/sau; system role codes MUST bất biến, không hard-delete

#### Scenario: Role chứa code hoặc dependency không hợp lệ
- **GIVEN** actor được phép quản lý role
- **WHEN** actor gửi permission chưa có, wildcard hoặc tập quyền vi phạm dependency
- **THEN** backend SHALL từ chối toàn bộ thay đổi, không chấp nhận arbitrary code/wildcard hoặc tự cấp bổ sung quyền ngoài tập đã xác nhận

### Requirement: RBAC-02 - Authorization tại mọi boundary

Backend SHALL deny-by-default và kiểm principal/action/target cùng domain/state policy ở API, evidence/download, WS, analytics và reports. UI SHALL dùng principal contract để hỗ trợ UX, không quyết định quyền bằng menu hoặc role display name. Device scopes MUST độc lập operator RBAC; quyền operator MUST không thay physical grants.

#### Scenario: Gọi trực tiếp tài nguyên không có quyền
- **GIVEN** user không có permission đọc evidence hoặc đối tượng cần thiết
- **WHEN** user gọi URL ảnh/file hay API trực tiếp với ID đã biết
- **THEN** backend từ chối và không trả bytes/metadata nhạy cảm dù UI đã ẩn nút hay user có Dashboard shell

#### Scenario: Operator có quyền quản trị nhưng không có physical grant
- **GIVEN** một tài khoản quản trị được cấp users/roles permissions
- **WHEN** identity liên quan yêu cầu đi qua lối đi bộ nhưng không có grant hợp lệ
- **THEN** physical access policy từ chối; RBAC quản trị không thay grant nhân viên

#### Scenario: Deployment chưa có site hoặc tenant model
- **GIVEN** schema hiện chưa biểu diễn site/tenant và policy tương ứng
- **WHEN** triển khai hoặc mô tả khả năng authorization
- **THEN** hệ thống MUST không công bố cách ly theo chi nhánh/site/tenant hoặc suy scope đó từ role

### Requirement: RBAC-03 - Quản lý users qua use case và payload allowlist

Backend SHALL cung cấp users/profile/status/role/password-reset/sessions/revoke operations theo contract; username MUST chuẩn hóa và unique. Profile PATCH SHALL chỉ nhận fields profile cho phép; thay đổi cạnh tranh MUST kiểm expected_version/409 và operation nhạy cảm MUST có reason. Không public registration hoặc hard-delete User còn liên quan audit/nghiệp vụ.

#### Scenario: Mass assignment qua profile PATCH
- **GIVEN** actor chỉ có users:update
- **WHEN** request profile gửi kèm role_id, permissions, password hoặc is_active
- **THEN** backend SHALL từ chối fields role/password/is_active/permissions ngoài allowlist, không thay quyền, mật khẩu hay trạng thái tài khoản

#### Scenario: Hai quản trị viên sửa cùng user
- **GIVEN** hai actor đọc cùng version user
- **WHEN** actor thứ hai ghi sau khi version đã thay đổi
- **THEN** backend trả 409 và giữ dữ liệu đã được cập nhật, không ghi đè âm thầm

#### Scenario: Response quản trị user đã khử secrets
- **GIVEN** actor đủ quyền list/detail/create/update user theo contract
- **WHEN** backend trả kết quả operation
- **THEN** response MUST không chứa password hash, token hoặc credential; username SHALL được chuẩn hóa/unique và các operation nhạy cảm SHALL kiểm reason theo contract

### Requirement: RBAC-04 - Protected ADMIN và grantable policy

Gán/tạo ADMIN SHALL cần users:assign-role, users:assign-admin và grantable policy; sửa profile/status/role/reset ADMIN SHALL cần users:manage-admin, action permission và target policy. Protected permissions MUST chỉ cấp system ADMIN. Actor SHALL chỉ cấp role/permission trong grantable policy backend; payload/JWT cũ không mở rộng quyền cấp.

#### Scenario: Tạo user để tự nâng quyền ADMIN
- **GIVEN** actor có users:create và users:assign-role nhưng thiếu users:assign-admin
- **WHEN** POST tạo user kèm role ADMIN
- **THEN** backend từ chối toàn bộ thao tác và ghi outcome audit đã redact

#### Scenario: Reset mật khẩu ADMIN bằng permission thông thường
- **GIVEN** custom-role actor có users:reset-password nhưng không có users:manage-admin
- **WHEN** actor reset tài khoản ADMIN hoặc sửa role để chiếm quyền tài khoản đó
- **THEN** backend từ chối theo target policy, không thay credential hoặc quyền ADMIN

#### Scenario: Thêm protected permission vào custom role
- **GIVEN** actor đang sửa permission matrix của custom role
- **WHEN** payload chứa users:assign-admin hoặc users:manage-admin
- **THEN** backend SHALL từ chối cấp protected permissions ngoài system ADMIN, dù browser hoặc JWT cũ khai actor được phép cấp

### Requirement: RBAC-05 - Last-admin và role invariants dưới concurrency

Backend SHALL bảo toàn ít nhất một ADMIN hoạt động có khả năng quản trị; khóa/hạ quyền MUST không làm mất ADMIN cuối cùng. System ADMIN role MUST không bị deactivate hoặc xóa tập quyền quản trị cốt lõi. Kiểm invariant và ghi thay đổi SHALL atomic bằng transaction/concurrency control, không count rồi update tách rời. Deactivate/archive role đang gán user MUST bị chặn trừ khi có use case chuyển role transactional riêng đã được thiết kế.

#### Scenario: Hai ADMIN đồng thời hạ quyền nhau
- **GIVEN** hệ thống còn hai ADMIN hoạt động
- **WHEN** hai request cạnh tranh làm mỗi tài khoản mất vai trò ADMIN
- **THEN** concurrency control chỉ cho kết quả giữ ít nhất một ADMIN hoạt động và request vi phạm bị từ chối rõ

#### Scenario: Deactivate role vẫn còn user
- **GIVEN** một custom role còn được gán cho user
- **WHEN** actor deactivate hoặc archive role
- **THEN** backend từ chối, không để user trỏ tới role inactive hoặc tự chuyển họ sang role mặc định có quyền khác

### Requirement: RBAC-06 - Quản lý role và principal hiệu lực

Backend SHALL cung cấp role CRUD có kiểm soát, catalog chỉ đọc và replace permissions bằng operation riêng có reason/expected_version; archive chỉ cho custom role thỏa invariants. GET me SHALL trả principal versioned. Thay permissions MUST cập nhật version/invalidation toàn bộ users của role và sessions/WS/jobs/cache theo JWT-04.

#### Scenario: Sửa quyền từ version cũ
- **GIVEN** role permissions đã được quản trị viên khác cập nhật
- **WHEN** actor gửi tập permissions đầy đủ với expected_version cũ
- **THEN** backend trả 409, không merge hoặc ghi đè ngoài ý định và client tải lại tập quyền hiện hành

#### Scenario: Principal sau đổi role
- **GIVEN** user được gán role mới thành công
- **WHEN** user gọi me hoặc business API tiếp theo
- **THEN** backend SHALL dùng quyền/version mới; me SHALL công bố role_id/role_code, permissions hiệu lực, authz_version và must_change_password qua schema versioned, không giữ quyền cũ vì JWT còn hạn

#### Scenario: Chờ backend xác nhận thay quyền
- **GIVEN** frontend vừa gửi role/permissions change nhưng chưa nhận thành công
- **WHEN** UI thể hiện kết quả mutation
- **THEN** UI MUST chưa xác nhận quyền đã áp dụng; chỉ sau response backend mới reconcile principal và thông báo thành công

### Requirement: RBAC-07 - Reset mật khẩu và quản trị phiên an toàn

Reset mật khẩu SHALL là use case riêng có policy target, mật khẩu tạm được actor nhập qua luồng bảo vệ, must_change_password và revoke theo contract; response/log/audit MUST không trả hoặc ghi lại mật khẩu. Session list SHALL chỉ trả metadata đã redact, không credential. Revoke-all SHALL ảnh hưởng mọi session và WS của target theo phạm vi đã công bố. Khi chưa có email provider, hệ thống MUST không giả đã gửi email reset.

#### Scenario: Reset thành công
- **GIVEN** actor đủ action/target permissions và mật khẩu tạm hợp lệ
- **WHEN** reset mật khẩu hoàn tất
- **THEN** target bị revoke credentials theo policy, lần đăng nhập tiếp theo nhận principal hạn chế JWT-05 và response không lộ mật khẩu tạm

#### Scenario: Xem và thu hồi phiên
- **GIVEN** actor có users:read-sessions và users:revoke-sessions cho target
- **WHEN** actor xem phiên rồi yêu cầu thu hồi mọi phiên
- **THEN** API chỉ trả metadata an toàn và revoke có hiệu lực trên mọi worker/socket, không chỉ xóa danh sách trên UI

### Requirement: RBAC-08 - Audit append-only và nguyên tử

Audit SHALL ghi server actor/time, action, target, diff đã redact, request ID và outcome; audit thành công MUST atomic với mutation nhạy cảm. Audit MUST append-only, chỉ đọc có quyền qua filter/cursor, không có API sửa/xóa tùy ý. Secrets, biometric, raw prompt và dữ liệu nhạy cảm không cần thiết MUST bị loại khỏi audit/log.

#### Scenario: Audit storage lỗi khi đổi quyền
- **GIVEN** actor thực hiện thay đổi nhạy cảm cần audit atomic
- **WHEN** transaction không thể lưu audit thành công
- **THEN** thay đổi không được commit hoặc báo thành công; hệ thống trả lỗi phù hợp và không tiếp tục dùng quyền nửa chừng

#### Scenario: Giả actor và secret trong request
- **GIVEN** request chứa confirmedBy hoặc metadata cố ghi actor khác và mật khẩu/token
- **WHEN** backend tạo audit
- **THEN** actor SHALL lấy từ principal server và time từ server clock; diff MUST loại password, token/hash/credential, biometric, raw prompt và PII không cần thiết khỏi lịch sử/log

#### Scenario: Đọc hoặc sửa lịch sử audit
- **GIVEN** actor biết audit record ID hoặc muốn lọc lịch sử
- **WHEN** actor gọi API audit
- **THEN** backend SHALL chỉ cho đọc với audit-logs:read qua filters/cursor và MUST không cung cấp API sửa/xóa lịch sử tùy ý, kể cả cho ADMIN
