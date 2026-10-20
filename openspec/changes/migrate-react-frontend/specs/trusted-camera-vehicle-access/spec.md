## ADDED Requirements

### Requirement: CAM-01 - Catalog phương tiện và mapping dữ liệu cũ

Backend SHALL công bố catalog motorcycle/car/truck cùng legacy mapping và unknown semantics; vehicle_type SHALL phản ánh hồ sơ chuẩn hóa, không tự coi là AI classification. Migration MUST giữ coverage/giá trị không ánh xạ được dưới trạng thái unknown, không tự đoán hoặc nâng unknown thành loại hợp lệ để cấp phép. Xe máy/ô tô/xe tải SHALL đều dùng RFID, face và plate theo policy core; không yêu cầu order/QR kho tại Gate Out.

#### Scenario: Mapping loại xe legacy
- **GIVEN** hồ sơ cũ có sedan hoặc chuỗi vehicle_type chưa được hỗ trợ
- **WHEN** migration/catalog adapter chuẩn hóa dữ liệu
- **THEN** sedan chỉ chuyển thành car theo mapping đã công bố, chuỗi không biết giữ unknown và có coverage; không ghi thành AI đã phân loại xe

#### Scenario: Xe hợp lệ không có order kho
- **GIVEN** xe máy, ô tô hoặc xe tải có factors và driver–vehicle authorization hợp lệ
- **WHEN** xe thực hiện luồng Gate Out core
- **THEN** policy không yêu cầu slip/order kho và không tự chuyển order sang COMPLETED

### Requirement: CAM-02 - Face đúng người ở cả bốn access modes

Face SHALL bắt buộc cho pedestrian/motorcycle/car/truck, so khớp 1:1 chủ thẻ; không tự nhận diện 1:N hoặc tuyên bố kiểm mọi hành khách. Vehicle verification SHALL cần thẻ/chủ thẻ active, face, plate và driver–vehicle authorization. Mặt lớn nhất MUST không mặc nhiên là người lái; face quality/liveness/association không đạt MUST fail-closed, không bỏ face theo loại xe.

#### Scenario: Hành khách gần camera hơn người lái
- **GIVEN** trong frame ô tô/xe tải có mặt hành khách lớn hơn mặt người lái
- **WHEN** hệ thống không đủ association evidence để xác định đúng người điều khiển
- **THEN** hệ thống từ chối hoặc yêu cầu capture lại theo quy trình, không cấp phép chỉ vì mặt lớn nhất khớp thẻ

#### Scenario: Xe máy che mặt hoặc nhiều người đi bộ
- **GIVEN** người điều khiển xe máy bị mũ che, mặt thiếu/mờ hoặc pedestrian capture có nhiều người chưa phân biệt được
- **WHEN** face factor không đạt quality/association policy
- **THEN** backend SHALL trả trạng thái thiếu/không hợp lệ đúng factor và MUST không tạo nhánh bỏ face để cấp permit

### Requirement: CAM-03 - Capture manifest có nguồn đáng tin

Gateway SHALL xác thực thiết bị và tạo manifest server versioned với bundle/encounter, access mode, camera/lane/access-point, frame integrity, timestamps và device identity. Backend SHALL kiểm nguồn/binding/quyền dùng bundle. Browser metadata MUST không được tin; ingestion/verify SHALL có contract trước tích hợp và legacy multipart MUST không bypass strict camera policy.

#### Scenario: Bundle được gateway hợp lệ ghi
- **GIVEN** gateway đã auth được bind với camera/lane/access point cho phép
- **WHEN** gateway ingest frames và verify tham chiếu bundle đó
- **THEN** server SHALL kiểm manifest có schema_version, capture_bundle_id/encounter_id, access_mode, camera/lane/access_point IDs, frame refs/hashes, captured_at/received_at và authenticated device identity; SHALL kiểm nguồn frame, integrity, binding và quyền dùng bundle trước factors/permit

#### Scenario: Browser tự khai ảnh mới hoặc camera khác
- **GIVEN** request có captured_at/ROI tự khai, bundle không tồn tại, hash khác hoặc device không được bind với lane
- **WHEN** request yêu cầu verification theo strict camera policy
- **THEN** backend SHALL từ chối; timestamp/ROI/track metadata browser tự khai MUST không thành bằng chứng hoặc được chấp nhận qua legacy/manual multipart

