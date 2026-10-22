## ADDED Requirements

### Requirement: FE-01 - Stack và quyền sở hữu state

Frontend SHALL dùng React, TypeScript strict và Vite trong package `frontend/` riêng với stable versions, peer dependencies và lockfile được xác minh khi triển khai. Redux Toolkit SHALL sở hữu client state serializable; TanStack Query SHALL là server cache duy nhất; Axios SHALL là HTTP transport chung. Token và tài nguyên không serializable MUST không vào Redux hoặc persisted storage nhạy cảm.

#### Scenario: Phân chia dữ liệu ứng dụng
- **GIVEN** console có danh sách nhân viên, principal, sidebar và form đang nhập
- **WHEN** ứng dụng lưu state
- **THEN** server data nằm trong Query cache, sidebar/auth lifecycle nằm trong Redux hoặc local state thích hợp, form giữ input riêng và không tạo cache trùng bằng Zustand hoặc RTK Query.

#### Scenario: Đổi identity khi request cũ còn chạy
- **GIVEN** một request của user trước chưa hoàn tất
- **WHEN** logout hoặc đổi user
- **THEN** request bị hủy theo lifecycle, cache nhạy cảm được xóa và response cũ không được phục hồi principal hay dữ liệu của user trước.

#### Scenario: Tài nguyên runtime không thuộc store
- **GIVEN** app có token, Blob, socket, callback, ReactNode, controller hoặc stream buffer
- **WHEN** tạo runtime state và persist preferences
- **THEN** các tài nguyên này không vào Redux hoặc persisted storage nhạy cảm; chỉ preferences không nhạy cảm được persist theo policy.

### Requirement: FE-02 - Composition và custom hooks theo feature

Frontend SHALL tổ chức theo dependency page -> widget -> feature -> shared; shared MUST không phụ thuộc page, feature hoặc app store. Layout SHALL dùng slots/children/nested outlet; custom hooks SHALL gom trách nhiệm liên quan theo feature và trả interface `data/state/actions` phù hợp. API functions, query definitions, schemas và mappers MUST có thể dùng độc lập; không tạo một hook toàn ứng dụng hoặc UniversalCrud chứa mọi nghiệp vụ.

#### Scenario: Tái sử dụng feature trong page khác
- **GIVEN** hai page cần một feature hoặc component hiển thị
- **WHEN** ghép page mới
- **THEN** page dùng public API và props có type, không deep-import nội bộ feature khác hoặc tạo vòng dependency.

#### Scenario: Hook điều phối màn hình cổng
- **GIVEN** use case xác minh cần query, form và mutation
- **WHEN** page dùng custom hook điều phối
- **THEN** hook chỉ điều phối feature liên quan, không sở hữu theme/sidebar hoặc trực tiếp điều khiển barrier.

### Requirement: FE-03 - Design system CSS và Tailwind thống nhất

Frontend SHALL dùng một bộ semantic tokens; shared CSS sở hữu diện mạo/states component và layout, Tailwind tùy biến bố cục trên cùng tokens/breakpoints. Cascade layers MUST quản lý tập trung, độc lập thứ tự lazy-load. Motion SHALL giữ vị trí dữ liệu ổn định và tôn trọng reduced motion; React Bits MUST qua review dependency/license.

#### Scenario: Chuyển giữa các page tải lười
- **GIVEN** Button, Field, Modal và Toast cùng variant xuất hiện ở nhiều page
- **WHEN** điều hướng và lazy-load CSS của các page theo thứ tự khác nhau
- **THEN** diện mạo và states vẫn dùng cùng tokens, không phát sinh theme riêng hoặc override tùy tiện theo page.

#### Scenario: Người dùng giảm chuyển động
- **GIVEN** trình duyệt bật prefers-reduced-motion
- **WHEN** sidebar, modal, toast hoặc dữ liệu cập nhật
- **THEN** chức năng và trạng thái vẫn đầy đủ, chuyển động không thiết yếu dừng và bảng/focus không tự nhảy vị trí.

#### Scenario: Thêm component vào design system
- **GIVEN** một page cần component hoặc hiệu ứng mới
- **WHEN** tích hợp shared component, Tailwind utility hoặc React Bits leaf component
- **THEN** màu, typography tiếng Việt, spacing, radius, shadow, z-index và motion lấy từ semantic tokens; transition dùng transform/opacity phù hợp và chỉ dùng React Bits có chọn lọc sau review dependency/license.

### Requirement: FE-04 - Route registry và public exports

