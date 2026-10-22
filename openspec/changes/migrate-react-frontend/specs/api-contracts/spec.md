## ADDED Requirements

### Requirement: API-01 - Danh mục hợp đồng có nguồn và version

Backend SHALL xuất OpenAPI khớp router/Pydantic chạy thật và danh mục method/path/permission cho từng operation. Danh mục MUST phân biệt 44 HTTP operations + 1 WebSocket đã khảo sát với API mới tại mục 10.7–10.9 của báo cáo, auth refresh/revoke/ticket, capture ingestion và event lookup. Client/types SHALL chỉ được sinh từ contract đã đối chiếu; breaking changes MUST có version/compatibility/deprecation rõ.

#### Scenario: Phát hiện contract drift

- **GIVEN** snapshot OpenAPI mô tả response khác runtime schema
- **WHEN** kiểm tra contract trước sinh frontend client
- **THEN** kiểm tra SHALL thất bại và chỉ rõ operation/schema lệch, không phát hành client dùng snapshot cũ.

#### Scenario: API mới chưa triển khai

- **GIVEN** một route mới chỉ có trong thiết kế
- **WHEN** frontend xét khả năng mở chức năng
- **THEN** hệ thống SHALL ghi trạng thái chưa khả dụng và không chuyển request sang mock/fallback success.

### Requirement: API-02 - DTO và lỗi có semantics tường minh

Contract MUST mô tả required/nullable/enums/units/timezone, query/body, multipart fields/boundary ownership, upload limits, binary Content-Type và validation errors. Envelope error.code/message/details và X-Request-ID SHALL được giữ hoặc migration rõ; 401, 403, 404, 409, 422, network/5xx MUST có cách phân biệt. TypeScript DTO sinh từ OpenAPI MUST được kết hợp runtime validation và mapper tường minh, không cast unknown để vượt lỗi hoặc bù field giả.

#### Scenario: Payload response thiếu field bắt buộc

- **GIVEN** backend response thiếu required verification_status
- **WHEN** boundary frontend validate trước cache/render
- **THEN** vùng liên quan SHALL báo contract error có request ID an toàn, không hiển thị xác minh thành công.

#### Scenario: Validation và file thật

- **GIVEN** một form multipart bị 422 hoặc endpoint trả bytes PDF/ảnh
- **WHEN** transport xử lý response
- **THEN** lỗi SHALL map tới field/form giữ input; binary SHALL được xử lý theo Content-Type và quyền, không ép mọi response thành JSON.

### Requirement: API-03 - Query và coverage không gây hiểu nhầm

List contract SHALL khai báo pagination/cursor, limit, sort/search/filter được hỗ trợ và total hoặc coverage. Unsupported filter MUST bị từ chối rõ hoặc capability-disable trước submit, không âm thầm bỏ qua. Aggregate và drilldown MUST có kỳ/phạm vi tương thích; dữ liệu list giới hạn không được mô tả là tổng toàn bộ hệ thống.

#### Scenario: List có giới hạn

- **GIVEN** response chứa tối đa 500 logs và không có total
- **WHEN** console trình bày dữ liệu
- **THEN** console SHALL nêu phạm vi đã tải và không dùng số items làm KPI tổng.

#### Scenario: Cursor và coverage có định nghĩa rõ

- **GIVEN** API trả danh sách phân trang với giới hạn tải
- **WHEN** client nhận cursor, has_more hoặc metadata coverage
- **THEN** client MUST phân biệt số bản ghi đã tải với tổng dữ liệu và không suy ra total khi backend chưa cung cấp.

#### Scenario: Filter theo cổng chưa có dữ liệu

- **GIVEN** historical logs thiếu gate_id và API chưa hỗ trợ filter gate
- **WHEN** người dùng xem bộ lọc Dashboard/logs
- **THEN** chức năng SHALL disabled/có nhãn chưa hỗ trợ; backend không suy đoán gate_id từ những lệnh barrier tồn tại.

### Requirement: API-04 - Capture ingestion và reconciliation trước tích hợp tự động

