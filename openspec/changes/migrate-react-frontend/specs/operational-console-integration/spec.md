## ADDED Requirements

### Requirement: INT-01 - Màn hình nghiệp vụ dùng API thật

Console SHALL tích hợp API backend thật cho nghiệp vụ core và quản trị theo contract đã chốt, đúng OpenAPI/runtime backend. UI vận hành MUST không có runtime mock mode; fixtures/payload lỗi chỉ ở tests cô lập. UI kho và temporal action recognition SHALL để change sau, không là điều kiện phát hành core.

#### Scenario: Endpoint hoặc lookup chưa sẵn sàng
- **GIVEN** một chức năng cần API chưa được backend cung cấp hoặc user thiếu quyền lookup
- **WHEN** user mở chức năng đó
- **THEN** UI hiển thị lỗi/unavailable/forbidden đúng nguyên nhân, không điền dữ liệu giả, gọi path tự nghĩ hoặc dùng placeholder thành công.

#### Scenario: Tích hợp end-to-end
- **GIVEN** môi trường FastAPI/database/storage test thật và dữ liệu tổng hợp cô lập
- **WHEN** chạy integration/E2E cho màn hình core
- **THEN** request và kết quả được đối chiếu backend thật, không dùng sinh trắc học thật hay seed production và không phụ thuộc order kho cho Gate Out.

#### Scenario: Đối chiếu phạm vi API console
- **GIVEN** contract nhân viên/người điều khiển, xe, driver-vehicle authorizations, thẻ, gate/pedestrian verification, logs, alerts, users/roles/permissions/audit và health đã chốt
- **WHEN** tích hợp từng màn hình
- **THEN** method/path/query/body/multipart/bytes/enums/permissions khớp OpenAPI và backend đang chạy, không tạo API hoặc dữ liệu tùy ý.

### Requirement: INT-02 - Bootstrap authentication và authorization UX

Console SHALL bootstrap auth/me, giữ access token trong RAM và dùng refresh lifecycle chung. Navigation/actions SHALL dùng effective permissions backend qua hook authorization. Forced-password principal MUST chỉ vào luồng hợp lệ; bootstrap/401/403/revoke MUST không nháy page sai, loop refresh hoặc biến forbidden thành empty.

#### Scenario: Hết hạn token và nhiều request đồng thời
- **GIVEN** nhiều request gặp access token hết hạn
- **WHEN** transport xử lý refresh theo contract
- **THEN** lifecycle được điều phối để tránh refresh loop/race trái policy, mutation nhạy cảm không retry mù và refresh thất bại kết thúc phiên an toàn.

#### Scenario: Người dùng mở link quản trị trực tiếp
- **GIVEN** user không có permission hoặc bắt buộc đổi mật khẩu
- **WHEN** mở trực tiếp route/action quản trị
- **THEN** UI chặn theo principal hiện tại, hiển thị hướng xử lý phù hợp và không dựa vào việc sidebar đã ẩn để coi là đủ authorization.

#### Scenario: Principal và guard khi bootstrap
- **GIVEN** auth/me đang tải hoặc trả principal must_change_password
- **WHEN** resolve navigation/actions và protected route
- **THEN** console chờ bootstrap rõ ràng, chỉ mở đổi mật khẩu/logout hợp lệ cho restricted principal và không suy quyền chỉ từ JWT decode hoặc role strings cố định.

### Requirement: INT-03 - CRUD và danh tính đúng nghiệp vụ

Console SHALL tách Employee/Driver khỏi User và physical grants khỏi driver-vehicle authorization/RBAC. Forms SHALL tuân DTO/schema, lookups có quyền và lỗi/conflict backend. Thao tác nhạy cảm MUST xác nhận đối tượng/hậu quả, chỉ reconcile/invalidate/đóng sau kết quả server. UID thẻ SHALL mask; read response MUST không yêu cầu password hash/token.

#### Scenario: Tạo hồ sơ hoặc thay thẻ bị từ chối
- **GIVEN** user nhập form theo contract và replacement reason bắt buộc
- **WHEN** backend trả duplicate, invalid state, permission denial hoặc version conflict
- **THEN** UI giữ dữ liệu nhập, nêu lỗi chính xác, không tự tạo User/physical grant hoặc báo đã thay thẻ khi backend chưa xác nhận.

#### Scenario: Chỉnh sửa quyền đang được bảo vệ
- **GIVEN** màn hình roles/users hiển thị effective permissions và protected ADMIN constraints
- **WHEN** backend từ chối cấp quyền, sửa ADMIN hoặc deactivate role đang gán
- **THEN** UI giữ trạng thái server, giải thích lỗi an toàn và tải lại principal/quyền khi cần, không áp quyền chỉ bằng cập nhật client.

#### Scenario: Xác nhận thao tác nhạy cảm
- **GIVEN** user khóa/báo mất/thay thẻ, thu hồi, gán role/reset mật khẩu hoặc đổi trạng thái nhạy cảm
- **WHEN** submit qua form/confirmation chung
- **THEN** UI nêu đối tượng/hậu quả, áp version/concurrency contract và chỉ reconcile/invalidate/đóng form khi backend xác nhận, không làm mất lỗi field hoặc conflict.