Frontend SHALL dùng một route registry cho paths, lazy entries và metadata/sidebar. Mỗi component/layout/page folder MUST có `index.ts` với named exports và `export type` phù hợp. Router MUST dynamic-import từng page, không eager-import tất cả pages. Alias/import rules SHALL thống nhất; route helpers MUST encode params, validate search và chỉ redirect nội bộ hợp lệ.

#### Scenario: Mở route có tham số và quyền
- **GIVEN** user mở một link chi tiết có ID và query filters
- **WHEN** registry resolve route
- **THEN** params/search được kiểm tra, layout/title/sidebar đúng registry và quyền truy cập được kiểm tra trước khi hiển thị dữ liệu bảo vệ.

#### Scenario: Kiểm tra bundle và dependency
- **GIVEN** console có nhiều pages và shared components
- **WHEN** chạy kiểm tra imports và production build
- **THEN** page được chia chunk theo lazy entry, không circular/deep imports trái quy tắc hoặc eager import mọi page qua barrel tổng.

#### Scenario: Đăng ký route mới
- **GIVEN** một page được thêm vào console
- **WHEN** khai báo route và chạy TypeScript/Vite/lint/tests
- **THEN** registry giữ route ID, path, lazy page entry, layout, title/breadcrumb và capability; sidebar đọc cùng metadata và alias/import rules nhất quán ở mọi công cụ.

### Requirement: FE-05 - Layout sidebar responsive và accessibility

Console SHALL dùng AppShell ổn định, các layout tái sử dụng và sidebar rail/drawer responsive có accessible states. Mọi page/state MUST qua ma trận viewport, orientation, zoom, nội dung dài và keyboard. Core interactions MUST có label/focus-visible, không chỉ dựa màu/hover; không che lỗi bằng overflow-x hidden toàn trang.

#### Scenario: Điều hướng và thu gọn sidebar
- **GIVEN** user đang trong AppShell với sidebar thu gọn
- **WHEN** chuyển route con hoặc mở/đóng sidebar
- **THEN** shell/preferences không reset, active route đúng, nút toggle có aria-expanded/controls và rail có tooltip/accessible name.

#### Scenario: Drawer và modal trên màn hình hẹp
- **GIVEN** mobile drawer đang mở
- **WHEN** user mở modal hoặc nhấn Escape
- **THEN** chỉ một vùng blocking tương tác, focus được trap/restore đúng, drawer/overlay không cạnh tranh focus và content/actions không tràn viewport.

#### Scenario: Responsive ở trạng thái lỗi hoặc đang submit
- **GIVEN** bất kỳ page nào có nội dung dài, loading/empty/error/forbidden hoặc modal submitting/validation error
- **WHEN** chạy ma trận viewport, zoom và keyboard
- **THEN** header/actions wrap đúng, bảng scroll trong vùng có nhãn, form/modal giữ actions tiếp cận được và ảnh/QR giữ ý nghĩa cùng aspect ratio.

#### Scenario: Ma trận nghiệm thu layout toàn console
- **GIVEN** AppShell, AuthLayout, ListPageLayout, DetailPageLayout và WorkspaceLayout đã có trách nhiệm rõ
- **WHEN** kiểm tra mọi page/state ở 320/360, 768, 1024, 1440 và 1920 CSS px, portrait/landscape, zoom 200%, nội dung dài và keyboard
- **THEN** AppShell không remount khi đổi page con, desktop có expanded/collapsed rail, mobile/tablet có drawer phù hợp, active state/accessible name rõ và core task không phụ thuộc màu hoặc hover.

### Requirement: FE-06 - Modal render props có lifecycle thống nhất

Console SHALL có một FeedbackProvider/ModalHost và ModalShell chung với render props typed cho nội dung/footer nghiệp vụ. Modal MUST chỉ mở do thao tác rõ ràng, chỉ một blocking modal hoạt động. Shell SHALL quản lý focus, presentation và scroll; dirty/pending guards MUST phân biệt đóng modal với hủy mutation.

#### Scenario: CRUD thất bại và retry
- **GIVEN** user mở FormModal qua một thao tác và nhập dữ liệu
- **WHEN** mutation trả validation hoặc lỗi nghiệp vụ
- **THEN** form giữ input, hiển thị lỗi tại field/form, pending được gỡ phù hợp và không đóng modal hoặc phát success toast giả.

#### Scenario: Double-click hoặc yêu cầu đóng khi pending
- **GIVEN** một mutation nhạy cảm đang chạy trong modal
- **WHEN** user double-click mở/submit hoặc dùng Escape/backdrop để đóng
- **THEN** không mở trùng hay submit lặp, close policy được áp dụng và có thông báo rõ nếu chưa thể đóng; callback/render props không được lưu trong Redux.

