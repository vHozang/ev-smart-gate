## ADDED Requirements

### Requirement: ANA-01 - Aggregation thật và catalog định nghĩa metric

Backend SHALL cung cấp Dashboard aggregation và metric definitions theo contract đã chốt, tính trên toàn bộ tập dữ liệu được phép thay vì REST list bị giới hạn hoặc items browser đang giữ. Metric catalog SHALL có ID/version, đơn vị, nguồn, công thức/mẫu số và điều kiện khả dụng; default Dashboard SHALL ưu tiên nhân viên đi bộ và vehicle access core. Tổng/tỷ lệ/so sánh MUST do code backend tính, không giao cho LLM hoặc client suy từ tập con.

#### Scenario: Tổng dữ liệu vượt giới hạn list
- **GIVEN** số gate logs vượt limit API danh sách hiện tại
- **WHEN** truy vấn Dashboard cùng kỳ và phạm vi quyền
- **THEN** aggregate bao phủ toàn bộ tập được phép, có definition/source và không báo số items tải về thành tổng hệ thống.

#### Scenario: Metric chưa có nguồn hợp lệ
- **GIVEN** một metric đòi hỏi dữ liệu schema/journal chưa có
- **WHEN** backend dựng response
- **THEN** metric được đánh dấu unavailable với lý do, không phát số demo hoặc nội suy không có bằng chứng.

### Requirement: ANA-02 - Kỳ timezone và filters có semantics rõ

Analytics SHALL dùng `[from,to)`, timezone mặc định Asia/Bangkok và UTC query boundary. Filters/granularity/range MUST theo allowlist và chỉ bật khi nguồn/backfill/list contract hỗ trợ. So sánh kỳ trước SHALL cùng độ dài/phạm vi, mẫu số 0 trả percent_change=null; kỳ chưa hoàn tất MUST có nhãn, không nhận arbitrary Mongo query.

#### Scenario: Sự kiện nằm đúng biên kỳ
- **GIVEN** có sự kiện đúng from và đúng to theo timezone được chọn
- **WHEN** tính metric theo kỳ
- **THEN** sự kiện tại from được tính, sự kiện tại to thuộc kỳ sau và kết quả không lệch ngày do UTC conversion.

#### Scenario: Filter chưa được nguồn hỗ trợ
- **GIVEN** lịch sử chưa đủ gate_id/site_id hoặc list chưa hỗ trợ date/cursor cần thiết
- **WHEN** user chọn filter/drilldown tương ứng
- **THEN** UI disable hoặc trả unsupported rõ, không join riêng GateCommand làm mất denied events trước barrier hay giả nguồn mỗi cổng.

#### Scenario: Kỳ trước không có baseline
- **GIVEN** kỳ trước cùng độ dài/phạm vi có mẫu số 0 hoặc kỳ hiện tại chưa hoàn tất
- **WHEN** dựng so sánh và nhãn Dashboard
- **THEN** percent_change=null thay vì infinity, kỳ chưa hoàn tất có nhãn và chỉ các filters được backend hỗ trợ thật mới được bật.

### Requirement: ANA-03 - KPI không vượt quá bằng chứng nghiệp vụ

Analytics MUST phân biệt verification, permit/ACK và crossing; không gọi PASSED ratio là AI accuracy hoặc ENTRY trừ EXIT là occupancy thiếu bằng chứng. Event flow SHALL tách current/historical snapshot. Nhân viên/nhóm xe SHALL theo nguồn đúng; Driver/track ID MUST không bị giả thành nhân viên/danh tính và các counts chồng MUST không cộng thành tổng người.

#### Scenario: Đếm lượt và nhóm kết quả
- **GIVEN** nhiều log có cùng event_id, nhiều reason_codes và barrier OPENED
- **WHEN** tính metrics
- **THEN** attempts dedupe event_id, reason_codes dedupe từng code trong log có thể chồng nhóm, OPENED được ghi là ACK và tỷ lệ PASSED không được mô tả thành độ chính xác AI.

#### Scenario: Phân loại xe và nhân viên
- **GIVEN** dữ liệu có motorcycle/car/truck/legacy/unknown và người điều khiển bên ngoài
- **WHEN** dựng breakdown hoặc distinct employee metric
- **THEN** mapping loại xe tường minh, phần không xác định giữ unknown/coverage và chỉ identity thuộc employee registry đủ điều kiện được tính nhân viên, không suy số người thực sự hiện diện.

