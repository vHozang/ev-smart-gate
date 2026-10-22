## ADDED Requirements

### Requirement: PED-01 - Registry nhân viên tham chiếu enrollment

Backend SHALL cung cấp Employee registry có employee_id, person_id tham chiếu enrollment, employee_code unique, is_active, version và audit metadata. Driver identity/DTO SHALL được tái sử dụng qua adapter, không sao chép embedding hoặc tự tạo User. Driver bên ngoài MUST không mặc nhiên là nhân viên; registry SHALL do operator có permission quản lý.

#### Scenario: Liên kết nhân viên với hồ sơ đã enrollment
- **GIVEN** hồ sơ person/Driver đã enrollment thật và actor có employees:create
- **WHEN** actor tạo registry với person_id và employee_code hợp lệ
- **THEN** backend SHALL tạo registry tham chiếu cùng identity/biometric profile, không tạo embedding hoặc tài khoản đăng nhập thứ hai; MUST không giả HR sync, phòng ban hoặc chấm công chưa có contract

#### Scenario: Mã trùng hoặc person không tồn tại
- **GIVEN** employee_code đã tồn tại hoặc person_id không trỏ tới enrollment hợp lệ
- **WHEN** actor tạo registry
- **THEN** backend từ chối theo error contract, không tạo registry mồ côi hoặc báo onboarding hoàn tất

### Requirement: PED-02 - Onboarding nhiều bước có tính nhất quán

Enrollment và registry SHALL có idempotency/transaction hoặc compensation được contract hóa để xử lý kết quả từng bước và retry. UI/backend MUST không báo toàn bộ onboarding hoàn tất khi mới enrollment thành công nhưng registry chưa tồn tại. Registry PATCH SHALL allowlist fields, kiểm expected_version, giữ employee_code unique và audit; việc liên kết lại identity MUST đi qua policy rõ, không PATCH tùy ý embedding/permissions/User.

#### Scenario: Enrollment thành công nhưng registry lỗi
- **GIVEN** ảnh và identity đã enrollment nhưng bước tạo Employee thất bại
- **WHEN** operator xem kết quả hoặc retry cùng onboarding operation
- **THEN** hệ thống thể hiện trạng thái chưa hoàn tất, cho recovery/idempotency có kiểm soát và không tạo identity trùng

#### Scenario: Registry được sửa từ version cũ
- **GIVEN** registry đã thay đổi kể từ lần actor tải form
- **WHEN** actor gửi PATCH với expected_version cũ
- **THEN** server trả 409, giữ registry hiện hành và không thay identity/access state ngoài ý định

### Requirement: PED-03 - Physical access grants riêng theo lối đi

PedestrianAccessGrant SHALL xác định employee_id, access_point_ids hợp lệ, directions, valid_from/valid_until, status/version, reason và audit. Access points SHALL lấy từ cấu hình server có mode/device binding. Physical grants MUST độc lập User roles/permissions và driver–vehicle authorizations. Backend SHALL validate nhân viên/lối đi/thời hạn, kiểm permissions create/read/revoke và cung cấp list/revoke có concurrency semantics theo contract.

#### Scenario: Cấp grant giới hạn lối đi và hướng
- **GIVEN** operator có pedestrian-grants:create và registry active
- **WHEN** operator cấp ENTRY grant tại lối A trong một khoảng thời gian
- **THEN** grant chỉ cho đúng nhân viên, lối A, hướng ENTRY và kỳ đã xác định; không tự cho EXIT hoặc mọi cổng

#### Scenario: Có tài khoản hoặc ủy quyền xe nhưng thiếu grant
- **GIVEN** người có User role hoặc driver–vehicle authorization nhưng không có pedestrian grant phù hợp
- **WHEN** người đó xác minh tại lối đi bộ
- **THEN** access policy từ chối, không suy quyền vật lý từ tài khoản hay ủy quyền xe

### Requirement: PED-04 - Xác minh người đi bộ bằng thẻ và mặt

Backend SHALL cung cấp entry/exit đi bộ riêng, không yêu cầu plate/vehicle/order giả. Permit SHALL cần thẻ active, chủ thẻ hợp lệ, face mới 1:1 đúng chủ thẻ, registry active và grant đúng lối/hướng/thời hạn; capture trust SHALL tuân CAM-03/CAM-04. Thiếu bằng chứng, face quality/association không đạt hoặc lỗi camera/AI/storage MUST fail-closed, không bỏ face.

#### Scenario: Nhân viên có đầy đủ bằng chứng và quyền
- **GIVEN** cùng encounter có RFID thật, face mới đúng chủ thẻ, registry active và grant hợp lệ
- **WHEN** API đi bộ ENTRY hoặc EXIT kiểm toàn bộ factors
- **THEN** backend có thể cấp permit theo policy và ghi từng factor thật, không cần phương tiện hoặc ảnh biển số