#### Scenario: Render props và shell dùng chung
- **GIVEN** feature cần notice, confirm hoặc CRUD modal
- **WHEN** cung cấp renderContent/renderFooter cho ModalHost
- **THEN** context có close/requestClose, form ID, pending và actions đúng type; shell quản lý title/description, portal, overlay, focus trap/restore, scroll lock và size, không tự mở do refetch/render.

### Requirement: FE-07 - Toast và thông báo có một chủ sở hữu

Console SHALL có một ToastHost với variants, vị trí, icon, motion, auto-dismiss và queue dùng chung. Feature mutation SHALL sở hữu thông báo kết quả; Axios MUST chỉ chuẩn hóa lỗi, không tự tạo toast trùng. Validation và lỗi panel MUST có thông tin bền tại vùng liên quan; toast MUST không là nơi duy nhất lưu lỗi cần xử lý, không cướp focus và không announce trùng inline feedback.

#### Scenario: Lỗi validation và phản hồi thành công
- **GIVEN** form dùng Axios và feature mutation chung
- **WHEN** backend lần lượt trả 422 và sau đó xác nhận thành công
- **THEN** 422 gắn đúng form/field, success chỉ phát một toast sau xác nhận backend và dùng live region phù hợp.

#### Scenario: Luồng cảnh báo hoặc reconnect dồn dập
- **GIVEN** có nhiều alert trùng hoặc socket retry
- **WHEN** hệ thống nhận các sự kiện này
- **THEN** inbox/badge được cập nhật theo policy, toast được dedupe/giới hạn/gom nhóm và không spam mỗi event hoặc retry.

### Requirement: FE-08 - Interfaces và runtime schemas theo hợp đồng

Frontend SHALL ưu tiên sinh API DTO từ OpenAPI đã đối chiếu backend; runtime schemas SHALL kiểm tra unknown tại HTTP/WS/report stream boundaries trước cache/render. Screen interfaces/form/filter/view models SHALL được suy từ DTO hoặc mapper tường minh; enum/union có thể dùng type alias. Frontend MUST không dùng any/cast để bỏ validation, bù required fields bằng fake data hoặc đổi score/status sang ý nghĩa khác.

#### Scenario: Nullable và dữ liệu sai hợp đồng
- **GIVEN** payload có nullable hợp lệ hoặc thiếu required field/sai enum/numeric không finite
- **WHEN** response đi qua boundary
- **THEN** nullable được hiển thị bằng state đúng, payload sai bị chặn với fallback cục bộ và request ID an toàn, không crash shell hay tạo giá trị thay thế giả.

#### Scenario: Mapper màn hình nhân viên
- **GIVEN** backend đang cung cấp Driver DTO tương thích và EmployeeRegistry DTO mới theo contract
- **WHEN** màn hình nhân viên dựng view model
- **THEN** mapper giữ liên kết identity và semantics rõ, không tự gọi endpoint chưa có hoặc invent phòng ban/chấm công.

### Requirement: FE-09 - Build deployment và rollback console

SPA SHALL phục vụ cùng origin dưới `/console` với base/basename/assets/fallback nhất quán. Node SHALL chỉ cần ở build stage; UI cũ SHALL có compatibility/rollback có thời hạn. API/WS/health/docs MUST không bị SPA fallback; HTML bootstrap/assets SHALL có cache policy đúng và dev proxy MUST dùng API/WS/health thật.

#### Scenario: Refresh deep link production
- **GIVEN** assets được build cho `/console`
- **WHEN** user refresh một route con và backend đồng thời trả lỗi API
- **THEN** route con nhận SPA entry đúng, assets tải được và lỗi API vẫn giữ content type/status API thay vì trả index HTML.

#### Scenario: Kiểm tra phát hành và rollback
- **GIVEN** bản console mới được chuẩn bị phát hành
- **WHEN** chạy typecheck/lint/build và smoke trên môi trường thật
- **THEN** có evidence cho bundle/base paths, auth/API integration và rollback UI tương thích, không tuyên bố đạt từ tài liệu thiết kế đơn thuần.

#### Scenario: Cache và namespace khi triển khai
- **GIVEN** bản build mới thay assets và HTML bootstrap
- **WHEN** triển khai cùng FastAPI/reverse proxy
- **THEN** hashed assets và HTML dùng cache policy phù hợp, browser không giữ bootstrap cũ trái policy, `/api`, `/ws`, `/health`, `/docs` giữ handlers riêng và SPA không bắt buộc Node runtime production.