### Requirement: INT-04 - Luồng gate và pedestrian phản ánh kết quả thật

Console SHALL hỗ trợ đi bộ/motorcycle/car/truck với face bắt buộc; đi bộ MUST không gửi plate/vehicle giả, xe MUST giữ thẻ/mặt/biển số. UI SHALL tách observation/decision/permit/command/ACK và chỉ báo mở khi đủ kết quả backend. Timeout MUST giữ event_id, outcome_unknown và reconcile trước retry; abort MUST không giả đã hủy thiết bị.

#### Scenario: Verification thành công nhưng barrier chưa ACK
- **GIVEN** backend trả verification PASSED nhưng barrier PENDING/FAILED hoặc chưa biết
- **WHEN** UI render kết quả
- **THEN** UI không hiển thị đã mở cổng hoặc người/xe đã đi qua, không tự gọi device và giữ trạng thái chờ/lỗi đúng contract.

#### Scenario: Timeout hoặc retry cùng encounter
- **GIVEN** request xác minh bị mất response sau khi gửi
- **WHEN** user kiểm tra lại hoặc retry theo contract
- **THEN** console giữ event_id, tra cứu kết quả trước khi retry, không tạo lượt mới giả hoặc nút hủy mở cổng khi lệnh đã gửi.

#### Scenario: Nhiều loại phương tiện và người đi bộ
- **GIVEN** luồng đang xử lý thuộc một trong bốn nhóm đã xác nhận
- **WHEN** thiếu/mờ/che mặt hoặc backend báo evidence không cùng encounter
- **THEN** UI hiển thị không đủ bằng chứng/verification thất bại và quy trình chụp lại, không bỏ bước mặt theo loại xe hoặc tự nhận diện 1:N toàn bộ người xuất hiện.

#### Scenario: Đủ điều kiện hiển thị barrier đã mở
- **GIVEN** API thật đã trả kết quả operation
- **WHEN** UI quyết định nhãn barrier đã mở
- **THEN** nhãn chỉ xuất hiện đồng thời khi verification_status=PASSED, permit_granted=true và barrier_status=OPENED; các trạng thái khác giữ semantics riêng, không coi ACK là bằng chứng đã qua cổng.

### Requirement: INT-05 - Nhật ký evidence downloads và health đúng quyền

Console SHALL dùng nguồn gate/person logs riêng với filters/pagination backend thật. Evidence/downloads MUST qua API có quyền, không public storage hoặc URL bí mật tự dựng. Health SHALL chỉ biểu diễn dữ liệu backend cung cấp. Renderer MUST giữ score/status và phân biệt verification/ACK với actual crossing/chấm công.

#### Scenario: Xem evidence không có quyền
- **GIVEN** user biết log ID hoặc từng có ảnh trong cache
- **WHEN** quyền bị thu hồi hoặc API evidence trả 403
- **THEN** UI chặn nội dung, giải phóng Blob liên quan và không giữ đường truy cập storage trực tiếp.

#### Scenario: Health chỉ có database readiness
- **GIVEN** backend chưa trả camera/model/device health
- **WHEN** mở SystemPage
- **THEN** UI biểu diễn phạm vi readiness thật và các phần thiếu là unavailable, không tô xanh mọi thiết bị.

#### Scenario: Hiển thị logs và evidence đúng nguồn
- **GIVEN** backend có vehicle logs, person access logs và các score/status khác nghĩa
- **WHEN** lọc hoặc mở chi tiết
- **THEN** person logs không bị dựng từ vehicle logs, filters/pagination đúng contract, score không đổi thành xác suất chung và verification/ACK không biến thành crossing hoặc chấm công.

### Requirement: INT-06 - Cảnh báo realtime và resync không mất sự kiện

Console SHALL giữ WS cảnh báo và REST sequence resync, xác thực theo identity/quyền với ticket ngắn hạn. Connection SHALL có backoff+jitter, bounded buffer và cleanup. Snapshot/subscription race, duplicates, out-of-order và gaps MUST được xử lý tới khi theo kịp; event sai MUST không crash shell, revoke/logout MUST dừng dữ liệu bảo vệ.

#### Scenario: Mất mạng và backlog lớn
- **GIVEN** alert stream bị gián đoạn và backlog vượt một REST batch
- **WHEN** reconnect
- **THEN** UI hiển thị reconnecting/lần đồng bộ cuối, nạp đủ batches theo cursor/sequence, dedupe và không coi một batch giới hạn là toàn bộ dữ liệu.

#### Scenario: Event trùng sai thứ tự hoặc không hợp lệ
- **GIVEN** socket nhận duplicate, out-of-order, gap hoặc payload sai schema
- **WHEN** xử lý events
- **THEN** cache không nhân bản/hạ state mới thành cũ, gap kích hoạt resync phù hợp và payload lỗi được cô lập thay vì làm hỏng AppShell.