Milestone contract MUST xác định ingestion/verify schema version, trusted CaptureBundle manifest, device/gate/lane/access-mode binding và freshness policy; scope/fingerprint idempotency MUST được công bố. Backend SHALL cung cấp lookup có quyền theo stable event/operation ID để lấy trạng thái verification/permit/command/ACK hoặc chưa xác định. Client MUST không retry side effect mù sau timeout; không dùng legacy multipart để bypass strict capture policy.

#### Scenario: Timeout sau khi server nhận verify

- **GIVEN** server có thể đã tạo lệnh barrier nhưng browser mất response
- **WHEN** console reconcile bằng cùng event ID
- **THEN** lookup SHALL trả trạng thái đã biết theo quyền và scope; UI giữ outcome_unknown nếu chưa thể kết luận, không tự phát lệnh mới.

#### Scenario: Lookup không xác định được kết quả

- **GIVEN** request verification đã timeout và lookup không tìm thấy hoặc không còn giữ kết quả
- **WHEN** frontend tra cứu lại cùng event_id
- **THEN** UI MUST giữ outcome_unknown, không coi việc thiếu bản ghi là bằng chứng lệnh chưa thực thi và không tự phát lại lệnh barrier.

#### Scenario: Event ID bị tái sử dụng với nội dung khác

- **GIVEN** event ID đã gắn với một gate/device/direction/access mode và payload fingerprint
- **WHEN** request cùng ID thay payload hoặc scope
- **THEN** backend SHALL trả conflict, không dùng kết quả cũ hoặc gửi lệnh barrier mới.

### Requirement: API-05 - Hợp đồng realtime và job có thể phục hồi

WS/stream contracts MUST khai báo schema_version, event identity/sequence, scope, trạng thái terminal, reconnect/resync, retention/gap behavior, auth expiry/revoke và memory bounds. Report cancellation MUST có server acknowledgment; browser abort SHALL chỉ được mô tả là dừng chờ/theo dõi. Endpoint download MUST khai báo artifact availability/type/expiry và kiểm quyền tại thời điểm tải.

#### Scenario: Resync vượt một batch

- **GIVEN** client bỏ lỡ nhiều events hơn limit một response REST
- **WHEN** client reconnect theo sequence
- **THEN** contract SHALL cho phép tải tiếp các batch và xác định khi bắt kịp hoặc cần reset có coverage rõ.

#### Scenario: Realtime cursor vượt retention

- **GIVEN** client mất kết nối lâu hơn thời gian backend giữ lịch sử events
- **WHEN** client yêu cầu resync từ cursor cũ
- **THEN** backend MUST báo gap/retention rõ ràng để client thực hiện recovery theo contract, không tuyên bố đã đồng bộ đầy đủ.

#### Scenario: Stream ngắt khi job còn chạy

- **GIVEN** report worker chưa xác nhận cancel
- **WHEN** browser đóng stream
- **THEN** job SHALL vẫn có trạng thái server có thể tra cứu; console không gắn nhãn CANCELED do AbortController.

### Requirement: API-06 - Bàn giao kiểm thử và tương thích

Mỗi gói backend SHALL bàn giao OpenAPI/examples đã redact, permission matrix, migrations/indexes/backfill/rollback và cấu hình môi trường test thật theo BE-01–BE-07. Use case mới MUST có unit tests; contract/integration/E2E MUST kiểm auth, permissions, idempotency và failure semantics. Tài khoản/dữ liệu test SHALL cô lập production, không chứa biometric thật hoặc secrets trong repo; runtime console MUST không có mock mode.

#### Scenario: Mở chức năng mới cho frontend

- **GIVEN** UI và DTO đã sẵn sàng nhưng API/permission test chưa đạt
- **WHEN** xem xét nghiệm thu tích hợp
- **THEN** chức năng SHALL chưa được xác nhận hoàn thành; chỉ nghiệm thu sau API thật và evidence kiểm thử tương ứng.

#### Scenario: Rollback UI trong thời gian migration

- **GIVEN** React được phục vụ tại /console và còn client cũ
- **WHEN** cần rollback frontend
- **THEN** hợp đồng SHALL chỉ rõ compatibility còn hiệu lực và giữ kiểm quyền/CSRF của client cũ; rollback không khôi phục phiên đã revoke hoặc giảm chính sách bảo mật.
