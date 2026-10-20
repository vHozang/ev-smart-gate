## ADDED Requirements

### Requirement: AI-01 - Gateway model nội bộ và Assistant chỉ đọc

Browser SHALL chỉ gọi backend; backend SHALL dùng ModelGateway self-hosted nội bộ qua Protocol port/adapter thay thế được, không cloud fallback. Model/runtime/hardware MUST qua benchmark trước phần phụ thuộc. Assistant SHALL chỉ đọc aggregate và gợi ý kiểm tra, không side effects/DB tùy ý; video action gateway MUST là extension riêng.

#### Scenario: Model nội bộ không hoạt động
- **GIVEN** gateway timeout hoặc runtime model không sẵn sàng
- **WHEN** tạo báo cáo
- **THEN** job trả lỗi/fallback trung thực theo contract, không gọi cloud hoặc làm mất Dashboard aggregate thật.

#### Scenario: Prompt yêu cầu thay đổi nghiệp vụ
- **GIVEN** prompt yêu cầu mở cổng, đổi quyền hoặc chạy SQL/Mongo/URL tùy ý
- **WHEN** backend kiểm intent và tools
- **THEN** yêu cầu bị chặn khỏi side effects và không có executable tool/action được tạo từ output model.

#### Scenario: Benchmark và ranh giới gateway
- **GIVEN** team chọn model/runtime/hardware nội bộ
- **WHEN** chuẩn bị triển khai Assistant
- **THEN** có benchmark tiếng Việt/độ trễ/tài nguyên; Assistant không mở barrier, sửa order, approve dock, khóa user, cấp quyền, truy cập DB trực tiếp hoặc egress trái policy và không giả ActionObservationGateway là LLM báo cáo.

### Requirement: AI-02 - Intent tools và domain authorization

Backend SHALL validate prompt/template/kỳ/filters và chỉ dùng tools allowlist có schema qua AnalyticsQueryService. assistant:use/reports:generate chỉ là quyền vào; tool MUST có đủ quyền nguồn/aggregate domain. Prompt/source MUST không nâng instruction/quyền, scope SHALL từ principal server; dữ liệu kho MUST cần module và quyền thật.

#### Scenario: Có quyền Assistant nhưng thiếu quyền logs
- **GIVEN** user có quyền tạo report nhưng thiếu quyền nguồn hoặc aggregate của domain được hỏi
- **WHEN** submit prompt hoặc gọi report API trực tiếp
- **THEN** backend từ chối dữ liệu đó, không trả totals chứa phần bị ẩn hoặc cho phép suy quyền qua template khác.

#### Scenario: Prompt injection trong prompt hoặc nguồn
- **GIVEN** prompt/source chứa yêu cầu bỏ policy, đọc dữ liệu khác scope hoặc gọi tool ngoài allowlist
- **WHEN** tạo context và thực thi pipeline
- **THEN** scope không mở rộng, tool call trái schema/allowlist bị chặn và dữ liệu không được gửi tới model vượt quyền.

#### Scenario: Template kho và phạm vi từ principal
- **GIVEN** client/model gửi scope rộng hơn hoặc chọn warehouse template khi module chưa bật
- **WHEN** resolve report intent
- **THEN** server lấy scope từ principal, không theo model/client; template và dữ liệu kho chỉ khả dụng khi module thật bật và đầy đủ domain permissions.

### Requirement: AI-03 - Báo cáo grounded và kiểm chứng output

Backend SHALL tính số liệu bằng code từ snapshot bất biến; model chỉ diễn đạt mẫu có bằng chứng. Result SHALL có nội dung, nguồn, giới hạn và metadata; mọi số/citation MUST thuộc snapshot được phép. Output MUST qua schema/numeric/citation/domain validation trước COMPLETED; thiếu dữ liệu SHALL nêu rõ và suy luận nguyên nhân MUST ghi là giả thuyết.

#### Scenario: Model bịa số hoặc citation
- **GIVEN** model trả số không khớp aggregate, citation không tồn tại hoặc domain ngoài quyền
- **WHEN** validation final output
- **THEN** report không được công bố COMPLETED, trả lỗi hoặc template tổng hợp dữ liệu thật có nhãn rõ, không giả đó là câu trả lời AI hợp lệ.

#### Scenario: Nguồn thiếu hoặc không cùng snapshot
- **GIVEN** metric partial/unavailable hoặc có source watermarks khác nhau
- **WHEN** model tạo summary
- **THEN** output giữ coverage/limitations, không khẳng định nhân quả hay so sánh đòi cùng thời điểm mà nguồn không đáp ứng.

#### Scenario: Schema kết quả và thông tin chưa được cấu hình
- **GIVEN** model đã diễn đạt aggregate nhưng nguồn chưa có cấu hình ca làm việc
- **WHEN** validate GroundedReportResult
- **THEN** result có title, summary, findings, metric_refs, limitations, suggested_checks, snapshot_id, data_as_of và model/version; không invent số liệu/ca và mọi con số có metric/source trong snapshot được phép.

### Requirement: AI-04 - Report jobs bền vững và worker có giới hạn