#### Scenario: Race giữa snapshot và subscription
- **GIVEN** alert mới có thể tới khi tải snapshot
- **WHEN** mở hoặc xác thực lại kết nối
- **THEN** client subscribe/buffer rồi merge ID/sequence hoặc dùng cursor handshake theo contract, không mất event giữa hai bước và không đặt access/refresh token dài hạn trong URL; expiry/revoke dừng dữ liệu bảo vệ.

### Requirement: INT-07 - Loading lỗi và kết quả chưa xác định

Mỗi page/panel/form SHALL có ready/loading/empty/error/forbidden states, skeleton đúng bố cục và refetch giữ dữ liệu. Submit SHALL pending cục bộ, chống lặp và giữ input khi lỗi. Progress MUST phản ánh request/event thật, không biến upload thành AI %. Render SHALL có Error Boundary; async failures MUST xử lý riêng và fallback không lộ nội bộ.

#### Scenario: Một panel lỗi giữa trang đang có dữ liệu
- **GIVEN** page có nhiều panel và một response sai schema hoặc request lỗi
- **WHEN** cập nhật trang
- **THEN** chỉ vùng liên quan có fallback/request ID an toàn và retry, các vùng khác cùng shell vẫn dùng được; forbidden không bị đổi thành empty.

#### Scenario: Tác vụ lâu chưa có progress contract
- **GIVEN** API chỉ cung cấp request-response
- **WHEN** chờ kết quả hoặc upload ảnh
- **THEN** UI chỉ hiển thị trạng thái đang gửi/chờ thật, không timer các bước inference giả và không công bố success trước terminal response hợp lệ.

#### Scenario: Phân loại lỗi render và async
- **GIVEN** page có lỗi render hoặc async/mutation/event handler thất bại
- **WHEN** xử lý lỗi
- **THEN** Error Boundary cô lập render, handler xử lý async riêng, fallback không lộ raw exception/provider/rule; initial load giữ shell và refetch giữ dữ liệu cùng nhãn updating/stale khi cần.

### Requirement: INT-08 - Cleanup chống stale response và tài nguyên rò rỉ

Console SHALL cleanup requests/controllers/readers/socket/timers/buffers/media tracks/Blob URLs khi unmount/reset/logout hoặc đổi operation. Response/event của operation hoặc identity cũ MUST không ghi lại dữ liệu đã reset. Hủy request browser SHALL được phân biệt với server cancellation; mutation kết quả chưa rõ MUST còn đường reconcile. Camera hook MUST không tự lưu ảnh hoặc gửi cloud ngoài hành động/policy đã cho phép.

#### Scenario: Unmount hoặc logout khi stream/camera đang hoạt động
- **GIVEN** page đang có media tracks, WS, pending request và evidence Blob
- **WHEN** rời page hoặc logout
- **THEN** tài nguyên thuộc lifecycle được giải phóng, dữ liệu bảo vệ bị xóa theo policy và late response không phục hồi view/cache của identity trước.

#### Scenario: Reset verification trước khi response cũ về
- **GIVEN** một operation đã được reset và operation mới có ID khác
- **WHEN** response cũ đến
- **THEN** stale guard bỏ response khỏi operation mới, không thay kết quả đang hiển thị hoặc tạo toast success sai đối tượng.

### Requirement: INT-09 - Safe rendering privacy và bằng chứng nghiệm thu

Console MUST coi text/notes/AI output là untrusted, mặc định render escaped và không eval hay tạo JSX/action tùy ý. HTML/artifacts SHALL qua renderer/sanitizer/viewer an toàn có quyền. Dữ liệu nhạy cảm MUST không persist browser hoặc vào logs/traces. Acceptance SHALL có evidence API thật, negative cases, responsive/A11Y và camera bốn nhóm.

#### Scenario: Script và img onerror trong dữ liệu
- **GIVEN** API trả alert/ghi chú chứa script, HTML hoặc img onerror
- **WHEN** UI hiển thị dữ liệu và mở artifact liên quan
- **THEN** không thực thi mã hoặc chèn executable DOM, slip HTML không được chèn thẳng vào DOM ứng dụng và lỗi được cô lập an toàn.

#### Scenario: Kiểm tra storage và acceptance
- **GIVEN** console đã đi qua login, verification, evidence và logout
- **WHEN** kiểm tra browser storage/telemetry và evidence E2E
- **THEN** không có token/evidence nhạy cảm bị persist, có kiểm chứng FE-NEG-01/02/06/07/08 cùng DOD-FE-AI phù hợp và chỉ ghi đạt cho ca thực sự đã chạy.

#### Scenario: Privacy và coverage nghiệm thu
- **GIVEN** luồng có token, raw evidence, biometrics, prompt/output hoặc Query cache nhạy cảm cùng artifacts ảnh/PDF/QR
- **WHEN** kiểm tra browser storage/logs/test traces và camera acceptance
- **THEN** dữ liệu nhạy cảm không bị persist/ghi lộ, artifacts giữ quyền/content type; kiểm tra đi bộ/xe máy/ô tô/xe tải thực tế, không suy coverage từ một nhóm hoặc simulator.