#### Scenario: Latency và lịch sử không đủ dữ liệu
- **GIVEN** chỉ có occurred_at sau inference và completed_at ACK, hoặc status/slip_version hiện tại
- **WHEN** yêu cầu latency AI, state cuối kỳ quá khứ hoặc số lần issue/reissue
- **THEN** metric unavailable tới khi có telemetry/journal đúng; không dùng timestamp delta sai nghĩa hoặc cộng slip_version thành số lần phát hành.

#### Scenario: Nguồn không chứng minh lịch sử hoặc hiện diện
- **GIVEN** chỉ có current status, verification/permit/ACK và thiếu sessions/baseline/crossing sensors hoặc history
- **WHEN** yêu cầu occupancy, số nhân viên hiện diện hoặc snapshot cuối kỳ quá khứ
- **THEN** kết quả unavailable thay vì suy từ ENTRY trừ EXIT hay trạng thái hiện tại; face/card/authorization results giữ semantics nguồn, track ID không được coi là danh tính.

### Requirement: ANA-04 - Coverage null và thống kê mẫu trung thực

Metric SHALL có value number/null, unit, status, unavailable_reason và source_ref; thống kê mẫu SHALL có sample_size/excluded_count và quy tắc loại trừ. Response MUST phân biệt zero/no sample/missing/partial/forbidden; mẫu số 0 trả null. Backfill chưa biết SHALL giữ unknown/coverage; alert duration MUST giữ nghĩa trạng thái và lịch sử nguồn.

#### Scenario: Kỳ không có mẫu hợp lệ
- **GIVEN** tổng attempts bằng 0 hoặc timestamps không hợp lệ cho duration
- **WHEN** tính ratio/duration
- **THEN** backend trả null/status phù hợp kèm sample/excluded counts thay vì 0 giả, NaN hoặc infinity và UI phân biệt rõ.

#### Scenario: Người dùng chỉ thấy một phần metric
- **GIVEN** user thiếu quyền một domain hoặc nguồn chưa đầy đủ
- **WHEN** Dashboard trả các phần được phép
- **THEN** không trả giá trị domain bị cấm, không biến forbidden thành 0 và coverage/warnings chỉ giải thích trong phạm vi không rò dữ liệu.

#### Scenario: Duration alert và backfill chưa xác định
- **GIVEN** alerts có RESOLVED/FALSE_POSITIVE nhưng thiếu ACK/reopen history, hoặc records chưa xác định gate/vehicle type
- **WHEN** tính duration và coverage
- **THEN** tách duration theo hai terminal statuses, không gọi MTTA/MTTR chuẩn và không tự gán cổng/loại xe cho backfill unknown.

### Requirement: ANA-05 - Snapshot provenance và source watermarks

Dashboard response SHALL có metadata thời gian/phạm vi/definition, snapshot, coverage và warnings. Report snapshot MUST là aggregate bất biến dùng suốt job với citations đúng nguồn. Nếu thiếu snapshot nhất quán nhiều nguồn, backend SHALL ghi watermark/data_as_of từng nguồn, đánh dấu partial và không tính kết luận/tỷ lệ đòi hỏi đồng thời điểm.

#### Scenario: Dữ liệu thay đổi sau khi tạo report
- **GIVEN** report dùng snapshot đã đóng băng
- **WHEN** Dashboard refresh và nguồn có dữ liệu mới
- **THEN** report/citations giữ số liệu snapshot ban đầu, không âm thầm tham chiếu live queries mới dưới cùng snapshot_id.

#### Scenario: Các nguồn có thời điểm khác nhau
- **GIVEN** gate và alert aggregates không có consistent snapshot chung
- **WHEN** response tổng hợp nhiều nguồn
- **THEN** có source watermarks và partial warnings, không trình bày chúng như số liệu cùng thời điểm hoặc tính ratio không hợp lệ.

#### Scenario: Metadata snapshot được trả cho client
- **GIVEN** backend đã tính aggregates
- **WHEN** trả Dashboard response
- **THEN** response có snapshot_id, generated_at, data_as_of, period, timezone, metric_definition_version, policy scope, coverage và warnings đủ để diễn giải nguồn và thời điểm.

### Requirement: ANA-06 - Authorization và cache isolation