Report SHALL lưu ownership/scope, request/snapshot/model metadata và lifecycle trong backend. Worker MUST tách API event loop, có claim/lease nguyên tử, deadline, concurrency/recovery policy. Tạo/retry SHALL idempotent; failure/timeout MUST có terminal/retry rõ, không RUNNING vô hạn. Status SHALL theo state machine report đã chốt.

#### Scenario: Worker chết trong khi chạy report
- **GIVEN** worker đang giữ lease cho một job
- **WHEN** worker chết hoặc deadline hết
- **THEN** recovery policy thu hồi lease và đưa job tới retry/terminal state hợp lệ, không hai worker cùng công bố final hoặc bỏ job RUNNING vô hạn.

#### Scenario: Submit lặp và giới hạn tải
- **GIVEN** user double-submit cùng idempotency key hoặc hệ thống đạt concurrency limit
- **WHEN** backend nhận request
- **THEN** job được dedupe/queue/reject đúng contract và API event loop vẫn đáp ứng; không tạo tiến trình giả để che quá tải.

#### Scenario: Metadata và state machine job
- **GIVEN** backend nhận yêu cầu report hợp lệ
- **WHEN** persist và chuyển trạng thái job
- **THEN** giữ owner, scope/authz_version, requested filters, metric_definition_version, snapshot/source refs, model version, status, expiry và audit metadata; chỉ dùng QUEUED/RUNNING/VALIDATING/COMPLETED hoặc FAILED/CANCEL_REQUESTED/CANCELED theo transitions hợp lệ.

### Requirement: AI-05 - Stream sự kiện xác thực và tiến trình thật

Report events SHALL có schema/version, ID/sequence, stage/time và terminal state thật. Browser SHALL dùng authenticated fetch, UTF-8/SSE parsing, bounded memory và stale guards; token dài hạn MUST không vào URL. Phase đầu SHALL stream stage/status, chỉ công bố final sau grounding; không chain-of-thought/timer %. Resume/live region MUST theo contract/stage.

#### Scenario: Frame bị chia hoặc reconnect
- **GIVEN** UTF-8/SSE frame bị chia qua chunks và client mất kết nối
- **WHEN** parse/resume report stream
- **THEN** sự kiện chỉ áp dụng khi frame/schema hợp lệ, sequence dedupe đúng và status cuối lấy từ backend, không mất terminal event hoặc crash shell.

#### Scenario: Progress chưa có sự kiện inference
- **GIVEN** job đang queue hoặc worker chưa phát stage mới
- **WHEN** UI chờ
- **THEN** UI giữ stage thật cùng trạng thái chờ, không tự tăng phần trăm hoặc dựng bước inference không tồn tại.

#### Scenario: Metadata sự kiện và thông báo tiếp cận
- **GIVEN** worker phát progress hoặc terminal event
- **WHEN** client nhận stream xác thực Bearer
- **THEN** kiểm schema/version, job ID, sequence/event ID, stage, timestamp và terminal state; memory bị giới hạn, stale event bị bỏ, live region announce theo stage/cụm thay vì từng token và nội dung cuối chỉ hiện sau grounding validation.

### Requirement: AI-06 - Cancellation và race với completion

Console SHALL tách dừng theo dõi, yêu cầu hủy và CANCELED thật. Endpoint SHALL ghi CANCEL_REQUESTED; worker xác nhận theo khả năng adapter. Completion thắng race MUST trả COMPLETED; abort/unmount MUST không đổi trạng thái server. GET status/events SHALL cho phép theo dõi lại; retry MUST tường minh theo contract.

#### Scenario: Dừng đọc stream
- **GIVEN** report đang RUNNING
- **WHEN** user dừng theo dõi hoặc rời page
- **THEN** reader/controller được cleanup nhưng backend không bị giả là đã hủy, UI dùng nhãn đã dừng theo dõi và có thể tải lại trạng thái thật.

#### Scenario: Yêu cầu hủy đua với final report
- **GIVEN** worker đang hoàn tất validation khi user gửi cancel
- **WHEN** backend phân xử terminal transition
- **THEN** chỉ một terminal state hợp lệ được giữ; completion thắng trả COMPLETED, cancel được xác nhận mới trả CANCELED và UI không phát toast hủy giả.

#### Scenario: Adapter chưa xác nhận dừng
- **GIVEN** job đã nhận CANCEL_REQUESTED nhưng inference adapter chưa dừng hoặc chưa hỗ trợ dừng ngay
- **WHEN** user tải trạng thái và tiếp tục theo dõi
- **THEN** job giữ trạng thái thật tới terminal acknowledgement, không tự thành CANCELED; GET status/events hỗ trợ resume và retry vẫn là hành động tường minh.

### Requirement: AI-07 - Privacy egress và tối thiểu hóa context

Context SHALL chỉ chứa aggregate/source refs tối thiểu có quyền; PII/biometrics/raw nguồn không được đưa mặc định. Secret/Restricted MUST hard-block cả UI và server trước model, không checkbox bypass. Confidential SHALL giảm thiểu/mask; regex MUST không là phân loại đầy đủ. Context/prompt/output nhạy cảm MUST không vào raw logs/audit/browser persist.