#### Scenario: Bundle khớp access mode
- **GIVEN** ingestion tạo bundle xe hoặc người đi bộ theo schema đã công bố
- **WHEN** verify kiểm manifest và frame references
- **THEN** vehicle bundle SHALL có plate+face cùng nguồn đáng tin, pedestrian bundle MUST không bị buộc có plate; ingestion/verify extension version SHALL được chốt trước tích hợp

### Requirement: CAM-04 - Correlation và freshness cùng encounter

Backend SHALL ghép RFID, face và plate theo cùng encounter/access point/lane với freshness/max-skew, quality và association policy versioned. Encounter/capture refs SHALL có phạm vi và hạn sử dụng rõ; ROI/calibration SHALL được quản lý từ nguồn server. Ảnh cũ/replay, face của encounter khác, sai xe/làn, nhiều candidates hoặc không xác minh được thời gian/binding MUST fail-closed. Track ID SHALL không được coi là person identity.

#### Scenario: Thẻ mới nhưng ảnh mặt cũ
- **GIVEN** RFID thuộc encounter hiện tại nhưng face frame đã quá freshness hoặc không cùng bundle hợp lệ
- **WHEN** verify kiểm correlation
- **THEN** backend từ chối với reason code phù hợp, không reuse ảnh cũ để vượt face factor

#### Scenario: Plate và face lệch thời gian hoặc làn
- **GIVEN** hai ảnh đều nhận dạng được nhưng khác lane/encounter hoặc vượt max-skew
- **WHEN** hệ thống xét permit
- **THEN** kết quả không đạt association policy và không phát lệnh thiết bị dù từng factor độc lập có score cao

### Requirement: CAM-05 - Edge dùng RFID và trigger thật

Edge SHALL lấy RFID thật, trigger/presence/encounter và debounce theo contract; gửi đúng fields/envelope, bỏ slip_image kho cũ khỏi core exit. Retry SHALL giữ event_id, đúng loại lỗi và bounded/expiry; vòng snapshot MUST không tạo lượt mới. Thiếu RFID/capture MUST không được thay bằng UID/ảnh/biển số giả.

#### Scenario: Một xe đứng trước camera qua nhiều interval
- **GIVEN** cùng xe/người vẫn thuộc một encounter và chưa có trigger lượt mới
- **WHEN** edge lấy nhiều frames hoặc retry sau lỗi mạng
- **THEN** edge SHALL giữ lifecycle/event của cùng lượt và debounce, không tạo nhiều lượt xác minh hoặc lệnh mở từ vòng lặp thời gian

#### Scenario: Card reader thiếu dữ liệu
- **GIVEN** đầu đọc chưa cung cấp card_uid hợp lệ
- **WHEN** edge chuẩn bị verification
- **THEN** edge báo trạng thái thiếu RFID và không gửi payload thiếu bắt buộc hoặc tự chèn UID giả; integration test xác nhận request hợp lệ không còn lỗi 422 do thiếu card_uid

#### Scenario: Phân loại lỗi trước retry
- **GIVEN** verification trả HTTP validation/auth/business error hoặc lỗi mạng tạm thời
- **WHEN** edge quyết định retry
- **THEN** client SHALL chỉ retry lỗi đủ điều kiện, giới hạn số lần/backoff/expiry theo contract, giữ event_id và MUST không lặp vô hạn validation/auth/business failures

### Requirement: CAM-06 - Idempotency theo scope và fingerprint

Backend SHALL dùng server namespace + event_id, bind bất biến mode/direction/device/gate cùng request/manifest fingerprint. Same key/binding/fingerprint SHALL trả cùng operation; thay binding/payload SHALL conflict. Claim/dedup MUST atomic xuyên worker, có retention/replay policy và command idempotency để không mở lặp.

#### Scenario: Hai request giống nhau tới hai worker
- **GIVEN** cùng key, actor/device scope và fingerprint hợp lệ
- **WHEN** hai worker xử lý đồng thời hoặc response lần đầu bị mất
- **THEN** reservation/claim/dedup SHALL atomic xuyên worker, chỉ một operation có quyền thực hiện side effect; retry SHALL nhận cùng operation/outcome thật và command idempotency MUST ngăn phát thêm lệnh mở