#### Scenario: Thẻ không hợp lệ hoặc bằng chứng thiếu
- **GIVEN** thẻ bị mất/khóa, registry inactive, grant sai hướng hoặc thiếu/che/mờ/nhiều mặt chưa xác định đúng người
- **WHEN** xác minh đi bộ được yêu cầu
- **THEN** backend SHALL từ chối với reason codes/factor states thật; MUST không bỏ face hoặc báo đã face-verified nếu bị từ chối trước AI

### Requirement: PED-05 - Thu hồi quyền vật lý trước quyết định

Deactivate Employee hoặc revoke PedestrianAccessGrant SHALL có hiệu lực với request tiếp theo và encounter chưa có quyết định cuối; backend SHALL kiểm lại trạng thái/policy tại boundary trước khi phát lệnh thiết bị. Thay đổi SHALL có version/audit và không phụ thuộc cache UI. Khi lệnh đã được phát, revoke/cancel MUST không giả hoàn tác side effect vật lý; hệ thống SHALL ghi và reconcile outcome thật.

#### Scenario: Grant bị revoke trong lúc inference
- **GIVEN** encounter đã nhận ảnh nhưng chưa quyết định permit hoặc phát lệnh
- **WHEN** operator revoke grant hoặc deactivate Employee
- **THEN** final policy check từ chối phát lệnh theo grant cũ và ghi rõ kết quả thu hồi

#### Scenario: Thu hồi sau khi thiết bị đã nhận lệnh
- **GIVEN** lệnh mở đã được gửi trước khi thao tác revoke hoàn tất
- **WHEN** revoke được xử lý
- **THEN** các request tương lai bị chặn, còn encounter hiện tại phản ánh trạng thái/ACK thật; không tuyên bố đã hoàn tác việc mở cửa

### Requirement: PED-06 - Kết quả xác minh và trạng thái thiết bị tách biệt

PedestrianVerificationResponse SHALL tách card/face/employee/access-policy factors, permit, command và ACK cửa/turnstile nếu có. PASS/ACK MUST không tự thành actual crossing, chấm công hoặc hiện diện khi thiếu sensor/session/business rules. Timeout SHALL giữ outcome chưa biết khi phù hợp và reconcile theo event/operation contract; idempotency SHALL tuân CAM-06 đúng access mode.

#### Scenario: Permit hợp lệ nhưng thiết bị timeout
- **GIVEN** factors và grant đều hợp lệ nhưng lệnh cửa chưa có ACK xác nhận
- **WHEN** API hoặc client hết thời gian chờ
- **THEN** hệ thống hiển thị trạng thái chưa xác định/không mở được theo contract, không báo người đã đi qua và không phát lệnh mở mới bằng event khác để retry

#### Scenario: Không có crossing sensor
- **GIVEN** hệ thống chỉ có verification và ACK cửa
- **WHEN** logs hoặc Dashboard tổng hợp sự kiện đi bộ
- **THEN** dữ liệu được gọi là lượt xác minh/ACK, không được đổi tên thành chấm công, số người thực sự trong khu vực hoặc actual crossing

### Requirement: PED-07 - Nhật ký và evidence người đi bộ có quyền

Backend SHALL cung cấp person-access logs riêng với identity/event/encounter refs, direction/access point, factors/reasons, timestamps, evidence và device outcome. List SHALL có kỳ/filter/cursor/coverage; evidence MUST cần person-evidence:read cùng object policy, không public MinIO URL/raw biometric. Seed access SHALL cấp rõ theo nhiệm vụ, không suy từ role kho.

#### Scenario: Đọc evidence bằng ID đã biết
- **GIVEN** actor thiếu person-evidence:read hoặc quyền đối tượng
- **WHEN** actor gọi snapshot endpoint với access_log_id hợp lệ
- **THEN** backend MUST không trả ảnh, raw biometric hoặc đường dẫn storage dù actor đọc Dashboard hay có quyền domain xe khác

#### Scenario: Không giả person logs từ vehicle logs
- **GIVEN** hệ thống có vehicle logs nhưng chưa có sự kiện người đi bộ tương ứng
- **WHEN** client lấy person-access logs theo kỳ
- **THEN** backend chỉ trả nguồn person-access thật hoặc empty/coverage rõ, không chuyển mỗi vehicle verification thành một nhân viên đi bộ

#### Scenario: Seed quyền quản trị và vận hành đi bộ
- **GIVEN** hệ thống seed ADMIN, SECURITY và WAREHOUSE cho module đi bộ
- **WHEN** xác định permissions mặc định
- **THEN** ADMIN SHALL quản lý registry/grants, SECURITY SHALL đọc/vận hành theo permission; WAREHOUSE SHALL chỉ được đọc khi cấp rõ và MUST không mặc định có quyền verify đi bộ