Aggregation SHALL yêu cầu đủ quyền đọc nguồn và aggregate domain; backend MUST deny-by-default, không trả totals chứa phần bị ẩn. Cache server/browser SHALL scoped theo kỳ, filters chuẩn hóa, user/policy và authz_version; revoke MUST ngăn cache/snapshot trái quyền. Warehouse metrics SHALL chỉ bật khi module và quyền nguồn đã có.

#### Scenario: Có quyền vào Dashboard nhưng thiếu quyền nguồn
- **GIVEN** user có một permission analytics nhưng thiếu quyền đọc logs tương ứng
- **WHEN** gọi aggregation trực tiếp hoặc thay filters
- **THEN** backend từ chối metric đó, không trả tổng gián tiếp hay cho phép hỏi vòng từ Assistant.

#### Scenario: Hai user cùng filters nhưng khác quyền
- **GIVEN** cache đã có kết quả của user quyền rộng
- **WHEN** user quyền hẹp truy vấn cùng kỳ hoặc quyền bị thu hồi
- **THEN** không dùng kết quả cache rộng và dữ liệu không còn được phép không tiếp tục xuất hiện.

#### Scenario: Quyền thống kê người đi bộ
- **GIVEN** user yêu cầu pedestrian analytics
- **WHEN** backend resolve domain permissions
- **THEN** phải có cả person-access-logs:read và analytics:read-people; thiếu một quyền thì query bị từ chối và không có cached snapshot thay thế để bypass.

### Requirement: ANA-07 - Dashboard UI thống nhất và dễ tiếp cận

Dashboard SHALL dùng shared layout/chart/metric/table cùng CSS tokens với dữ liệu thật. Charts MUST có definition/unit/source và bảng text tương đương keyboard/screen reader. UI SHALL có skeleton, lỗi/partial/unavailable cục bộ, nhãn cập nhật cuối và giữ dữ liệu khi refetch; realtime MUST invalidate/refetch có giới hạn.

#### Scenario: Refresh một panel lỗi
- **GIVEN** Dashboard đã có dữ liệu và một query refresh thất bại
- **WHEN** UI cập nhật
- **THEN** dữ liệu hiện có giữ nhãn stale/updating phù hợp, panel lỗi có retry và các panel khác/shell vẫn dùng được, không thay bằng metric demo.

#### Scenario: Mobile keyboard và chart accessibility
- **GIVEN** Dashboard có chart và bảng dài
- **WHEN** dùng ở 320 px, zoom 200% hoặc keyboard/screen reader
- **THEN** nội dung xếp/co/scroll trong vùng phù hợp, filter và nguồn tiếp cận được và bảng text cung cấp thông tin tương đương chart.

#### Scenario: Ghép Dashboard và cập nhật realtime
- **GIVEN** Dashboard gồm AppShell, PeriodFilterBar, MetricStrip, TrendPanel, BreakdownPanel và ContextPanel
- **WHEN** render hoặc nhận nhiều events realtime
- **THEN** ChartPanel/MetricCard/DataTable dùng shared tokens, legend không tràn, skeleton đúng hình và mọi card/series có nguồn thật; không mỗi event gọi lại mọi aggregation.

### Requirement: ANA-08 - Drilldown nhất quán và kiểm chứng số liệu

Drilldown SHALL dùng route helper allowlist, cùng kỳ/filter được backend và màn hình đích hỗ trợ cùng quyền đọc nguồn; link MUST không tự mở arbitrary URL hoặc dùng query chưa có. Analytics acceptance SHALL đối chiếu aggregates với nguồn thật trong môi trường test cô lập, bao gồm biên kỳ/timezone/dedupe/zero-null/partial/permissions và nguồn chưa đủ history. Evidence MUST ghi giới hạn dữ liệu, không tuyên bố accuracy/coverage vượt ca đã chạy.

#### Scenario: Drilldown được phép
- **GIVEN** metric có list contract hỗ trợ kỳ/filter và user có quyền nguồn
- **WHEN** user chọn xem chi tiết
- **THEN** route helper dựng link nội bộ hợp lệ, dữ liệu đích dùng cùng semantics và không mở rộng phạm vi ngoài metric gốc.

#### Scenario: Đối chiếu aggregate và dữ liệu nguồn
- **GIVEN** test dataset có denied-before-command, duplicate event, zero baseline và thiếu source history
- **WHEN** chạy contract/integration tests
- **THEN** kết quả xác nhận các quy tắc định nghĩa/coverage/quyền, chỉ đánh dấu nghiệm thu cho assertions đã thực sự chạy.