#### Scenario: Event bị dùng lại với gate hoặc evidence khác
- **GIVEN** event_id đã bind với encounter/fingerprint và gate/device cụ thể
- **WHEN** request dùng lại ID với direction, access mode, gate, device hoặc ảnh/bundle khác
- **THEN** server SHALL trả conflict, không trả kết quả cũ như request mới đã xác minh; MUST không coi scope khác là key mới để phát thêm lệnh

#### Scenario: Retry ngoài cửa sổ idempotency
- **GIVEN** event đã có kết quả nhưng sắp hết hoặc đã hết retention window
- **WHEN** client retry/replay event_id
- **THEN** server SHALL áp retention/replay policy đã công bố và MUST không âm thầm tái mở thiết bị như một lượt mới chỉ vì record dedup hết hạn

### Requirement: CAM-07 - Decision, command, ACK và reconciliation

Application policy SHALL quyết định permit; AI chỉ tạo observation, MUST không gọi barrier. Kết quả SHALL tách verification/permit/command/ACK; OPENED MUST cần ACK hợp lệ và điều kiện backend. Command/ACK SHALL bind event/gate/device, có timeout/lookup. Browser abort MUST không giả cancel; ACK MUST không tự thành crossing/chấm công/occupancy.

#### Scenario: Verification PASS nhưng thiếu ACK
- **GIVEN** factors hợp lệ và lệnh thiết bị đã gửi nhưng ACK chưa đến
- **WHEN** thời hạn chờ kết thúc
- **THEN** server/client SHALL phản ánh pending/failed/outcome_unknown thật và lookup cùng operation để reconcile; network timeout MUST không chứng minh cổng đóng, không báo đã mở hoặc retry bằng event mới

#### Scenario: ACK sai thiết bị hoặc trùng
- **GIVEN** một command đang chờ ACK từ device/gate đã bind
- **WHEN** ACK từ nguồn khác, không khớp correlation hoặc bị gửi lặp
- **THEN** backend MUST không mở rộng permit hoặc tạo thêm command; chỉ ACK hợp lệ SHALL cập nhật trạng thái idempotently

#### Scenario: Browser ngừng theo dõi sau khi gửi command
- **GIVEN** thiết bị có thể đã nhận lệnh mở
- **WHEN** browser abort request hoặc đóng trang
- **THEN** server SHALL tiếp tục ghi/reconcile outcome thật và MUST không coi abort là đã cancel hay đã đóng cổng; ACK hợp lệ MUST không tự ghi crossing, chấm công hoặc occupancy

### Requirement: CAM-08 - Fail-closed, evidence và telemetry có nghĩa

Lỗi camera/AI/storage/device hoặc policy không xác minh được SHALL fail-closed và ghi factors/reasons thật. Logs SHALL giữ provenance, access mode/gate khi biết và unknown có coverage. Telemetry MUST đo đúng các mốc pipeline; thiếu mốc không suy latency. Evidence SHALL private, kiểm quyền/retention và không lộ biometric/secrets trong log.

#### Scenario: AI hoặc evidence storage hỏng
- **GIVEN** một factor không thể thực thi hoặc evidence không lưu được theo policy
- **WHEN** use case xử lý lỗi
- **THEN** hệ thống MUST không phát lệnh mở, SHALL ghi processing failure/factor states thật; factor chưa chạy do từ chối sớm MUST không được báo thành công hoặc âm thầm chuyển xử lý thủ công

#### Scenario: Thống kê denied events và latency
- **GIVEN** có lượt bị từ chối trước khi tạo command và có historical logs thiếu gate/telemetry
- **WHEN** analytics đọc dữ liệu access
- **THEN** denied events MUST không bị mất vì thiếu GateCommand; logs SHALL giữ access mode, gate/access-point refs và provenance khi biết, lịch sử không backfill được giữ unknown/coverage; latency thiếu mốc SHALL trả unavailable

#### Scenario: Đo latency theo đúng các mốc pipeline
- **GIVEN** backend muốn công bố AI hoặc end-to-end latency
- **WHEN** thu telemetry cho một operation
- **THEN** telemetry SHALL phân biệt received_at, verification_completed_at, command_sent_at và acknowledged_at; occurred_at/completed_at cũ MUST không tự được coi là AI/end-to-end latency
