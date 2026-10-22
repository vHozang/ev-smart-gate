## ADDED Requirements

### Requirement: JWT-01 - Access JWT và principal do backend xác thực

Backend SHALL phát hành access JWT ngắn hạn sau khi xác thực thành công, công bố lifetime/claims/error semantics trong contract và xác minh chữ ký, algorithm allowlist, issuer, audience, expiry, session và phiên bản quyền trước khi cho phép truy cập. Signing keys và audience của operator auth MUST tách khỏi JWS phiếu xuất kho. Principal hiệu lực MUST được backend quyết định, không lấy quyền từ JWT do browser tự decode hoặc payload người dùng gửi.

#### Scenario: Access token hợp lệ
- **GIVEN** tài khoản và phiên còn hoạt động, token được ký bởi key operator auth được phép
- **WHEN** client gọi API với Bearer token đúng audience và chưa hết hạn
- **THEN** backend tạo principal có user ID, role reference, permissions hiệu lực, authz_version và trạng thái bắt buộc đổi mật khẩu, rồi kiểm policy của operation

#### Scenario: Token sai hoặc dùng nhầm chữ ký phiếu kho
- **GIVEN** token hết hạn, sai audience/issuer/algorithm hoặc là JWS dùng cho phiếu xuất kho
- **WHEN** token được gửi tới API operator
- **THEN** backend từ chối trước nghiệp vụ bằng lỗi auth đã công bố, không lộ secret hoặc chấp nhận token vì chỉ decode được payload

### Requirement: JWT-02 - Refresh cookie và bảo vệ request dùng cookie

Backend SHALL cấp refresh credential qua cookie HttpOnly, Secure trong production, SameSite/path theo contract, không qua JSON cho JavaScript hoặc URL. Refresh state MUST lưu hash/token family, idle/absolute expiry và revoke status. Lifetime/cookie policy MUST được công bố; các operation auth dựa trên cookie SHALL kiểm CSRF/Origin theo deployment contract.

#### Scenario: Browser reload với refresh hợp lệ
- **GIVEN** browser không còn access token RAM nhưng còn refresh cookie hợp lệ
- **WHEN** auth bootstrap gọi refresh đúng Origin và CSRF policy
- **THEN** server phát hành access token mới, client hoàn tất principal bootstrap trước khi mở truy vấn dữ liệu bảo vệ

#### Scenario: Cross-site refresh hoặc refresh hết hạn
- **GIVEN** request vi phạm Origin/CSRF policy hoặc credential đã quá idle/absolute expiry
- **WHEN** request tới refresh endpoint
- **THEN** server SHALL từ chối, không tạo phiên mới và trả lỗi có thể phân biệt với thiếu permission nghiệp vụ

#### Scenario: Triển khai origin và cookie production
- **GIVEN** môi trường production cần refresh cookie có credentials
- **WHEN** cấu hình reverse proxy, frontend origin và CORS
- **THEN** deployment SHALL ưu tiên cùng origin, chỉ cho origins theo allowlist và MUST không mở CORS credentials tùy ý; refresh token không xuất hiện trong JSON hoặc URL

### Requirement: JWT-03 - Rotation và refresh concurrency

Backend SHALL rotate refresh atomically, phát hiện reuse và revoke token family theo policy. Client SHALL single-flight trong tab và phối hợp giữa tab không broadcast raw tokens. Contract MUST xác định concurrency, token vừa rotate, response mất và retry; race hợp lệ không tạo nhiều phiên hoặc vô tình logout, reuse không được chấp nhận vô hạn.

#### Scenario: Hai tab cùng refresh
- **GIVEN** hai tab dùng chung refresh cookie và access token đều hết hạn
- **WHEN** cả hai cần refresh gần đồng thời
- **THEN** coordination/rotation policy SHALL chỉ tạo trạng thái family hợp lệ đã quy định, không ghi đè credential mới bằng credential cũ, broadcast raw access/refresh token hoặc tạo refresh loop

#### Scenario: Refresh credential cũ bị replay
- **GIVEN** refresh credential đã rotate ngoài trường hợp concurrency hợp lệ đã contract hóa
- **WHEN** credential cũ được sử dụng lại
- **THEN** backend phát hiện reuse, revoke family liên quan và từ chối credentials bị ảnh hưởng trên mọi worker

### Requirement: JWT-04 - Thu hồi phiên và quyền xuyên worker

Logout, revoke sessions, khóa user, reset mật khẩu và thay role/permissions SHALL cập nhật trạng thái bền vững hoặc policy version theo revocation policy. Backend MUST không tiếp tục tin claims quyền cũ chỉ vì JWT chưa hết TTL; mọi API, evidence/download, WS, report worker/stream và cache bảo vệ SHALL kiểm lại quyền tương ứng. Invalidation/revoke MUST phủ mọi worker; khi không xác minh được quyền, hệ thống SHALL fail-closed.

#### Scenario: Khóa user trên worker khác
- **GIVEN** user có JWT chưa hết hạn và WS/report đang hoạt động trên worker B
- **WHEN** worker A hoàn tất khóa user hoặc revoke mọi phiên
- **THEN** request tiếp theo bị từ chối, kết nối không phát thêm dữ liệu bảo vệ sau khi nhận revoke và report/artifact không tiếp tục truy cập bằng quyền cũ

#### Scenario: Đổi permission của role đang được nhiều user sử dụng
- **GIVEN** nhiều user đang dùng cùng role và các cache khác nhau
- **WHEN** tập permissions của role được cập nhật thành công
- **THEN** version/invalidation ảnh hưởng toàn bộ user của role và mọi đường truy cập dữ liệu liên quan, không chỉ actor hoặc process thực hiện thay đổi