#### Scenario: Password hoặc card data trong prompt
- **GIVEN** user nhập password/token/Restricted card data vào Assistant prompt
- **WHEN** submit bằng UI hoặc gọi API trực tiếp
- **THEN** yêu cầu bị chặn trước model theo cùng policy, không lưu secret vào logs và không áp nhầm guard đó để cấm password gửi auth backend hợp lệ.

#### Scenario: Context aggregate được chuẩn bị
- **GIVEN** nguồn có raw PII, notes hoặc biometric evidence
- **WHEN** pipeline xây context cho model nội bộ
- **THEN** chỉ fields allowlist tối thiểu được phép đi vào context, không tự gửi raw dữ liệu vì provider nằm trong mạng nội bộ.

#### Scenario: Danh mục loại trừ context và bảo vệ nhiều lớp
- **GIVEN** nguồn có ảnh mặt, embeddings, phone, biển số, card UID, raw alert.data, cargo_metadata hoặc operator notes
- **WHEN** lọc context và telemetry
- **THEN** các trường này không vào context mặc định, Confidential được giảm thiểu/mask, regex không được coi là đủ và self-hosted vẫn phải kiểm soát prompt injection/rò output; key/secret/Restricted không thể bypass bằng checkbox.

### Requirement: AI-08 - Ownership revoke expiry và retention xuyên vòng đời

Report SHALL chỉ owner đọc/hủy với quyền domain hiện tại, không ADMIN read-all/cancel-any ngầm định. Quyền MUST kiểm xuyên lifecycle và revoke trên worker/cache/artifact. Expiry SHALL chặn cả cached content/artifact; retention MUST purge dữ liệu có kiểm chứng, chỉ giữ audit redact. Prompt/output backend SHALL có quyền và mã hóa phù hợp.

#### Scenario: Truy cập trực tiếp report người khác
- **GIVEN** user biết report_id của owner khác hoặc có role ADMIN nhưng không có policy quản trị report riêng
- **WHEN** gọi detail/events/cancel/download
- **THEN** backend từ chối, không lộ prompt/nội dung/totals hoặc dùng cache/artifact để bypass ownership.

#### Scenario: Thu hồi quyền khi đang stream hoặc tải artifact
- **GIVEN** report đang chạy/stream và quyền nguồn của owner bị thu hồi
- **WHEN** authz_version/revocation có hiệu lực theo contract
- **THEN** worker và các đường read/events/download ngừng cung cấp dữ liệu bảo vệ, cache không giữ quyền cũ và không thể reconnect để lấy phần còn lại.

#### Scenario: Report hết hạn
- **GIVEN** expiry đã qua và artifact từng được tạo
- **WHEN** read/reconnect/download hoặc retention purge chạy
- **THEN** nội dung không còn được trả từ API/cache/artifact, dữ liệu thuộc retention được purge có kiểm chứng và audit chỉ giữ metadata được phép.

#### Scenario: Các đường truy cập cùng chính sách retention
- **GIVEN** account/scope/authz_version thay đổi hoặc retention deadline đã đến
- **WHEN** create/read/history/events/reconnect/download hoặc purge job thực thi
- **THEN** từng đường đều kiểm quyền/expiry hiện tại; purge bao gồm prompt/context/snapshot/artifact có kiểm chứng và audit chỉ giữ metadata redact đúng policy.

### Requirement: AI-09 - UI report an toàn và acceptance có bằng chứng

AssistantPage SHALL dùng design system chung, loading/actions rõ và result/history/sources. Render/export MUST an toàn có quyền/allowlist; không modal từng token hay output thành action tùy ý. Reset/unmount/logout SHALL cleanup và chặn stale identity response. Acceptance MUST dùng model nội bộ thật cùng negative cases, không fixture giả tích hợp.

#### Scenario: Model trả HTML hoặc link không hợp lệ
- **GIVEN** output có HTML/script hoặc URL ngoài source/route allowlist
- **WHEN** render result hoặc export
- **THEN** UI không tạo executable DOM/action, chỉ hiển thị text/renderer an toàn và citations/drilldown hợp lệ có quyền.

#### Scenario: Nghiệm thu lifecycle và negative cases
- **GIVEN** backend/model test nội bộ thật với dữ liệu tổng hợp cô lập
- **WHEN** chạy acceptance và kiểm tra FE-NEG-03/04/05 cùng DoD stream/privacy/A11Y liên quan
- **THEN** có evidence chặn secrets, prompt injection, hallucination/citation giả, IDOR, revoke/expiry, cancel race và cleanup; chỉ đánh dấu đạt cho kết quả đã chạy.

#### Scenario: Layout report và cleanup UI
- **GIVEN** AssistantPage có WorkspaceLayout, period filters, prompt composer, progress timeline, result/source references và history
- **WHEN** user theo dõi, dừng theo dõi, yêu cầu hủy, retry rồi reset/unmount/logout
- **THEN** loading/disabled và nhãn actions rõ; text/JSON/export dùng renderer/route allowlist có quyền, readers/controllers/timers/buffers được cleanup và stale response không ghi lại identity trước.