### Requirement: JWT-05 - Principal bị giới hạn khi buộc đổi mật khẩu

User có must_change_password SHALL chỉ nhận principal hạn chế cho me, change-password, logout và refresh duy trì cùng phạm vi hạn chế. Business API, analytics, report jobs và WS MUST bị backend chặn trước khi mật khẩu được đổi thành công. Change-password SHALL xác thực mật khẩu hiện tại, áp policy server, xử lý thu hồi credentials tạm và cấp phiên phù hợp theo contract; frontend ẩn menu không được coi là hàng rào bảo vệ.

#### Scenario: Dùng mật khẩu tạm gọi thẳng API nghiệp vụ
- **GIVEN** user vừa đăng nhập bằng mật khẩu reset và must_change_password=true
- **WHEN** user gọi trực tiếp gate verification, ảnh, Dashboard, report hoặc WS
- **THEN** backend từ chối dù JWT còn hạn và role bình thường có permission tương ứng

#### Scenario: Đổi mật khẩu thành công
- **GIVEN** user có principal hạn chế và mật khẩu hiện tại hợp lệ
- **WHEN** change-password hoàn tất theo policy
- **THEN** backend xóa trạng thái bắt buộc đổi, revoke credentials tạm theo contract và chỉ cung cấp principal nghiệp vụ sau khi phiên mới được xác thực

### Requirement: JWT-06 - WS ticket và quyền trong suốt kết nối

Backend SHALL cung cấp WS ticket ngắn hạn, dùng một lần, cấp bằng Bearer auth, bind với principal/session, channel và quyền cần thiết. Ticket consumption MUST atomic, có expiry và redact khỏi logs. WS SHALL kiểm permission khi mở và revalidate/revoke trong suốt kết nối; access/refresh token dài hạn MUST không nằm trong URL. Auth error, expiry và reconnect semantics SHALL có contract cho client.

#### Scenario: Dùng lại ticket hoặc dùng sai channel
- **GIVEN** ticket đã được consume, hết hạn hoặc được cấp cho channel khác
- **WHEN** client mở WS với ticket đó
- **THEN** backend từ chối handshake hoặc đóng bằng mã auth đã contract hóa, không phát dữ liệu bảo vệ

#### Scenario: Mất quyền khi socket đang mở
- **GIVEN** socket alerts đang mở với quyền alerts:read
- **WHEN** quyền bị thu hồi hoặc session bị revoke
- **THEN** server ngừng phát dữ liệu bảo vệ và đóng socket; reconnect phải lấy ticket mới sau khi principal còn hợp lệ

### Requirement: JWT-07 - Vòng đời browser và replay có kiểm soát

Frontend SHALL giữ access token trong RAM, không persist credentials; auth bootstrap/interceptor/logout MUST có stale-response guards và bounded replay. Mutation SHALL chỉ replay khi contract bảo đảm auth từ chối trước side effect và có idempotency phù hợp. Logout SHALL cancel requests, clear dữ liệu nhạy cảm, đóng socket/modal và vô hiệu response đến muộn.

#### Scenario: Logout trong lúc refresh đang chờ
- **GIVEN** request refresh hoặc request dữ liệu còn pending
- **WHEN** user logout rồi response cũ trả về
- **THEN** client SHALL cancel requests, clear dữ liệu nhạy cảm, đóng socket/modal và loại bỏ response cũ; MUST không phục hồi token, principal hoặc query cache của phiên đã đóng

#### Scenario: 403 hoặc mutation có outcome chưa biết
- **GIVEN** server trả 403, hoặc request side effect timeout sau khi có thể đã thực thi
- **WHEN** transport xử lý lỗi
- **THEN** client MUST không refresh khi 403 hoặc blanket replay; thiếu quyền được hiển thị đúng, còn timeout mở cổng/finalize/reissue SHALL được reconcile theo event/operation contract

#### Scenario: Refresh đủ điều kiện sau lỗi token hết hạn
- **GIVEN** business request bị từ chối trước side effect và error contract cho phép refresh
- **WHEN** interceptor xử lý request đó
- **THEN** client SHALL thực hiện tối đa một replay sau refresh hợp lệ, loại login/refresh/logout khỏi loop; access token SHALL chỉ ở RAM auth service, không trong localStorage, sessionStorage hoặc Redux persistence

### Requirement: JWT-08 - Migration auth có compatibility và rollback

Migration SHALL version hóa login/me/refresh/logout/WS contract, chỉ rõ lộ trình chuyển session cookie cũ sang JWT và thời điểm dừng compatibility. Client cũ MUST không bị thay schema âm thầm; compatibility path SHALL áp dụng quyền và revocation hiện hành, không thành đường bypass. Rollback SHALL có kế hoạch xử lý cookies, sessions, signing keys và client deployment mà không tự khôi phục credential đã revoke hoặc tài khoản đã khóa.

#### Scenario: Client cũ trong cửa sổ chuyển đổi
- **GIVEN** compatibility vẫn được bật theo kế hoạch đã công bố
- **WHEN** client session cũ và React JWT cùng hoạt động
- **THEN** mỗi client nhận schema đúng phiên bản và chịu cùng policy tài khoản/quyền; không biến role object mới thành enum cũ bằng suy đoán

#### Scenario: Rollback giao diện sau revoke
- **GIVEN** credentials đã revoke trong giai đoạn JWT
- **WHEN** vận hành rollback sang giao diện tương thích
- **THEN** credentials bị revoke vẫn bị từ chối và hệ thống không tự seed/khôi phục quyền hay phiên cũ để đăng nhập lại
