# Báo cáo khám phá và thiết kế Frontend React - EV Smart Gate

## Điều chỉnh phạm vi ngày 21/10/2026 — Frontend triển khai trước

Theo yêu cầu mới của người dùng, team backend khác sở hữu toàn bộ triển khai API. Lượt apply hiện tại chỉ thay đổi Frontend và tài liệu phối hợp; không tiếp tục code/test backend. Các thay đổi backend đang có trong working tree được giữ nguyên để team xem xét, không tự xóa hoặc coi đã nghiệm thu.

M2 được triển khai ngay. M1/MG1 là trách nhiệm bàn giao backend, không chặn xây layout, màn hình, hooks và trạng thái loading/empty/error/unavailable. Tích hợp từng API ngay khi contract và endpoint đó sẵn sàng; không chờ cả milestone backend. Endpoint chưa tồn tại ghi vào `docs/contracts/frontend-api-gaps.md`, không gọi thử tùy tiện, không mock runtime, không báo thành công giả. JWT/RBAC vẫn là mục tiêu; adapter session v1 chỉ phục vụ API hiện tại, cấu hình tường minh, không fallback tự động khi JWT lỗi. Mỗi chức năng chỉ được đánh dấu hoàn thành sau khi tích hợp API thật và kiểm tra phù hợp. MG1 đầy đủ vẫn cần backend nghiệm thu trước rollout JWT/RBAC toàn hệ thống.


| Thuộc tính | Giá trị |
| --- | --- |
| Mã tài liệu | EVSG-FE-EXP-2026-01 |
| Phiên bản | 1.4 - Frontend triển khai trước, team riêng sở hữu API; hoàn thiện phạm vi nhân viên/đa phương tiện, RBAC, Dashboard, Assistant nội bộ và bàn giao backend |
| Ngày cập nhật | 21/10/2026, Asia/Bangkok |
| Workflow | `/opsx-explore` |
| Phạm vi | Nhân viên đi bộ và xe máy/ô tô/xe tải ra/vào, face verification mọi luồng, Users/RBAC, Dashboard và Assistant self-hosted; kho/hành động là mở rộng |
| Cơ sở mã nguồn | Working tree khảo sát, HEAD `7797c01` |
| Nguồn chuẩn | [ReactJS AI-First UX OJT 2026 v2](Bo_Tai_Lieu_4_ReactJS_AI_First_UX_OJT_2026_v2.pdf), 48 trang |
| Trạng thái | Chưa triển khai React/JWT; chưa nghiệm thu ứng dụng |

> Các yêu cầu trong báo cáo mô tả thiết kế mục tiêu, không xác nhận tính năng đã tồn tại. Báo cáo chỉ ghi nhận kết quả explore được người dùng yêu cầu; không tự tạo change, commit, branch hoặc triển khai ứng dụng.

## Mục lục

1. Phạm vi và quyết định đã chốt
2. Hiện trạng và bằng chứng
3. Đối chiếu chuẩn AI-First UX
4. Stack và state ownership
5. Cấu trúc, composition và custom hooks
6. Layout, sidebar, routes và import/export
7. CSS dùng chung, Tailwind, motion và responsive
8. Modal render props và toast
9. Interfaces và dữ liệu màn hình
10. Danh mục API hiện tại và tích hợp thật
11. Authentication, Users và RBAC
12. Loading, AI output và xử lý lỗi
13. Realtime, cancellation và cleanup
14. Privacy và safe rendering
15. Luồng nghiệp vụ, Dashboard thống kê và AI Assistant
16. DoD, negative tests và nghiệm thu
17. Migration, rủi ro và điểm còn mở
18. Nguồn tham chiếu
19. Bàn giao riêng cho team backend

## 1. Phạm vi và quyết định đã chốt

Sản phẩm cốt lõi là quản lý nhân viên và phương tiện ra/vào: nhân viên đi bộ, người điều khiển xe máy, ô tô và xe tải. Khuôn mặt phải được xác minh ở mọi luồng khi camera ghi nhận sự kiện. Kho bãi là module mở rộng phát triển tiếp, không là nghiệp vụ dẫn dắt toàn ứng dụng. Users/RBAC, Dashboard và AI Assistant báo cáo nội bộ phục vụ nghiệp vụ ra/vào trước, sau đó mở rộng sang kho/hành vi khi có nguồn dữ liệu.

Frontend mục tiêu là React + TypeScript + Vite, chia theo nghiệp vụ và composition. Một design system, AppShell, sidebar, modal/toast và responsive áp dụng cho mọi trang. Dữ liệu vận hành phải lấy từ backend thật.

| ID | Yêu cầu người dùng đã xác nhận |
| --- | --- |
| U-01 | React/Vite stable mới nhất khi triển khai; Redux Toolkit quản lý client state |
| U-02 | Composition pattern; component và custom hooks linh hoạt, tái sử dụng |
| U-03 | JWT access token + refresh token; backend quyết định quyền |
| U-04 | Axios + TanStack Query; không thêm Zustand trùng vai trò với Redux |
| U-05 | Giữ thiết kế màn hình orders/dock/slip trong module kho mở rộng, phát triển tiếp sau phần ra/vào cốt lõi |
| U-06 | Chưa nối phiếu/order kho với Gate Out bãi xe |
| U-07 | CSS chung cho phần tái sử dụng; Tailwind cho tùy chỉnh riêng trên cùng tokens |
| U-08 | Responsive mọi trang, mọi trạng thái; không bỏ sót trang hoặc che lỗi bố cục |
| U-09 | Render props cho modal thông báo, xác nhận và CRUD; modal/toast đồng nhất |
| U-10 | Layout thống nhất, sidebar mở/thu gọn, mobile drawer và chuyển động mượt |
| U-11 | Liệt kê và tích hợp API thật; không dùng mock data cho giao diện vận hành |
| U-12 | Interface/type chuẩn theo màn hình và DTO backend; không gọi dữ liệu tùy tiện |
| U-13 | Mỗi folder component có `index.ts`; named exports/imports và routes thống nhất |
| U-14 | Theo PDF AI-First UX và skill `design-taste-frontend-v1`; tham khảo React Bits |
| U-15 | Bổ sung quản trị Users và RBAC cho authorization; tách khỏi ủy quyền tài xế–xe |
| U-16 | Có Dashboard thống kê nghiệp vụ và AI Assistant báo cáo nhanh thông minh từ dữ liệu thật |
| U-17 | AI Assistant ưu tiên model nội bộ/self-hosted; lớp kết nối model có thể thay thế |
| U-18 | Nghiệp vụ cốt lõi quản lý nhân viên và cả xe máy, ô tô, xe tải; không thiết kế thiên về xe tải/kho |
| U-19 | Face verification từ camera áp dụng cho mọi luồng; chưa có yêu cầu bỏ RFID/biển số của luồng xe hiện tại |
| U-20 | Kho bãi và nhận diện hành động xe/con người là hướng mở rộng; AI đưa observation/phán đoán có bằng chứng, không tự mở cổng |
| U-21 | Có luồng nhân viên đi bộ; dùng contract/policy riêng, không ép biển số hoặc phương tiện giả |

AI Assistant báo cáo nhanh là phạm vi mới đã được yêu cầu, ưu tiên self-hosted và chỉ đọc dữ liệu có quyền. Không tạo dữ liệu, thống kê, tiến trình hoặc trạng thái thành công giả; không cho Assistant thay đổi nghiệp vụ hoặc gọi barrier. Cloud LLM chưa được chọn. Những phần cần API mới được ghi là khoảng trống, chưa được coi là tính năng hiện tại.

### 1.1. Hồ sơ nhân viên và tài khoản vận hành

Nhân viên/người điều khiển được enrollment là đối tượng quản lý ra/vào; User là tài khoản đăng nhập vận hành có role/permissions. Không tự tạo User cho mọi nhân viên hoặc gộp face profile vào tài khoản. Liên kết nếu cần phải là use case/contract riêng.

Hiện model Driver có employee_code tùy chọn. Giai đoạn tích hợp có thể đổi nhãn UI thành “Nhân viên / Người điều khiển” nhưng `/drivers` và DriverResponse vẫn qua mapper rõ. Không tự gọi `/employees` chưa có. Phòng ban/chấm công chưa có backend không được điền giả. Hồ sơ nhân viên đi bộ cần phân biệt được với người điều khiển bên ngoài theo contract bổ sung; không mặc định mọi Driver là nhân viên nội bộ.

## 2. Hiện trạng và bằng chứng

| Nội dung | Quan sát từ repo | Nguồn |
| --- | --- | --- |
| Frontend | HTML/CSS/JavaScript thuần; hash routing và state tập trung | [app.js](../src/smart_gate/presentation/static/assets/app.js) |
| Phục vụ UI | FastAPI trả index tại `/`, mount `/assets`, cùng origin | [main.py](../src/smart_gate/main.py) |
| Auth | Session cookie HttpOnly + CSRF; login/logout/me; chưa có refresh | [auth router](../src/smart_gate/presentation/routers/auth.py), [AuthService](../src/smart_gate/application/auth.py) |
| Phân quyền | ADMIN, WAREHOUSE, SECURITY; role/scope do backend kiểm tra | [dependencies](../src/smart_gate/presentation/dependencies.py), [enums](../src/smart_gate/domain/enums.py) |
| Quản trị RBAC | User có một role enum; chưa có users/roles/permissions CRUD hoặc audit quản trị | [User model](../src/smart_gate/domain/entities.py), [repository](../src/smart_gate/domain/ports.py) |
| Dashboard/Assistant | Có trang overview hiện tại; chưa có API aggregation chuyên dụng, report job hoặc LLM Assistant | [app.js](../src/smart_gate/presentation/static/assets/app.js), [routers](../src/smart_gate/presentation/routers/__init__.py) |
| Cổng | Entry/exit router đều gọi `VerifyParkingGateUseCase` | [gates](../src/smart_gate/presentation/routers/gates.py) |
| Kho | API order/dock/finalize/slip có sẵn; navigation hiện chưa có nhóm kho | [warehouse](../src/smart_gate/presentation/routers/warehouse.py) |
| Nhân viên/phương tiện | Driver có employee_code; vehicle_type là chuỗi tự do, chưa catalog chuẩn | [entities](../src/smart_gate/domain/entities.py), [schemas](../src/smart_gate/presentation/schemas.py) |
| Người đi bộ | API cổng hiện bắt buộc plate_image nên chưa có luồng đi bộ riêng | [gates](../src/smart_gate/presentation/routers/gates.py) |
| Face verification | So khớp 1:1 với chủ thẻ; SFace chọn mặt lớn nhất, chưa liên kết chắc chắn với người điều khiển | [parking gate](../src/smart_gate/application/parking_gate.py), [face](../src/smart_gate/infrastructure/vision/face.py) |
| Camera/edge | Snapshot định kỳ; client chưa gửi card_uid bắt buộc, còn slip_image ở exit | [edge main](../src/edge_agent/main.py), [edge client](../src/edge_agent/client.py) |
| Hành động video | Cargo adapter là object detector ảnh; chưa có temporal action pipeline | [cargo](../src/smart_gate/infrastructure/vision/cargo.py) |
| Realtime | WS cảnh báo dùng session; REST hỗ trợ sequence resync | [security](../src/smart_gate/presentation/routers/security.py) |
| Feedback | Có `openModal`, `confirmAction`, `showToast` cần chuyển sang React | [app.js](../src/smart_gate/presentation/static/assets/app.js) |
| Contract | Pydantic schemas/DTO; OpenAPI snapshot lưu trong docs | [schemas](../src/smart_gate/presentation/schemas.py), [DTO](../src/smart_gate/application/dto.py), [OpenAPI](openapi.json) |
| Health | Readiness hiện kiểm tra database, không đo riêng mọi camera/model | [health](../src/smart_gate/presentation/routers/health.py) |
| Tooling | Package Node ở gốc phục vụ demo; chưa có frontend React package | [package.json](../package.json) |

BRD/tài liệu cũ có luồng Gate Out liên thông kho; router đang dùng luồng bãi xe. Báo cáo giữ hiện trạng và U-06, không diễn giải tài liệu cũ thành chức năng đang chạy. OpenSpec CLI chưa có trên PATH trong phiên khảo sát; trạng thái change chưa được xác nhận bằng CLI.

## 3. Đối chiếu chuẩn AI-First UX

PDF được dùng làm chuẩn trải nghiệm, khả năng kiểm soát và kiểm thử. Smart Gate dùng AI thị giác, không có sẵn luồng chatbot/token streaming; các yêu cầu có điều kiện phải được ghi rõ thay vì tuyên bố tuân thủ đầy đủ.

| PDF | Nguyên tắc | Áp dụng Smart Gate |
| --- | --- | --- |
| Mục 1-2, tr. 1-3 | AI Experience Plane | Phân biệt observation AI, quyết định backend, xác nhận operator, ACK barrier |
| Mục 2.4-2.7, tr. 4-13 | Human control, confirmation, rollback | Xác nhận hành động rủi ro; không optimistic side effect vật lý |
| Mục 2.6, tr. 8-12 | Output là untrusted input | Text mặc định, schema guard, HTML allowlist nếu cần |
| Mục 3, tr. 14-20 | Loading thật và lỗi cục bộ | Skeleton/state theo request; pipeline chi tiết cần backend event |
| Mục 4, tr. 20-32 | Streaming, abort, buffering, cleanup | Giữ WS cảnh báo; SSE/fetch stream chỉ khi có API thật |
| Mục 4.6, tr. 30-31 | Không persist nội dung nhạy cảm | Token/evidence/buffer trong memory tạm; cleanup khi kết thúc |
| Mục 5, tr. 32-42 | Privacy, Restricted hard-block, A11Y | Chặn egress trái policy; keyboard/live region/fallback trung tính |
| Phụ lục A-B, tr. 43-44 | Feature structure và DoD | Cấu trúc, trách nhiệm, test evidence trong báo cáo |
| Phụ lục D, tr. 45-47 | CSS demo | Tham khảo states; theme theo yêu cầu người dùng và design skill |
| Phụ lục E, tr. 47-48 | Tám negative tests | Ánh xạ theo schema và transport thật ở mục 16 |

### 3.1. Điều chỉnh ví dụ đào tạo khi thiết kế production

- Không sao chép sanitizer tự viết thành hàng rào XSS duy nhất. Ưu tiên text; HTML cần sanitizer được duy trì và regression tests.
- Cast `as SomeEvent` không thay runtime validation; dữ liệu HTTP/WS/SSE cần schema ở boundary.
- Error Boundary bảo vệ lỗi render cây con; async/mutation/event handler phải xử lý riêng. Không đưa raw exception vào fallback. [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary).
- Audit identity/time do backend lấy từ principal/server clock; không tin `confirmedBy` do UI gửi.
- Optimistic rollback không hoàn tác được mở barrier. Hủy request browser không có nghĩa server đã hủy tác vụ.
- Regex PII không phát hiện đầy đủ dữ liệu nhạy cảm; không thấy regex không đồng nghĩa Public.
- Modal production cần focus trap/restore, keyboard và pending guards, không chỉ focus nút confirm. [WAI-ARIA Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

## 4. Stack và state ownership

| Phần | Lựa chọn | Quy tắc |
| --- | --- | --- |
| UI/build | React, TypeScript strict, Vite | SPA client-side; không mặc định RSC/Next.js |
| Routing | React Router Data Mode | Nested layouts, lazy page modules, route boundaries |
| Client state | Redux Toolkit | UI preferences/workspace/auth lifecycle; dữ liệu serializable |
| Server state | TanStack Query | Một nguồn cache/query/mutation/invalidation |
| HTTP | Axios | Một transport, token/CSRF, timeout, cancellation, error mapping |
| Forms | React Hook Form + Zod | Theo DTO; lỗi field và schema validation |
| Styling | CSS chung + Tailwind | Dùng cùng semantic tokens |
| UI/table | Radix Primitives, TanStack Table | Bọc theo design system; không tự tạo theme theo trang |
| Icons/motion | Phosphor, Motion, React Bits chọn lọc | Một quy ước, reduced motion và cleanup |
| Test | Vitest, Testing Library, Playwright | Negative cases cô lập; E2E backend thật |
| AI reporting | Backend report service + model gateway nội bộ | Model self-hosted; số liệu do aggregation service tính, LLM chỉ diễn giải |

Tại ngày khảo sát, React docs ở nhánh 19.3 và Vite ghi nhánh cập nhật thường xuyên là 8.3. Khi triển khai phải xác minh patch stable/peer dependencies và tạo lockfile, không dùng số phiên bản trong báo cáo thay cho kiểm tra cài đặt. [React versions](https://react.dev/versions), [Vite releases](https://vite.dev/releases).

TanStack Query sở hữu drivers/vehicles/orders/dock/logs/alerts/me và các nguồn mới users/roles/permission catalog/dashboard/report jobs. Redux sở hữu sidebar/theme/workspace selection và auth lifecycle, không sao chép server lists hoặc user profile. URL sở hữu filters có nhu cầu bookmark; form/local state giữ input và UI tạm. Token ở auth service RAM; Blob/socket/controller/ref và buffer stream không đưa vào Redux. [Server state và client state](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state).

Không thêm Zustand trùng Redux, không thêm RTK Query thành cache song song. Nếu chọn RTK Query sau này, đó là thay thế TanStack Query cần review. Không persist query cache nhạy cảm; logout/đổi user phải hủy request và xóa dữ liệu để response cũ không phục hồi phiên.

## 5. Cấu trúc, composition và custom hooks

### 5.1. Cấu trúc mục tiêu

```text
frontend/
  package.json                       Riêng với package demo ở gốc
  src/
    app/
      providers/                     Redux, Query, Auth, Feedback, Router
      router/                        Registry, paths, guards, lazy modules
      store/                         Store và typed Redux hooks
      styles/                        Entry CSS và design system
    layouts/
      AppShell/                      Sidebar, topbar, outlet
      AuthLayout/
      ListPageLayout/
      DetailPageLayout/
      WorkspaceLayout/
    pages/                           Mỗi page có index.ts riêng
      LoginPage/ DashboardPage/ GateControlPage/
      PedestrianGatePage/ PersonAccessLogsPage/
      DriversPage/ VehiclesPage/ AuthorizationsPage/
      EmployeeCardsPage/ GateLogsPage/ AlertsPage/
      OrdersPage/ OrderDetailPage/
      DockInspectionsPage/ DockDetailPage/ ExitSlipPage/ SystemPage/
      UsersPage/ RolesPage/ PermissionsPage/ AuditLogsPage/
      AiAssistantPage/ QuickReportDetailPage/
    widgets/                         GateWorkspace/, DockReviewWorkspace/...
    features/
      auth/ drivers/ vehicles/ authorizations/ employee-cards/
      gate-verification/ gate-logs/ alerts/
      pedestrian-access/ person-access-logs/
      warehouse-orders/ dock-inspections/ exit-slips/
      users/ roles/ permissions/ audit-logs/
      dashboard-analytics/ ai-reports/
    shared/
      ui/                            Button/, Field/, DataTable/, Skeleton/...
      feedback/                      ModalHost/, ToastHost/, ConfirmDialog/...
      api/                           Generated DTO, transport, errors
      realtime/                      WS transport, schemas, reconnect
      hooks/                         Hook không gắn nghiệp vụ
      lib/                           Date/file/formatting
      config/
```

Các tên cùng dòng là folder riêng, không phải tên file có dấu cách. Mỗi component/layout/page folder có `index.ts`. Feature có thể chứa `api`, `model`, `hooks`, `components`, tests; chỉ tạo khi có trách nhiệm thật.

### 5.2. Composition và dependency rule

Page ghép layout/widget/feature; widget điều phối feature qua public API; feature dùng shared. Shared không import app store/page/feature; không deep-import nội bộ feature khác hoặc tạo vòng phụ thuộc. Layout dùng slots/children và nested outlet, không kế thừa class.

Ví dụ DockDetailPage ghép PageHeader, EvidencePanel/ImageViewer/CaptureTimeline và ReviewPanel/CargoSummary/OperatorNote/FinalizeAction. Các component hiển thị nhận props có type; API/query/hook chịu dữ liệu. Dialog/Tabs/Table dùng compound components khi có ngữ cảnh chung. Không xây UniversalCrud với hàng chục boolean để điều khiển mọi nghiệp vụ.

### 5.3. Custom hooks theo chức năng

| Hook dự kiến | Trách nhiệm | Giới hạn |
| --- | --- | --- |
| `useDriversScreen` | Kết hợp filters/query/table/form actions | Không phụ thuộc kho/sidebar/token |
| `useDriverForm` | Defaults, validation, submit, lỗi field | Không sở hữu theme hoặc toast transport |
| `useGateVerification` | Input, event_id, pending, kết quả/reconcile | Không gọi barrier hoặc tự kết luận opened |
| `usePedestrianVerification` | Employee/card/face request và kết quả ra/vào đi bộ | Không gửi plate_image/vehicle_id giả |
| `useDockReview` | Dock data/evidence/operator decision/finalize | Không tự phê duyệt theo AI |
| `useOrderActions` | Create/update/cancel/slip theo quyền và trạng thái | Không tự hoàn tất order sau Gate Out |
| `useModal`, `useFeedback` | Mở/đóng feedback thống nhất | Không fetch mọi dữ liệu nghiệp vụ |
| `useCameraCapture` | Camera lifecycle và cleanup | Không gửi cloud hoặc lưu ảnh tự động |
| `useAlertConnection` | WS lifecycle, sequence, resync/dedupe | Không tạo cache thứ hai trong Redux |
| `useUsersScreen`, `useRolePermissions` | List/form/gán role, chọn quyền, conflict và audit feedback | Không cấp quyền chỉ bằng cập nhật UI |
| `useAuthorization` | can/canAny/canAll từ principal contract đã xác nhận | Không suy quyền từ JWT decode hoặc role strings cố định |
| `useDashboardAnalytics` | Bộ lọc kỳ, query aggregate, coverage và charts | Không đếm list limit thành tổng toàn hệ thống |
| `useQuickReport` | Tạo report job, theo dõi event, cancel, citations và kết quả | Không gọi model hoặc database trực tiếp từ browser |

Một custom hook có thể gom các hooks nhỏ liên quan để page dễ dùng, trả interface gồm `data/state/actions`. Không gom toàn app vào một hook lớn. API functions/query definitions/schema vẫn độc lập để reuse và test; chỉ thêm cấu hình khi có nhu cầu thực.

## 6. Layout, sidebar, routes và import/export

```text
RootProviders
  AuthLayout                         Login/bootstrap
  ProtectedRoute
    AppShell                         Không remount khi chuyển trang con
      Sidebar + Topbar + Breadcrumb
      ContentOutlet
        ListPageLayout               Filters/table/pagination
        DetailPageLayout             Thông tin/timeline
        WorkspaceLayout              Evidence + thao tác cổng/dock
      ModalHost                      Một host
      ToastHost                      Một host
```

### 6.1. Quy ước routes

Trong giai đoạn chuyển đổi, đặt React dưới `/console`; UI cũ có thể giữ ở `/` để rollback. Bảng dưới ghi path đầy đủ của phương án mục tiêu, không phải route đã được triển khai.

| Page | Route | Layout |
| --- | --- | --- |
| Login | `/console/login` | AuthLayout |
| Dashboard | `/console/dashboard` | AppShell/overview |
| Gate Control | `/console/gates` | WorkspaceLayout |
| Pedestrian Gate | `/console/pedestrians` | WorkspaceLayout chung, schema/form riêng |
| Nhân viên / Người điều khiển | `/console/employees` | ListPageLayout; dùng mapper Driver DTO, `/console/drivers` redirect tương thích |
| Vehicles | `/console/vehicles` | ListPageLayout |
| Authorizations | `/console/authorizations` | ListPageLayout |
| Cards | `/console/employee-cards` | ListPageLayout |
| Logs | `/console/gate-logs` | ListPageLayout + details |
| Person access logs | `/console/person-access-logs` | ListPageLayout + details, không giả từ vehicle logs |
| Alerts | `/console/alerts` | ListPageLayout + details |
| Orders | `/console/warehouse/orders` | ListPageLayout |
| Order detail | `/console/warehouse/orders/:orderId` | DetailPageLayout |
| Dock list/detail | `/console/warehouse/docks`, `/console/warehouse/docks/:inspectionId` | List/WorkspaceLayout |
| Slip | `/console/warehouse/orders/:orderId/slip` | DetailPageLayout |
| System | `/console/system` | DetailPageLayout |
| Users | `/console/admin/users` | ListPageLayout + FormModal |
| Roles | `/console/admin/roles` | ListPageLayout + permissions editor |
| Permission catalog | `/console/admin/permissions` | ListPageLayout chỉ đọc |
| Audit logs | `/console/admin/audit-logs` | ListPageLayout + detail |
| AI Assistant | `/console/assistant` | WorkspaceLayout |
| Quick report detail | `/console/reports/:reportId` | DetailPageLayout |

Route registry quản lý ID, paths, page loader, layout, title/breadcrumb và capability. Sidebar lấy metadata từ cùng registry. Link helpers encode params, validate search params và redirect nội bộ; page không tự viết lại route strings. Menu chỉ trỏ tới route đã đăng ký và được phép truy cập.

Routes kho/dock/slip là extension: chỉ đăng ký/hiển thị khi module đã được triển khai và bật ở server với permissions tương ứng. Không để menu cốt lõi dẫn đến trang mock, placeholder thành công hoặc order bắt buộc cho mọi xe. Tắt module ở cả policy/API và UI, không chỉ ẩn sidebar bằng CSS.

### 6.2. Import/export thống nhất

- Named exports cho component/hook; `export type` cho interface/types; tên PascalCase và hook `use...`.
- Mỗi folder component có `index.ts` chỉ công bố component và types liên quan. Bên ngoài import public entry point, không deep-import file nội bộ.
- Trong cùng folder, dùng relative import tới file nội bộ, tránh vòng qua chính barrel `index.ts`.
- Không dùng `export *` đại trà, không tạo một barrel eagerly-import tất cả pages.
- Mỗi page có `index.ts` xuất named `Component` cho route và `ErrorBoundary` nếu có. Router dynamic-import đúng entry point của page đó để giữ code splitting; không import qua barrel tổng của tất cả pages. Nếu có loader, loader dùng cùng query definitions/cache thay vì fetch trùng với component.
- Alias như `@/` được cấu hình thống nhất ở TypeScript, Vite và test runner; lint kiểm tra deep imports và circular dependencies.

### 6.3. Sidebar và chuyển động

Desktop có expanded/collapsed rail với tokens chiều rộng; active state rõ, rail có tooltip/accessible name. Tablet dùng rail/drawer theo không gian; mobile là off-canvas drawer, overlay, focus trap, Escape và trả focus về nút mở.

Toggle có aria-expanded/controls; nhóm Điều hành/Hồ sơ/Kho/Giám sát/Quản trị/Báo cáo dùng chung cấu trúc, lọc theo permissions hiệu lực. Chỉ persist tùy chọn collapsed/theme không nhạy cảm. Không reset sidebar/shell khi chuyển trang; không chỉ dựa hover để thao tác. Khi mở modal, drawer đóng hoặc mất tính tương tác để tránh hai focus trap cạnh tranh.

Motion dùng transform/opacity và FLIP khi đổi bố cục; không animation width/height liên tục kéo reflow toàn bảng. Khi reduced motion, chuyển trạng thái vẫn đầy đủ chức năng nhưng bỏ chuyển động không thiết yếu.

## 7. CSS dùng chung, Tailwind, motion và responsive

### 7.1. Một nguồn thiết kế

Yêu cầu CSS chung của người dùng được ưu tiên hơn tỷ lệ Tailwind mặc định trong skill. CSS tái sử dụng quản lý diện mạo và interaction states; Tailwind quản lý bố cục riêng. Hai cách cùng đọc một bộ semantic tokens, không có hai theme.

```text
app/styles/
  index.css                 Import một lần tại bootstrap
  tokens.css                Color/font/space/radius/shadow/z-index/motion
  base.css                  Base/preflight tương thích, typography, focus
  components.css            Button/field/table/badge/modal/toast/skeleton
  layouts.css               Shell/sidebar/page/toolbar
  motion.css                Transition và reduced motion
```

Có thể chia CSS components thành file nhỏ rồi import qua entry point, không dồn thành file khổng lồ. Quy định cascade layers tập trung theo Tailwind: theme/base/components/utilities; diện mạo không phụ thuộc thứ tự lazy-load page.

| Nhu cầu | Nơi quản lý | Quy tắc |
| --- | --- | --- |
| Màu/font/spacing/radius/shadow | Tokens | Semantic surface/text/border/accent/danger/warning |
| Button/Input/Dialog/Toast variants | Shared CSS/component | Page truyền variant, không override mỗi trang một kiểu |
| Grid/cột/wrap/gutters | Tailwind ở page/widget | Dùng tokens/breakpoints đã chốt |
| Evidence bounding boxes | Component có scope | Tọa độ động kiểm soát, scale theo ảnh thật |
| Ngoại lệ thiết kế | Review design system | Không tùy ý hex/radius/arbitrary values/important |

Tailwind theme ánh xạ CSS variables chung; utility không tự tạo bảng màu riêng. Dynamic classes dùng map tĩnh hoặc CSS properties có kiểm soát để build không bỏ sót classes. Tailwind v4 dùng plugin Vite đúng phiên bản. [Theme](https://tailwindcss.com/docs/theme), [custom styles](https://tailwindcss.com/docs/adding-custom-styles), [Vite integration](https://tailwindcss.com/docs/installation/using-vite).

### 7.2. UI/UX và motion policy

Áp dụng skill với baseline design variance 8, motion intensity 6, density 4: bố cục có điểm nhấn, khoảng trắng có chủ đích, micro-interaction mượt nhưng vị trí dữ liệu vận hành ổn định. Nền neutral sáng, một accent xanh lục dịu; đỏ/vàng là màu trạng thái. Geist/Geist Mono có font tiếng Việt và fallback phù hợp.

Overview có thể dùng Bento với dữ liệu thật; bảng/form dùng phân nhóm và spacing, không lặp hàng ba card giống nhau. Không neon/gradient chữ/emoji, số liệu giả hoặc heading quá khổ. React Bits chỉ chọn leaf component cần thiết, theme lại theo tokens, kiểm tra dependency/license. [React Bits](https://reactbits.dev/get-started/introduction).

Motion dùng tokens chung, transform/opacity. Không animate mọi row mỗi refetch, tự đảo vị trí bảng hoặc tạo trạng thái “đang xử lý” khi không có sự kiện thật. Loop nếu cần phải nhỏ, cô lập, có ý nghĩa và dừng khi reduced motion/ẩn trang. Loading không gây layout shift; focus và dữ liệu không bị animation làm mất vị trí.

### 7.3. Responsive cho tất cả pages

Mobile-first; dự kiến sm=640, md=768, lg=1024, xl=1280, 2xl=1536 CSS px, định nghĩa ở theme chung. [Tailwind responsive](https://tailwindcss.com/docs/responsive-design).

| Thành phần | Mobile | Tablet | Desktop |
| --- | --- | --- | --- |
| Shell | Drawer, content full-width | Rail/drawer | Expanded/rail |
| Header/actions | Wrap, CTA rõ | Wrap khi thiếu chỗ | Cùng hàng khi đủ chỗ |
| Form | Một cột, label trên | Hai cột khi phù hợp | Nhóm rõ, input không kéo quá rộng |
| Gate/dock | Evidence trước, thao tác sau | Chia vùng nếu đủ | Hai vùng theo ưu tiên nghiệp vụ |
| Table | Scroll nội bộ hoặc view gọn đủ thông tin | Cột ưu tiên + detail | Cột đầy đủ |
| Modal | Vừa viewport; body scroll | Size variants | Giới hạn width/height |
| Toast | Không tràn/che submit | Cùng host | Cùng host |
| Image/QR | Giữ aspect ratio, không crop QR | Tương tự | Tương tự |

Không dùng overflow-x hidden toàn trang để che lỗi. Grid/flex children phải co được; mã dài có wrap/truncate và cách xem đủ. Bảng cuộn hai chiều trong vùng có nhãn, không kéo cả trang. Modal có title/actions tiếp cận được khi mở bàn phím mobile; dùng dvh phù hợp. [WCAG Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

Ma trận QA bắt buộc MỌI PAGE: 320/360, 768, 1024, 1440, 1920 px; portrait/landscape, zoom 200%, nội dung dài và keyboard. Kiểm tra ready/loading/empty/error/forbidden; trang có modal thêm open/submitting/validation/error. Đây là kế hoạch nghiệm thu, chưa phải bằng chứng đã đạt.

## 8. Modal render props và toast

### 8.1. Một FeedbackProvider, ModalHost và ToastHost

Kế thừa hành vi hữu ích của openModal/confirmAction/showToast hiện có, chuẩn hóa sang React. Modal chỉ mở do thao tác rõ ràng, không tự bật khi refetch/render/chuyển trang.

Render props `renderContent(context)` và khi cần `renderFooter(context)` có interface tường minh cho close/requestClose, form ID, pending và actions. ModalShell quản lý portal/overlay/title/description/size/focus/scroll lock/motion; feature cung cấp nội dung form và nghiệp vụ có type. Đây là contract thiết kế, chưa có implementation.

```text
User action -> useModal.open(descriptor, render props)
  -> ModalHost/ModalShell
    -> FeatureForm hoặc NoticeContent
    -> Footer chuẩn -> mutation API thật
      lỗi: giữ form + inline errors
      thành công: reconcile/invalidate -> đóng -> một toast
```

| Loại | Dùng cho | Ràng buộc |
| --- | --- | --- |
| NoticeModal | Thông tin cần xác nhận để tiếp tục | Không dùng cho mọi success |
| ConfirmDialog | Khóa/mất/thay thẻ, thu hồi, hủy order, finalize, reissue | Nêu đối tượng/hậu quả/nhãn cụ thể |
| FormModal | CRUD ngắn | Dùng Field/footer chung, lỗi không mất input |
| DetailModal | Xem nhanh hồ sơ | Không thay route detail dài cần deep-link |
| EvidenceViewer | Ảnh/zoom | Quyền, Blob/camera cleanup, keyboard |

Không nhét mọi CRUD vào một form tổng quát. Không lưu callback/ReactNode/Promise/DOM/AbortController trong Redux; render props và lifecycle thuộc provider/controller. Modal ID ổn định; double-click không mở trùng; chỉ một modal blocking hoạt động. Confirmation bước hai ưu tiên thay nội dung cùng host thay vì chồng tùy tiện.

Dirty form hỏi trước khi bỏ; logout/route change cleanup theo policy. Mutation nhạy cảm pending không được đóng khiến user tưởng đã hủy; nếu cho đóng phải có chỗ theo dõi/reconcile. Escape/backdrop tuân theo policy này và luôn có thông báo lý do. Focus trap/restore, label và error association bắt buộc.

### 8.2. Ownership thông báo

Giữ success/warning/error hiện có; info nếu bổ sung dùng cùng hệ. Một vị trí, icon set, variants và motion. Feature mutation sở hữu thông báo kết quả; Axios chỉ chuẩn hóa lỗi, không toast mọi response rồi feature toast lần nữa.

- Validation 422 đặt dưới field/form; lỗi tải panel đặt tại panel; toast không là nơi duy nhất lưu lỗi cần xử lý.
- Dedupe theo operation/entity/error; lỗi reconnect không phát toast mỗi retry. Giới hạn số hiển thị và queue.
- Thời gian auto-dismiss cấu hình tập trung; pause hover/focus, keyboard dismiss; thông báo cần hành động không biến mất quá sớm.
- Alert stream cập nhật inbox/badge trước, gom nhóm theo severity; không tràn hàng trăm toast.
- Toast không cướp focus; live region không announce trùng với inline. Chỉ success khi backend xác nhận đúng trạng thái.
- “Đã dừng theo dõi” khác “Đã hủy tác vụ”; “Đã xác minh” khác “Barrier đã mở”.

## 9. Interfaces và dữ liệu màn hình

### 9.1. Contract-first

| Lớp | Nguồn | Trách nhiệm |
| --- | --- | --- |
| API request/response types | OpenAPI đối chiếu router/Pydantic | Snake_case, nullable, enums, body/query đúng backend |
| Runtime schemas | Boundary HTTP/WS | Validate unknown trước render/cache |
| Screen interfaces | Suy ra DTO qua mapper | Props/form/filter/view model/actions có type |

Ưu tiên sinh TypeScript DTO từ OpenAPI, tránh chép response tay. Screen interfaces dùng DTO/Pick/Omit khi phù hợp; union/enum có thể là type alias, không ép thành interface. Generated types không thay runtime schema.

Không cast unknown thành interface để bỏ validation; không dùng any để lách contract. Missing required field là lỗi contract, không bù fake data. Nullable có UI state thật. Mapper chỉ đổi tên/format/ngày/labels tường minh, không đổi ý nghĩa score/status hoặc invent field.

### 9.2. Type theo màn hình

| Screen | Interfaces/type dự kiến | Nguồn được phép |
| --- | --- | --- |
| Login | LoginFormValues, AuthScreenState | Login/me |
| Dashboard | DashboardViewModel, MetricCoverage | Tổng hợp nguồn có quyền, ghi coverage |
| Nhân viên / Người điều khiển | DriversScreenModel/EmployeeScreenModel, EmployeeRegistryValues, DriverFormValues | Driver DTO compatibility + EmployeeRegistryResponse mới sau khi backend có; mapper tường minh |
| Vehicles | VehiclesScreenModel, VehicleFormValues | Vehicle request/response |
| Authorizations | AuthorizationsScreenModel, AuthorizationFormValues | Authorization + driver/vehicle lookup |
| Cards | EmployeeCardsScreenModel, CardIssueValues, CardReplaceValues | Card response UID đã mask |
| Gates | GateScreenModel, GateVerificationFormValues, VerificationViewModel | Gate payload/VerificationOutput |
| Người đi bộ | PedestrianGateScreenModel, PedestrianVerificationValues, PersonAccessLogViewModel | Contract mới không yêu cầu xe/biển số |
| Logs | GateLogsScreenModel, GateLogFilters, EvidenceViewModel | GateLogOutput + snapshots |
| Alerts | AlertsScreenModel, AlertFilters, ConnectionState | AlertResponse/WS/sequence |
| Orders | OrdersScreenModel, OrderFormValues, OrderDetailViewModel | Order DTO + lookup có quyền |
| Dock | DockReviewScreenModel, DockCaptureValues, FinalizeDockValues | DockDetailOutput/CargoState |
| Slip | ExitSlipScreenModel, SlipArtifactKind | SlipOutput/order/artifact API |
| System | SystemScreenModel | Live/ready thật, không giả GPU/camera healthy |
| Users | UsersScreenModel, UserFormValues, AssignRoleValues, UserSessionViewModel | DTO quản trị mới; không có password_hash/token trong read response |
| Roles/Permissions | RolesScreenModel, RoleFormValues, PermissionMatrixViewModel | Role DTO/version, catalog backend và quyền hiệu lực |
| Audit | AuditLogsScreenModel, AuditFilters | Audit DTO đã redact và query theo quyền |
| Analytics | DashboardFilters, DashboardMetricsResponse, MetricValue, MetricProvenance | Aggregate backend, coverage/available/null và metric definitions |
| Assistant | QuickReportRequest, ReportJobResponse, ReportEvent, GroundedReportResult | Report job/citations/snapshot, enum trạng thái và output schema mới |

API calls chỉ ở feature API modules/transport; component không tự gọi arbitrary URL. Hook màn hình ghép query/actions đã khai báo. Lint/dependency review và contract tests kiểm soát method/path/query/body/mapper; types không thay phân quyền backend. API registry mục 10 là cơ sở review từng màn hình.

## 10. Danh mục API hiện tại và tích hợp thật

### 10.1. Quy ước

Đã kiểm tra 44 HTTP operations và 1 WebSocket route do ứng dụng định nghĩa, không tính docs/OpenAPI/static routes. A=ADMIN, W=WAREHOUSE, S=SECURITY, D=device đúng scope. Mutation operator hiện dùng session + CSRF; bảng không mô tả auth JWT đã có. Query/body chi tiết phải lấy từ Pydantic/OpenAPI.

### 10.2. Auth và dữ liệu nền

| Method | Endpoint | Quyền | Màn hình/contract |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | Chưa đăng nhập | JSON username/password; metadata/cookie, chưa JWT |
| GET | `/api/v1/auth/me` | Session | Bootstrap, user/role/csrf_token |
| POST | `/api/v1/auth/logout` | Session + CSRF | Logout thật và clear local state |
| GET | `/api/v1/drivers` | A/W/S | List và lookup |
| GET | `/api/v1/drivers/{driver_id}` | A/W/S | Detail |
| POST | `/api/v1/drivers` | A | Multipart full_name, employee_code?, phone?, face_image |
| PATCH | `/api/v1/drivers/{driver_id}` | A | Multipart fields/face_image tùy chọn |
| DELETE | `/api/v1/drivers/{driver_id}` | A | Ngừng hoạt động, không xóa vĩnh viễn |
| GET | `/api/v1/vehicles` | A/W/S | List và lookup |
| GET | `/api/v1/vehicles/{vehicle_id}` | A/W/S | Detail |
| POST | `/api/v1/vehicles` | A | VehicleRequest JSON |
| PATCH | `/api/v1/vehicles/{vehicle_id}` | A | VehicleUpdateRequest JSON |
| DELETE | `/api/v1/vehicles/{vehicle_id}` | A | Ngừng hoạt động |
| GET | `/api/v1/driver-vehicle-authorizations` | A/W/S | List và hiệu lực |
| POST | `/api/v1/driver-vehicle-authorizations` | A | driver_id, vehicle_id, valid_from, valid_until? |
| DELETE | `/api/v1/driver-vehicle-authorizations/{driver_id}/{vehicle_id}` | A | Thu hồi theo cặp ID, không dùng authorization ID thay thế |

### 10.3. Thẻ, cổng, giám sát và health

| Method | Endpoint | Quyền | Màn hình/contract |
| --- | --- | --- | --- |
| GET | `/api/v1/employee-cards` | A | Query driver_id?; UID response đã mask |
| GET | `/api/v1/employee-cards/{card_id}` | A | Detail và replacement references |
| POST | `/api/v1/employee-cards` | A | driver_id, card_uid, status_reason?, metadata |
| POST | `/api/v1/employee-cards/{card_id}/block` | A | JSON status_reason |
| POST | `/api/v1/employee-cards/{card_id}/report-lost` | A | JSON status_reason |
| POST | `/api/v1/employee-cards/{card_id}/replace` | A | card_uid, status_reason bắt buộc, metadata tùy chọn |
| POST | `/api/v1/gates/entry/verifications` | A/S hoặc D gate:entry | Multipart event_id, gate_id, card_uid, plate_image, face_image |
| POST | `/api/v1/gates/exit/verifications` | A/S hoặc D gate:exit | Cùng payload; luồng bãi xe |
| GET | `/api/v1/gate-logs` | A/W/S | limit, direction?, verification_status? |
| GET | `/api/v1/gate-logs/{gate_log_id}/snapshots/{snapshot_index}` | A/W/S | Bytes ảnh; index không âm |
| GET | `/api/v1/security/alerts` | A/S | after_sequence, limit; resync |
| PATCH | `/api/v1/security/alerts/{alert_id}` | A/S | JSON status theo AlertStatus |
| WS | `/ws/v1/security/alerts` | A/S/session | Alerts và ping/pong; runtime validate |
| GET | `/health/live` | Không role dependency | Liveness |
| GET | `/health/ready` | Không role dependency | Database readiness hiện tại |

### 10.4. Kho hàng

| Method | Endpoint | Quyền | Màn hình/contract |
| --- | --- | --- | --- |
| GET | `/api/v1/warehouse/orders` | A/W/S | Orders list |
| GET | `/api/v1/warehouse/orders/{order_id}` | A/W/S | Detail theo mã order |
| POST | `/api/v1/warehouse/orders` | A/W | order_id, assigned_driver_id, assigned_vehicle_id, cargo_metadata, valid_from, valid_until |
| PATCH | `/api/v1/warehouse/orders/{order_id}` | A/W | UpdateOrderRequest fields |
| DELETE | `/api/v1/warehouse/orders/{order_id}` | A/W | Hủy theo state machine |
| POST | `/api/v1/warehouse/orders/{order_id}/dock-sessions` | A/W | Mở dock, kiểm tra lượt Gate In/hiệu lực |
| GET | `/api/v1/warehouse/dock-sessions` | A/W/S | Query limit; chưa cursor pagination đầy đủ |
| GET | `/api/v1/warehouse/dock-sessions/{inspection_id}` | A/W/S | Detail và captures |
| POST | `/api/v1/warehouse/dock-sessions/{inspection_id}/captures` | A/W hoặc D dock:capture | Multipart image, cargo_state? theo policy |
| GET | `/api/v1/warehouse/dock-sessions/{inspection_id}/captures/{capture_index}/image` | A/W/S | Bytes ảnh capture |
| POST | `/api/v1/warehouse/dock-sessions/{inspection_id}/finalize` | A/W | operator_note, final_cargo_state; application chỉ LOADED/ANOMALY |
| POST | `/api/v1/warehouse/orders/{order_id}/exit-slip` | A/W | Phát hành, không tự thêm body giả |
| POST | `/api/v1/warehouse/orders/{order_id}/exit-slip/reissue` | A/W | Cấp lại, tăng version và vô hiệu phiếu cũ |
| GET | `/api/v1/warehouse/orders/{order_id}/exit-slip/{artifact_type}` | A/W/S | artifact_type=qr/html/pdf; bytes + Content-Type |

### 10.5. Ràng buộc tích hợp

- Runtime chỉ gọi backend thật theo bảng. Không fixtures/demo arrays/random metrics/fallback success vào màn hình vận hành.
- API rỗng -> empty; API lỗi -> error/degraded; thiếu API -> chưa khả dụng. Không thay bằng mock.
- Khi triển khai, lấy live OpenAPI, so sánh snapshot/router, rồi sinh types; không tin snapshot cũ nếu drift.
- FormData cho multipart; không tự đặt boundary. Ảnh/PDF qua Axios blob adapter có kiểm tra loại và revoke URL.
- Metric từ list phải ghi coverage/time range. Dữ liệu bị limit không phải tổng toàn hệ thống. Ready không chứng minh mọi camera/GPU/model healthy.
- Invalidation đúng nghiệp vụ: driver list/detail, dock/order sau finalize, order/slip sau reissue, alerts đúng key; reconcile bằng response thật.
- Dữ liệu fixture chỉ phục vụ test cô lập, không có mock mode của trang vận hành; không seed production để lấp dashboard.

Transport chuẩn hóa lỗi từ body hiện có `error.code`, `error.message`, `error.details`; correlation ID đọc từ header `X-Request-ID`, không tự giả backend trả field requestId trong body. Interface lỗi phía frontend có thể thêm status/requestId sau bước mapping tường minh.

| Kết quả API | Cách xử lý thống nhất |
| --- | --- |
| 401 | Session hiện tại hết hạn hoặc JWT refresh theo contract sau migration; không lặp vô hạn |
| 403 | Thiếu quyền/CSRF; giữ thông báo phù hợp, không refresh vì thiếu quyền |
| 404 | Đối tượng không còn tồn tại; refresh list và đóng/chuyển detail phù hợp |
| 409 | Xung đột state/nghiệp vụ; nêu lý do từ error contract và tải lại trạng thái |
| 422 | Map validation details về field/form; không làm mất input |
| 5xx/network | Fallback cục bộ; query có retry giới hạn, mutation cần kiểm tra side effect |

### 10.6. Khoảng trống phải ghi rõ

| Chưa có/thiếu | Thiết kế cần bổ sung | UI trước khi bổ sung |
| --- | --- | --- |
| JWT/refresh/revoke | Backend auth contract và migration | Session thật nếu milestone đầu; chưa tuyên bố JWT hoàn tất |
| WS JWT | Ticket ngắn hạn một lần, expiry/revocation | WS session hiện tại, không giả ticket endpoint |
| Pagination/filter/count đầy đủ | Contract từng list, count/coverage | Chỉ lọc phần đã tải, ghi giới hạn |
| Pipeline progress | Event task/operation thật | Chỉ state request biết được |
| Cancel server | Cancel endpoint + server acknowledgment | Dừng chờ/theo dõi, không tuyên bố đã hủy |
| Tổng hợp dashboard | API thống kê chuyên dụng theo kỳ, permission scope và metric definitions | Bắt buộc bổ sung theo U-16; không giả tổng từ list limit |
| Users/RBAC | Users, roles, catalog, sessions, audit và me/permissions contract | Bắt buộc bổ sung theo U-15; backend-first, không form/mock API giả |
| AI Assistant | Report job/event/cancel và model gateway nội bộ | Bắt buộc theo U-16/U-17; không fake response hoặc gọi cloud ngoài lựa chọn |
| Cấu hình hạ tầng CRUD | API riêng nếu sau này được yêu cầu | Chưa đưa vào phạm vi chỉ vì có Users |
| Ghép face–người–xe | Camera/lane/ROI, encounter correlation, freshness/quality, ambiguity policy | Không coi mặt lớn nhất là đúng người điều khiển |
| Edge RFID contract | Card UID đầu đọc thật, capture đồng bộ, bỏ slip dependency Gate Out bãi xe | Hiện có thể nhận 422 vì thiếu card_uid; chưa nghiệm thu automatic flow |
| Vehicle category chuẩn | Catalog/migration motorcycle/car/truck và mapping legacy/unknown | Không coi vehicle_type chuỗi là AI classification |
| Nhân viên đi bộ | Pedestrian API/log/policy riêng theo U-21 | Bắt buộc bổ sung; không giả ảnh biển số để vượt schema xe |
| Video action recognition | Persistent ingest/tracking/temporal evidence và review | Module mở rộng; không giả nhãn hành động từ ảnh đơn |

### 10.7. API Users/RBAC mới đề xuất - CHƯA TỒN TẠI

Các route dưới là hợp đồng mục tiêu cần triển khai backend và xuất OpenAPI trước khi frontend gọi. Không cộng chúng vào danh mục 44 HTTP operations hiện có. Prefix `/admin` là cách phân nhóm route, không thay kiểm tra permissions. Mỗi thao tác phải kiểm actor, target, version và payload allowlist.

| Method | Endpoint đề xuất | Permission | Contract chính |
| --- | --- | --- | --- |
| GET | `/api/v1/admin/users` | users:read | Search/status/role, cursor/limit, count hoặc coverage rõ |
| POST | `/api/v1/admin/users` | users:create + users:assign-role | Username chuẩn hóa, password ban đầu, một role_id; ADMIN cần thêm users:assign-admin và target policy |
| GET | `/api/v1/admin/users/{user_id}` | users:read | Profile, role, trạng thái/version; không password_hash hoặc token |
| PATCH | `/api/v1/admin/users/{user_id}` | users:update | Chỉ fields profile được phép và expected_version; không mass-assign quyền/password |
| PATCH | `/api/v1/admin/users/{user_id}/status` | users:set-status | is_active, reason, expected_version; kiểm admin cuối cùng |
| PUT | `/api/v1/admin/users/{user_id}/role` | users:assign-role | role_id, reason, expected_version; ADMIN assignment có guard riêng |
| POST | `/api/v1/admin/users/{user_id}/password-reset` | users:reset-password | Password tạm nhập qua form bảo vệ, force-change, revoke; response không trả lại mật khẩu |
| GET | `/api/v1/admin/users/{user_id}/sessions` | users:read-sessions | Metadata phiên đã redact, không access/refresh/session token |
| POST | `/api/v1/admin/users/{user_id}/sessions/revoke` | users:revoke-sessions | Thu hồi mọi phiên và WS, reason; không chỉ xóa cache UI |
| GET | `/api/v1/admin/roles` | roles:read | Danh sách system/custom roles, version và assigned-user count |
| POST | `/api/v1/admin/roles` | roles:create | Role tùy chỉnh; code unique do backend validate |
| GET | `/api/v1/admin/roles/{role_id}` | roles:read | Role metadata, permission codes, version |
| PATCH | `/api/v1/admin/roles/{role_id}` | roles:update | Name/description/status cho phép; system code bất biến, chặn deactivate ADMIN/role còn gán |
| PUT | `/api/v1/admin/roles/{role_id}/permissions` | roles:assign-permissions | Tập permission codes đầy đủ, reason, expected_version; transactional |
| DELETE | `/api/v1/admin/roles/{role_id}` | roles:delete | Archive custom role; chặn system role hoặc role còn được gán |
| GET | `/api/v1/admin/permissions` | permissions:read | Catalog backend, group/description/dependencies, không arbitrary CRUD |
| GET | `/api/v1/admin/audit-logs` | audit-logs:read | Actor/action/target/time/outcome filters, cursor; response đã redact |
| POST | `/api/v1/auth/change-password` | Principal hiện tại | Current/new password, server policy, revoke các phiên theo policy |

`GET /api/v1/auth/me` hiện có phải được mở rộng và version hóa contract khi chuyển RBAC: id, username, role_id/role_code, permissions hiệu lực, authz_version, must_change_password. `role: UserRole` cũ không thể âm thầm đổi thành một object rồi giữ frontend cũ; migration phải có adapter/deprecation rõ. JWT refresh/revocation và WS ticket cũng là API mới cần chốt contract, không giả đã có.

### 10.8. API Dashboard/Assistant mới đề xuất - CHƯA TỒN TẠI

| Method | Endpoint đề xuất | Quyền | Mục đích |
| --- | --- | --- | --- |
| GET | `/api/v1/analytics/dashboard` | dashboard:read + quyền từng domain | Aggregate theo from/to/timezone/granularity và filter được hỗ trợ |
| GET | `/api/v1/analytics/metric-definitions` | dashboard:read | Định nghĩa/đơn vị/formula/coverage/version và supported filters |
| POST | `/api/v1/assistant/reports` | assistant:use + reports:generate + domain | Tạo job báo cáo với prompt/template, kỳ và typed filters; nhận report_id/status |
| GET | `/api/v1/assistant/reports` | reports:read + quyền đối tượng | Lịch sử job được phép đọc, cursor/limit; không đọc mọi report của hệ thống |
| GET | `/api/v1/assistant/reports/{report_id}` | reports:read + owner/scope/domain | Trạng thái, kết quả cấu trúc, snapshot/citations và expiration |
| GET | `/api/v1/assistant/reports/{report_id}/events` | reports:read + owner/scope/domain | Tiến trình server thật, sequence và terminal event; stream có auth |
| POST | `/api/v1/assistant/reports/{report_id}/cancel` | Owner + reports:read + domain | Hủy job tại server; phase đầu không có quyền hủy hộ; không giả từ abort browser |
| GET | `/api/v1/assistant/reports/{report_id}/download` | reports:export + read/scope/domain | Tải artifact nếu job hoàn tất; kiểm quyền lại lúc tải |

Report phase đầu là cấu trúc text/JSON có citations; nếu xuất PDF phải có renderer kiểm soát và artifact lifecycle, không để model tạo HTML tùy ý. Request tạo job có idempotency key được backend hỗ trợ, giới hạn độ dài prompt/khoảng thời gian/concurrency/rate. Endpoint download chỉ khả dụng khi có artifact thật.

Event stream dùng fetch có bearer + AbortController, parse SSE framing hoặc định dạng streaming đã chốt; không gắn access token vào query string. Với phase đầu, ưu tiên stream stage/status; nội dung/số liệu báo cáo chỉ công bố sau schema và grounding validation cuối cùng. Các API mới phải tạo thật trước khi mở chức năng trên frontend, không nối UI vào mock service.

### 10.9. API nhân viên đi bộ/đa phương tiện mới đề xuất - CHƯA TỒN TẠI

| Method | Endpoint đề xuất | Permission | Contract chính |
| --- | --- | --- | --- |
| POST | `/api/v1/pedestrian-gates/entry/verifications` | access:verify-pedestrian-entry hoặc device scope mới | Multipart event_id, gate_id, card_uid, face_image; không yêu cầu biển số |
| POST | `/api/v1/pedestrian-gates/exit/verifications` | access:verify-pedestrian-exit hoặc device scope mới | Cùng cấu trúc, hướng EXIT, policy người đi bộ riêng |
| GET | `/api/v1/person-access-logs` | person-access-logs:read | Kỳ/hướng/person ID/cursor, principal scope; không bịa từ vehicle logs |
| GET | `/api/v1/person-access-logs/{access_log_id}/snapshots/{snapshot_index}` | person-evidence:read | Evidence có quyền, không public URL |
| GET | `/api/v1/vehicle-types` | vehicles:read | Catalog chuẩn motorcycle/car/truck và legacy mapping được backend công bố |
| GET | `/api/v1/employees` | employees:read | Registry nội bộ, search/status/cursor, person_id tham chiếu hồ sơ enrollment |
| POST | `/api/v1/employees` | employees:create | Liên kết person_id đã enrollment, employee_code unique, trạng thái; không sao chép embedding |
| GET | `/api/v1/employees/{employee_id}` | employees:read | Registry + identity refs có quyền; không raw biometric |
| PATCH | `/api/v1/employees/{employee_id}` | employees:update | Fields registry cho phép, expected_version; deactivate cưỡng chế thu hồi access |
| GET | `/api/v1/access-points` | access-points:read | Cổng/lối đi hợp lệ, mode/device binding; source cấu hình server có quản lý |
| GET | `/api/v1/pedestrian-access-grants` | pedestrian-grants:read | Quyền vật lý theo employee_id/lối đi/hướng/thời hạn/trạng thái |
| POST | `/api/v1/pedestrian-access-grants` | pedestrian-grants:create | employee_id, access_point_ids, directions, valid_from/valid_until và reason |
| DELETE | `/api/v1/pedestrian-access-grants/{grant_id}` | pedestrian-grants:revoke | Thu hồi có audit/version; không sửa permission User thay thế |

Hồ sơ enrollment hiện dùng Driver DTO qua adapter; registry Employee mới tham chiếu person_id này để giữ một identity/embedding. Nguồn registry giai đoạn đầu là nhân viên quản trị được cấp quyền nhập/cập nhật trong ứng dụng; HR sync chưa được chọn, không giả đã có. Registry có employee_id, person_id, employee_code unique, is_active, version và audit metadata. Driver không có registry hợp lệ không mặc nhiên là nhân viên nội bộ. Tạo hồ sơ cần enrollment thật rồi liên kết registry; UI không báo hoàn thành khi mới xong một bước, backend dùng idempotency/transaction/compensation phù hợp.

PedestrianAccessGrant là quyền ra/vào vật lý, tách khỏi role của tài khoản vận hành: employee_id, access_point_ids được backend quản lý, directions, valid_from/valid_until, status/version, reason và audit. Verify phải đồng thời có registry active, đúng chủ thẻ/face, grant active trong hiệu lực và đúng lối đi/hướng; thiếu grant thì từ chối. Deactivate nhân viên hoặc revoke grant có hiệu lực cho request tiếp theo và encounter chưa quyết định. Seed policy quản trị registry/grants: ADMIN quản lý, SECURITY đọc/vận hành đúng permission, WAREHOUSE chỉ đọc nếu được cấp; không tự nâng quyền từ Users/RBAC sang quyền qua lối đi.

PedestrianVerificationResponse phải phân biệt card/face/employee/access-policy verification, permit và device ACK nếu có thiết bị cửa/turnstile; actual crossing chỉ được ghi khi có tín hiệu tương ứng. Không nới lỏng plate_image để trộn pedestrian vào vehicle schema. Hai vehicle endpoints vẫn được mô tả đúng ở danh mục hiện có; contract mục tiêu cần extension/version rõ cho camera envelope, không tuyên bố metadata mới đã được enforce.

Capture envelope mục tiêu dùng schema_version và capture_bundle_id/encounter_id trỏ tới manifest server: access_mode, camera/lane/access_point IDs, frame refs/hash, captured_at/received_at và identity thiết bị đã xác thực. Áp dụng cùng nguyên tắc cho xe và người đi bộ; vehicle bundle có plate+face, pedestrian bundle không có plate. Manifest được camera ingestion/device gateway có auth ghi và backend kiểm nguồn, độ mới/max-skew và liên kết; timestamp/ROI/track metadata tùy ý từ browser không được coi là bằng chứng. API ingestion và verify versioned/extended phải được chốt trong M0; legacy/manual multipart chưa có metadata là capability gap và không được dùng để bypass policy camera nghiêm ngặt.

## 11. Authentication, Users và RBAC

### 11.1. JWT mục tiêu và migration

Login thật -> access JWT trong RAM auth service + refresh token cookie HttpOnly/Secure -> me/principal -> protected routes. Reload bootstrap refresh trước khi mở dữ liệu bảo vệ. Logout revoke server session, clear tokens/cache, cancel requests, đóng socket và modal nhạy cảm.

Lifetime đề xuất: access khoảng 5 phút; refresh khoảng 7 ngày kèm idle/absolute expiry, cần chốt trong proposal. Refresh có thể opaque, backend lưu hash/token family, rotation/reuse detection. [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14).

Backend kiểm chữ ký, algorithm allowlist, issuer/audience/expiry, session/token version, tài khoản và quyền. Auth signing keys/claims tách JWS phiếu xuất kho. Cookie refresh có scope phù hợp auth endpoints, CSRF/Origin protection; production ưu tiên cùng origin. Decode JWT ở browser không quyết định quyền. Memory token vẫn cần chống XSS.

### 11.2. Interceptor và concurrency

- Refresh chỉ khi token hết hạn/đủ điều kiện theo error contract; 403 không refresh.
- Single-flight trong tab; đa tab phối hợp rotation/logout, không broadcast raw tokens.
- Exclude login/refresh/logout khỏi loop; tối đa một replay, timeout có kiểm soát.
- Logout vô hiệu kết quả refresh/request đến muộn, không cho phiên tự phục hồi.
- Mutation chỉ replay khi contract xác nhận auth bị từ chối trước thực thi và an toàn. Không blanket retry gate/finalize/reissue khi timeout.
- Giữ event_id cho cùng sự kiện; server idempotency là hàng rào cuối.

### 11.3. Ma trận quyền hiện có

| Chức năng | ADMIN | WAREHOUSE | SECURITY |
| --- | --- | --- | --- |
| Driver/vehicle/authorization | CRUD | Đọc | Đọc |
| Thẻ nhân viên | Quản lý | Không | Không |
| Gate verification | Có | Không | Có |
| Logs/evidence | Đọc | Đọc | Đọc |
| Orders/dock/slip | Quản lý | Quản lý | Đọc |
| Alerts | Xem/xử lý | Không | Xem/xử lý |

Ma trận trên là baseline hiện tại để migration không vô tình tăng quyền. Trong RBAC mục tiêu, backend trả permissions hiệu lực qua principal contract; frontend dùng cùng `useAuthorization` ở routes/menu/actions thay cho tiếp tục suy quyền bằng role strings. Không đưa device API key vào browser. Các API mới của RBAC chưa tồn tại và được tách riêng ở mục 10.7.

### 11.4. Mô hình RBAC mục tiêu

```text
User -- một role_id hoạt động --> Role -- permission_codes --> Permission catalog
  |                               |
  +-- is_active/authz_version      +-- is_system/is_active/version
  +-- sessions                    +-- quyền được backend kiểm tra mỗi request
  +-------------------- Audit log đã redact ------------------------+
```

Đề xuất giai đoạn đầu: một role hoạt động cho mỗi user, phù hợp dữ liệu hiện tại; chưa có multi-role, role hierarchy, deny overrides hoặc quyền trực tiếp trên từng user. Tạo sẵn ba system roles ADMIN/WAREHOUSE/SECURITY với quyền tương đương hiện trạng; role tùy chỉnh dùng cùng catalog. Cardinality và custom-role policy là phương án thiết kế để review, không diễn giải thành yêu cầu chi tiết đã được người dùng xác nhận trước đó.

User/UserDocument chuyển từ role enum sang role_id có migration dữ liệu; không dùng role display name làm định danh. System role không xóa/đổi code; tập quyền quản trị cốt lõi của ADMIN được bảo vệ. Custom role không tự tạo permission code hoặc wildcard. Catalog do backend version hóa; thêm action mới phải có policy/seed/tests rõ, không mặc định mọi role được cấp.

Từ chối mặc định, kiểm quyền ở API/service trên từng request và tài nguyên. Quyền giao diện chỉ giúp UX. Device scopes tiếp tục độc lập operator RBAC. Các điều kiện state machine, idempotency và fail-closed vẫn áp dụng dù có permission. [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

### 11.5. Permission catalog và ma trận mặc định

| Nhóm | Permission codes cần định nghĩa tường minh |
| --- | --- |
| Users | users:read, users:create, users:update, users:set-status, users:assign-role, users:assign-admin, users:manage-admin, users:reset-password, users:read-sessions, users:revoke-sessions |
| Roles/catalog/audit | roles:read, roles:create, roles:update, roles:assign-permissions, roles:delete, permissions:read, audit-logs:read |
| Driver/vehicle | drivers:read/create/update/deactivate; vehicles:read/create/update/deactivate |
| Registry/quyền vật lý | employees:read/create/update, access-points:read, pedestrian-grants:read/create/revoke |
| Ủy quyền tài xế–xe | driver-vehicle-authorizations:read/create/revoke |
| Thẻ | employee-cards:read/issue/block/report-lost/replace |
| Gate/evidence | gates:verify-entry, gates:verify-exit, gate-logs:read, gate-evidence:read |
| Đi bộ/evidence | access:verify-pedestrian-entry, access:verify-pedestrian-exit, person-access-logs:read, person-evidence:read |
| Kho | orders:read/create/update/cancel; dock:read/start/capture/finalize; exit-slips:read/issue/reissue |
| Cảnh báo | alerts:read, alerts:update |
| Dashboard | dashboard:read, analytics:read-gates, analytics:read-people, analytics:read-warehouse, analytics:read-alerts |
| Assistant/report | assistant:use, reports:generate, reports:read, reports:export; quyền hủy job khác owner chỉ thêm khi có use case được duyệt |

Trong bảng, ký hiệu resource:read/create là cách rút gọn nhiều codes riêng; catalog thực tế phải liệt kê từng code hoàn chỉnh, không có wildcard. Quan hệ phụ thuộc như dock:finalize cần dock:read được validate ở backend; UI có thể gợi ý chọn kèm, không tự gửi quyền ngoài lựa chọn mà không thông báo.

| Quyền bổ sung mục tiêu | ADMIN | WAREHOUSE | SECURITY |
| --- | --- | --- | --- |
| Quản trị users/roles/catalog/audit | Có, với protected guards | Không | Không |
| Dashboard shell | Có | Có | Có |
| Analytics gate/kho | Theo quyền nguồn tương ứng | Theo quyền nguồn tương ứng | Theo quyền nguồn tương ứng |
| Đi bộ/analytics people | ADMIN theo policy seed | Đọc khi được cấp rõ; không mặc định được verify đi bộ | SECURITY verify và đọc theo policy seed |
| Analytics alerts | Có | Không | Có |
| Assistant/report | Dùng được với dữ liệu được phép | Dùng được với dữ liệu được phép | Dùng được với dữ liệu được phép |

Đây là seed policy đề xuất, không tự thay ma trận quyền hiện tại trước migration. assistant:use/dashboard:read không cho phép vượt quyền domain; muốn đọc/tóm tắt dữ liệu nào phải được cấp quyền nguồn và aggregate tương ứng. RBAC hiện chưa có site/tenant model, nên không tuyên bố cách ly theo chi nhánh nếu schema chưa hỗ trợ.

### 11.6. Luồng quản trị và chống tự nâng quyền

- UsersPage có list/search/status/role filters, tạo/sửa profile, gán một role, khóa/mở, reset password, xem/thu hồi phiên. Không public registration. User không hard-delete nếu có audit/nghiệp vụ liên quan.
- RolesPage có thông tin role và permission matrix theo resource/action; phân biệt system/custom. Permission catalog chỉ đọc, không có form tạo permission code tùy ý.
- Tạo/gán ADMIN phải có users:assign-admin và grantable-role policy ngay từ POST tạo user. Reset password/khóa/đổi thông tin hoặc role của tài khoản ADMIN cần users:manage-admin cùng target policy; custom-role user có users:reset-password thông thường không được chiếm tài khoản ADMIN. Các permissions bảo vệ này chỉ cấp cho ADMIN theo policy giai đoạn đầu, không được thêm vào custom role bằng matrix tùy ý.
- Sửa tập quyền quản trị phải có guard server riêng. Actor chỉ được cấp role/permissions nằm trong grantable policy; không tin permission list do browser/JWT tự khai.
- Chặn khóa/hạ quyền ADMIN hoạt động cuối cùng và không cho deactivate system ADMIN role. Chặn deactivate/archive role còn gán user, trừ một use case chuyển role transactional đã được thiết kế riêng; không để user trỏ tới role inactive. Kiểm tra bằng transaction/concurrency control, không count rồi update rời nhau.
- Dùng version/expected_version cho user/role; xung đột trả 409 và tải lại, không ghi đè quyền của người quản trị khác.
- PATCH profile không nhận role/password/is_active/permissions. Reset password là use case riêng; chưa có email provider thì không giả luồng gửi email. Admin nhập mật khẩu tạm qua form bảo vệ, user buộc đổi; response/log/audit không chứa secret.
- must_change_password phải được backend cưỡng chế: principal hạn chế chỉ được me/change-password/logout và refresh có scope hạn chế. Không gọi business API, report hoặc WS trước khi đổi thành công; không chỉ ẩn navigation ở frontend. Đổi thành công cấp phiên phù hợp và revoke credentials tạm theo policy.
- Modal role change hiển thị quyền sẽ thêm/bớt trước xác nhận; role editor có selection rõ và keyboard. Không optimistic hiển thị quyền đã áp dụng trước response backend.

### 11.7. Thu hồi quyền, session và audit

Backend kiểm principal/policy version trên từng request; không tiếp tục tin permission claims cũ đến hết TTL JWT. Thay role/permission, khóa user hoặc reset password cập nhật version và revoke theo policy. Policy version phải bền vững; nếu cache thì invalidation phủ mọi worker, không chỉ process xử lý thay đổi. Không xác minh được quyền thì fail-closed.

Với role permission change phải ảnh hưởng tất cả users của role, report jobs/cache và sockets liên quan. WS hiện tại chỉ check lúc mở nên cần revalidation, revoke signal và đóng kết nối khi mất quyền, trước khi gửi thêm dữ liệu bảo vệ. Report stream/download cũng kiểm quyền lại; output bị thu hồi không tiếp tục được tải bằng ID cũ. Frontend nhận revoke thì cancel requests, clear dữ liệu nhạy cảm, đóng modal và tải principal hoặc logout.

Audit mới là append-only: actor từ server principal, action, target, diff đã redact, server timestamp, request ID, outcome. Thay đổi nhạy cảm và audit thành công phải atomic; không ghi password/token/hash/raw prompt hoặc dữ liệu sinh trắc học. AuditLogsPage có quyền riêng; không cho ADMIN sửa lịch sử qua API CRUD.

### 11.8. Port, adapter và migration theo Clean Architecture

Domain bổ sung Role/Permission và policy invariant; application có UserManagement, RoleManagement, AuthorizationPolicy, SessionRevocation, Audit use cases. Port bổ sung repository users/roles/audit, permission resolver và revocation notification; adapter Mongo/WS implement, bootstrap inject. UI không import ORM hoặc tự tính policy có hiệu lực.

Migration seed ba role với codes ổn định, map user.role cũ -> role_id và kiểm tập quyền trước/sau không tăng quyền. Cập nhật tất cả require_roles, require_device_or_roles, ảnh/slip endpoints và WS sang quyền tương đương, giữ device scopes. Bootstrap không tự tạo lại/khôi phục admin đã bị quản trị thay đổi trái policy. Chỉ bỏ compatibility sau khi backend/frontend/clients đã chuyển contract.

## 12. Loading, AI output và xử lý lỗi

Với request-response hiện tại: idle -> validating -> uploading/sending -> waiting -> succeeded/failed/outcome_unknown. Upload progress chỉ đo truyền dữ liệu; không biến thành phần trăm AI. Không hiển thị các bước inference/security-check giả qua timer.

Nếu có progress API mới, event cần operation ID, sequence/event ID, stage, timestamp và terminal state. Stage theo pipeline ảnh/nghiệp vụ thật, không sao chép tên bước đọc tài liệu từ PDF.

| Tình huống | UX bắt buộc |
| --- | --- |
| Auth bootstrap | Chờ rõ, không nháy login/protected page sai |
| Initial load | Skeleton khớp bố cục, giữ shell |
| Refetch nền | Giữ dữ liệu, báo updating/stale khi cần |
| Submit | Pending tại form/nút, chống lặp, giữ input khi lỗi |
| Gate verification | Chờ kết quả, không opened trước ACK |
| Timeout mutation | Chưa xác định kết quả; reconcile trước retry |
| Schema sai | Chặn vùng lỗi, fallback cục bộ/request ID an toàn |
| Empty | Giải thích chưa có dữ liệu và action có quyền |
| Forbidden | Nêu thiếu quyền, không giả dữ liệu rỗng |
| Mất realtime | Offline/reconnecting/lần đồng bộ cuối |

Similarity, plate score và cargo confidence giữ đúng semantics DTO; không đổi thành xác suất hoặc tự tạo confidenceScore chung. Schema kiểm numeric finite, enum và cấu trúc thật. ObservationSummary/VerificationResult/CargoDetectionList tách observation, operator decision và permit; chỉ dùng renderer/action allowlist.

Error Boundary bọc page và vùng output rủi ro; lỗi API/async có handling riêng. Fallback trung tính, không lộ raw exception/provider/rule. Không tuyên bố “Đã chuyển xử lý thủ công” nếu chưa tạo task backend; hướng dẫn kiểm tra thủ công không tạo đường bypass barrier.

## 13. Realtime, cancellation và cleanup

Giữ WS cảnh báo hiện có và REST resync; không thay bằng SSE chỉ vì PDF có ví dụ SSE. Quản lý identity/role, reconnect backoff+jitter, ping/pong, bounded buffers và cleanup.

Tránh race snapshot/subscription bằng subscribe+buffer trước, tải REST, merge ID/sequence, phát hiện gap/resync; hoặc có cursor handshake backend. Resync lặp qua các batches đến khi theo kịp, không lấy một batch giới hạn rồi coi đầy đủ. Invalid event không crash shell.

Khi chuyển JWT, thiết kế API có bearer cấp ticket WS ngắn hạn dùng một lần; ticket cũng phải redact khỏi logs. Không đặt access/refresh token dài hạn trong URL. Socket cần expiry và phản ứng revoke/logout.

Assistant mới sẽ có event stream tiến trình qua API đề xuất ở mục 10.8. SSE phù hợp event một chiều; fetch stream phù hợp custom headers. Native EventSource không truyền arbitrary Authorization header như Axios, nên dùng authenticated fetch và parser framing cho report stream. Không giả `/api/ai/*` trong PDF là API Smart Gate. [MDN SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

Event stream Assistant cần UTF-8 incremental/frame parsing, memory bound và stale-request guards. Nếu bật text deltas ở giai đoạn sau, buffer khoảng 50-100 ms theo profiling, flush phần cuối và phân biệt draft/final; số liệu chỉ được công bố sau grounding validation. Live region announce theo stage/cụm, không từng token.

Cleanup controllers/readers/EventSource/socket/timers/buffers/media tracks/Blob URLs khi reset/unmount/logout. Browser abort dừng request/đọc stream, không bảo đảm server hủy hoặc dừng lệnh thiết bị. Không có nút Hủy mở cổng giả sau khi lệnh đã gửi. [MDN AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort).

## 14. Privacy và safe rendering

| Cấp theo policy dự án | Ví dụ | Hành vi |
| --- | --- | --- |
| Public | Hướng dẫn công khai | Hiển thị, vẫn escape |
| Internal | Checklist/quy trình nội bộ | Đúng quyền, không tự gửi cloud |
| Confidential | Hồ sơ/điện thoại/biển số/order gắn danh tính | Giảm hiển thị/log; mask khi cần; không persist browser |
| Restricted cho egress | Token/key/password/embedding/ảnh sinh trắc học gửi ra ngoài | Hard-block luồng cloud/AI ngoài policy |

Phân loại sinh trắc học ở đây là policy thiết kế egress, không là kết luận pháp lý. Password gửi auth backend và ảnh enrollment gửi API nội bộ có quyền vẫn là luồng hợp lệ. Không áp regex prompt guard lên mọi form và chặn nhầm nghiệp vụ.

Prompt của AI Assistant báo cáo nội bộ đã nằm trong scope U-16/U-17; cloud chưa được chọn. Restricted hard-block cả submit handler và server trước khi đưa vào model, không bypass bằng checkbox. Confidential được giảm thiểu/masking theo policy; ảnh mặt, embeddings, password và token không đưa vào report context. Regex không đủ phân loại toàn bộ dữ liệu. Self-hosted vẫn phải kiểm quyền, redact và xử lý prompt injection.

Text qua React là mặc định cho biển số/ghi chú/alerts/AI. Không eval hoặc dùng output thành JSX/action tùy ý. HTML nếu cần dùng sanitizer được duy trì như DOMPurify, allowlist và regression tests, kiểm tra dependency trước import. [OWASP XSS](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).

HTML slip không được chèn thẳng vào DOM ứng dụng; download hoặc viewer cách ly có policy. Ảnh/PDF/QR qua API có quyền, không public MinIO. Không persist tokens/raw evidence/biometrics/prompt/output/query cache nhạy cảm. Telemetry/log/test traces phải redact dữ liệu; preferences không nhạy cảm có thể persist.

## 15. Luồng nghiệp vụ, Dashboard thống kê và AI Assistant

Gate Control: chọn hướng -> RFID -> ảnh mặt/biển số -> validate -> API thật với event_id -> kết quả server. Chỉ “Đã mở cổng” khi verification_status=PASSED, permit_granted=true và barrier_status=OPENED. Timeout giữ event_id và đối chiếu trạng thái theo API có thật; thiếu lookup phải nêu giới hạn, không retry mù.

Luồng nhân viên đi bộ: RFID/encounter -> ảnh mặt mới -> xác minh đúng chủ thẻ + hồ sơ nhân viên hoạt động + quyền qua lối đi -> policy backend -> permit/device ACK nếu có. Không yêu cầu phương tiện, biển số hoặc warehouse order. Quyền đi bộ không tự suy ra từ driver–vehicle authorization, quyền vận hành User hoặc permission quản trị RBAC.

Nhật ký xác minh người/xe, ACK cửa/barrier và sự kiện thực sự qua cổng là ba loại bằng chứng khác nhau. Không suy ra chấm công, giờ làm hoặc hiện diện trong nhà máy chỉ từ một frame/verification; các chức năng đó cần access session/sensor và business rules riêng.

```text
Order PENDING
  -> backend kiểm đúng lượt Gate In + hiệu lực
  -> mở dock / LOADING
  -> capture thật, observation AI
  -> operator xem evidence + ghi chú
     ANOMALY -> REVIEW_REQUIRED
     LOADED  -> APPROVED / READY_FOR_EXIT
  -> phát hành phiếu / SLIP_ISSUED
```

FinalizeDockInput hiện chỉ cho LOADED/ANOMALY; UI không tạo lựa chọn khác. Cần capture và backend kiểm state. Reissue có confirmation hậu quả, hiển thị version server và invalidation artifact cũ.

Theo U-06, Gate Out bãi xe không chuyển order kho sang COMPLETED. Không tạo nút hoàn tất order tự chế; chỉ hiển thị COMPLETED khi backend thật trả về. Liên thông kho/Gate Out là thay đổi nghiệp vụ riêng trong tương lai.

A11Y: skip link, keyboard flow, focus-visible/restore, label/error association, live region có giới hạn; màu không là tín hiệu duy nhất. Alt text không chứa PII thừa; ảnh/QR responsive không làm mất ý nghĩa. Core task không phụ thuộc hover/motion.

### 15.1. Dashboard thống kê nghiệp vụ

Dashboard phải là module thống kê có API aggregate riêng; trang overview hiện tại và các REST list giới hạn chưa đáp ứng yêu cầu này. Aggregation chạy trên toàn bộ tập dữ liệu backend được phép, không cộng các items mà browser vừa tải.

| Metric mục tiêu | Định nghĩa và nguồn thật | Giới hạn phải hiển thị |
| --- | --- | --- |
| Lượt xác minh ENTRY/EXIT | Đếm GateLog theo direction và occurred_at, event_id duy nhất | Là lượt xác minh, chưa chứng minh xe thực sự đi qua |
| Tỷ lệ xác minh PASSED | PASSED / tổng PASSED+FAILED trong kỳ | Mẫu số 0 -> null; không gọi là AI accuracy |
| Barrier OPENED/FAILED/PENDING | Counts theo barrier_status | OPENED là ACK thiết bị, không phải sensor xác nhận xe qua |
| Nhóm nguyên nhân thất bại | Logs theo reason_codes, dedupe mỗi code trong log | Một log có nhiều reason; tổng nhóm có thể lớn hơn tổng logs |
| Orders tạo trong kỳ | Order.created_at nằm trong kỳ | Có ở entity/database, OrderOutput hiện chưa expose; aggregate backend phải đọc nguồn đúng |
| Orders theo trạng thái | Snapshot trạng thái hiện tại tại data_as_of | Không giả là snapshot cuối một kỳ quá khứ khi chưa có history |
| Dock ACTIVE/REVIEW_REQUIRED | Snapshot DockInspection hiện tại | REVIEW_REQUIRED không là completed |
| Thời gian duyệt dock | completed_at-created_at trên APPROVED có timestamps hợp lệ | Kèm sample_size/excluded_count; không tính session còn active |
| Orders có phiếu | slip_version > 0 tại snapshot | Không cộng slip_version thành số lần issue/reissue trong kỳ |
| Alerts phát sinh trong kỳ | Alert.occurred_at trong kỳ, theo severity/type | Tách với backlog hiện tại |
| Alerts còn tồn | OPEN/ACKNOWLEDGED tại data_as_of | Không gọi số tồn cuối kỳ quá khứ nếu thiếu event history |
| Thời gian đóng alert | resolved_at-occurred_at, tách RESOLVED/FALSE_POSITIVE | Hiện thiếu lịch sử ACK/reopen; không gọi MTTA/MTTR chuẩn |

Không có metric xe đang trong bãi bằng ENTRY trừ EXIT: thiếu parking session, baseline và sensor qua cổng. Không có ground truth để tính độ chính xác AI; similarity/confidence không thay accuracy. Gate Out bãi xe chưa hoàn tất order nên không dùng để tính throughput kho đã xuất.

GateLog chưa lưu gate_id/site_id; GateCommand có gate_id nhưng join chỉ các command sẽ bỏ những sự kiện bị từ chối trước barrier. Bộ lọc theo cổng/chi nhánh phải disabled hoặc báo chưa được hỗ trợ đến khi bổ sung schema/migration/backfill đầy đủ. Không tạo số liệu mỗi cổng bằng suy đoán.

GateLog.occurred_at hiện được ghi sau inference, completed_at gắn ACK; hiệu hai mốc không là latency AI/request end-to-end. Muốn latency cần telemetry received_at, verification_completed_at, command_sent_at, acknowledged_at, unit và sample size. Muốn lịch sử state/slip issuance cần event journal hoặc snapshot materialization; chưa có thì unavailable, không nội suy.

### 15.2. Contract thống kê, charts và responsive

Kỳ truy vấn dùng [from,to), mặc định timezone Asia/Bangkok, chuyển sang UTC khi query. Phân biệt event counts trong kỳ và snapshot hiện tại; ngày hôm nay là kỳ chưa đủ và phải có nhãn. So sánh kỳ trước cùng độ dài/phạm vi, mẫu số kỳ trước bằng 0 trả percent_change=null và hiển thị chênh lệch tuyệt đối khi hợp lệ.

DashboardMetricsResponse cần snapshot_id, generated_at, data_as_of, period, timezone, metric_definition_version, permissions/policy scope, coverage và warnings. Mỗi metric có metric_id, value number hoặc null, unit, status, unavailable_reason, sample_size/excluded_count khi có mẫu và source_ref. Không có quyền thì không trả giá trị, không thay bằng 0. Null/unknown khác với giá trị thực bằng 0.

snapshot_id của một report đại diện tập aggregate bất biến được tái dùng suốt job; không chỉ gắn một ID lên nhiều live queries khác thời điểm. Nếu không có snapshot nhất quán giữa các nguồn, ghi watermark/data_as_of riêng từng nguồn, đánh dấu partial và không tính tỷ lệ hoặc kết luận đòi hỏi cùng thời điểm. Citations tham chiếu snapshot đã đóng băng, không đổi theo lần refresh Dashboard kế tiếp.

DashboardFilters validate from/to/granularity và supported filters; không nhận arbitrary Mongo query. Query/cache keys gồm kỳ, filter chuẩn hóa, user/scope/authz_version; cache backend không chia sẻ chéo quyền. Cho phép drilldown bằng route helper có quyền và cùng kỳ; các list hiện chưa hỗ trợ date/cursor phải bổ sung backend trước khi bật drilldown đó.

Bố cục dùng AppShell + PageHeader + PeriodFilterBar + MetricStrip + TrendPanel + BreakdownPanel + ContextPanel. Shared ChartPanel/MetricCard/DataTable dùng cùng CSS tokens; bảng text tương đương charts cho keyboard/screen reader. Không thêm một style chart riêng theo mỗi trang.

Dashboard có skeleton đúng hình, per-panel error/partial/unavailable, giữ dữ liệu khi refetch, nhãn cập nhật cuối và action tải lại. Realtime chỉ invalidate/refetch có giới hạn, không mỗi event gọi lại mọi aggregation. Mobile xếp một cột; bảng/charts có vùng co/scroll phù hợp, legend không tràn. Mọi cards/series phải gắn definition/source và unit rõ, không metric demo.

### 15.3. AI Assistant báo cáo nhanh, ưu tiên self-hosted

Người dùng đã chọn ưu tiên model nội bộ/self-hosted. Browser chỉ gọi FastAPI; server gọi model gateway trong mạng nội bộ. Model/version/hardware còn cần benchmark với tiếng Việt, độ trễ và tài nguyên triển khai; báo cáo không tự chọn hoặc tải model nặng. Provider port độc lập để thay adapter, không tự fallback cloud khi model nội bộ lỗi.

```text
Prompt/template + kỳ + filters
  -> xác thực / RBAC / privacy / validate intent
  -> report job bền vững và scope snapshot
  -> tool allowlist -> AnalyticsQueryService tính số liệu thật
  -> context aggregate tối thiểu + metric/source references
  -> ModelGateway self-hosted diễn giải
  -> schema + grounding/numeric/citation validation
  -> kết quả có nguồn, hạn chế và gợi ý kiểm tra
```

Các mẫu báo cáo nhanh: tổng hợp lượt xác minh trong ngày; order/dock cần theo dõi; cảnh báo chưa xử lý; so sánh hai kỳ có cùng phạm vi. Mẫu hiện theo quyền của user. Nếu chưa có cấu hình ca làm việc thì không gọi một kỳ tự suy đoán là ca vận hành.

Assistant chỉ đọc và đề xuất kiểm tra: không mở barrier, sửa order, approve dock, khóa user, cấp quyền hoặc gửi dữ liệu ra ngoài. Tool allowlist như read_gate_metrics/read_warehouse_metrics/read_alert_metrics được backend triển khai có schema; model không được gửi arbitrary SQL/Mongo/URL hoặc tự tạo tool executable từ output.

Tổng/tỷ lệ/so sánh được code backend tính; model diễn đạt và nhận diện mẫu có bằng chứng. GroundedReportResult gồm title, summary, findings, metric_refs, limitations, suggested_checks, snapshot_id, data_as_of và model/version. Mọi con số gắn metric_id/source_ref; link drilldown do server/route allowlist dựng. Không đủ dữ liệu thì nêu rõ; suy luận nguyên nhân phải ghi là giả thuyết, không khẳng định nhân quả từ tương quan.

Nếu output sai schema, bịa số, citation không có trong snapshot hoặc tham chiếu domain không có quyền, chặn final report và trả lỗi/fallback trung tính. Có thể cung cấp bản tổng hợp bằng template từ số liệu thật với nhãn “Tổng hợp dữ liệu”, không giả nó là câu trả lời AI. Lỗi provider không làm mất Dashboard dữ liệu thật.

### 15.4. RBAC, privacy và vòng đời Assistant

assistant:use/reports:generate chỉ là cửa vào. Mỗi tool/aggregation phải có đủ cả quyền đọc nguồn và quyền aggregate: gate cần gate-logs:read cùng analytics:read-gates; kho cần orders:read/dock:read theo metric cùng analytics:read-warehouse; cảnh báo cần alerts:read cùng analytics:read-alerts. Thiếu bất kỳ quyền cần thiết nào đều từ chối, không cho hỏi vòng hoặc totals chứa phần bị ẩn. Kiểm quyền khi tạo/read/events/reconnect/download; biết report_id không đủ truy cập. Phase đầu report chỉ owner được đọc/hủy theo domain permissions, không có ADMIN read-all/cancel-any ngầm định; mở rộng quản trị report người khác cần permission/policy riêng về sau.

Thống kê nhân viên đi bộ còn cần person-access-logs:read cùng analytics:read-people; các prompt về nhân viên không được đọc hồ sơ face/PII chỉ vì có quyền aggregate. Warehouse permissions chỉ bật theo module; Assistant vẫn dùng được dữ liệu ra/vào cốt lõi khi module kho chưa triển khai.

Chỉ đưa aggregates cần thiết vào context. Không gửi raw alert.data, cargo_metadata, operator notes, ảnh mặt, embeddings, phone, biển số hoặc card UID theo mặc định. Nội dung nhập có token/password/secret bị hard-block trước model. Prompt và source text là dữ liệu không tin cậy, không được nâng thành instruction hoặc mở quyền tool. Self-hosted không loại bỏ prompt injection hoặc rò dữ liệu qua output. [OWASP Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html).

Report job lưu trong backend có owner, scope/authz_version, requested filters, metric_definition_version, snapshot/source refs, model version, status, expiry và audit metadata. Cần worker/bounded executor tách khỏi API event loop, atomic claim/lease, deadline, concurrency limit và recovery policy khi worker chết. Lưu prompt/output theo retention và quyền đã chốt, mã hóa phù hợp; không lưu raw prompt trong logs/audit hoặc localStorage/Redux persist. Expiry được enforce ở read/events/reconnect/download; job hết hạn không trả lại nội dung từ cache/artifact. Purge prompt/context/snapshot/artifact theo retention có kiểm tra, chỉ giữ audit metadata đã redact đúng policy.

Trạng thái server đề xuất: QUEUED -> RUNNING -> VALIDATING -> COMPLETED; có FAILED/CANCEL_REQUESTED/CANCELED. Chỉ nhận COMPLETED khi output đã được validate. Cancel endpoint gửi yêu cầu hủy, worker xác nhận và dừng inference khi adapter hỗ trợ; nếu completion thắng race thì trả COMPLETED, không giả CANCELED. Mất kết nối chỉ dừng theo dõi; GET status/sequence cho phép resume. Thu hồi quyền chặn job/read/download và dừng phát dữ liệu bảo vệ.

AssistantPage dùng WorkspaceLayout, PeriodFilterBar, PromptComposer, ProgressTimeline, ReportResult, SourceReferences và ReportHistory. Không tự mở modal trên mỗi trang hoặc từng token. Nút tạo báo cáo có loading/disabled; có dừng theo dõi, yêu cầu hủy, retry tường minh và xem lại report có quyền. Progress là sự kiện worker thật, không phần trăm/chặng xử lý giả, không stream chain-of-thought. Kết quả text/JSON an toàn; export có quyền và renderer kiểm soát.

### 15.5. Camera và face verification cho mọi phương tiện

| Nhóm | Evidence bắt buộc mục tiêu | Trường hợp phải xử lý |
| --- | --- | --- |
| Nhân viên đi bộ | Face mới + thẻ + hồ sơ/quyền đi bộ | Nhiều người, người theo sau, face ngoài ROI, thiếu/che mặt |
| Xe máy | Face người điều khiển + thẻ + biển số cùng encounter | Mũ/kính che, người ngồi sau, góc biển số khác camera mặt |
| Ô tô | Face người điều khiển + thẻ + biển số cùng encounter | Kính/chói/tối, mặt hành khách gần camera hơn, không thấy mặt lái |
| Xe tải | Face người điều khiển + thẻ + biển số cùng encounter | Cabin cao, góc camera, phản xạ kính, nhiều người quanh xe |

Nhận diện mặt cho mọi nhóm là yêu cầu xác minh, không cam kết đạt nhận diện trong mọi điều kiện hình ảnh. Không có nhánh cho phép bỏ face chỉ vì loại xe. Không thấy mặt/mờ/nhiều mặt chưa gắn đúng người hoặc ảnh không cùng sự kiện -> không đủ bằng chứng/verification thất bại, fail-closed và yêu cầu chụp lại theo quy trình. Request bị từ chối sớm vì thẻ không hợp lệ không được hiển thị như đã face-verified.

Hiện backend thực hiện face 1:1 so với chủ thẻ, không nhận diện danh tính 1:N tất cả người xuất hiện trong video. Người đi cùng/hành khách là phạm vi khác với người điều khiển; không tự khẳng định đã kiểm soát toàn bộ người ngồi trong xe. Nếu cần kiểm từng người đi cùng phải có occupancy/person list và policy riêng.

SFace hiện chọn mặt có diện tích lớn nhất; chưa chứng minh đó là người điều khiển. Thiết kế cần camera/lane/ROI, timestamps, freshness/max-skew, nguồn plate/face/RFID và encounter_id để ghép đúng người–xe–thẻ; nhiều candidates không được tùy ý chọn lớn nhất rồi cấp phép. Vehicle_type hiện lấy từ hồ sơ khớp biển số, không phải kết quả AI phân loại. Chuẩn hóa motorcycle/car/truck với mapping giá trị cũ như sedan; unknown phải rõ coverage và không tự nâng thành nhóm hợp lệ khi cấp phép.

Edge hiện tạo event_id mới mỗi interval, đọc snapshot/RTSP một frame và chưa gửi card_uid bắt buộc. Đây là gap tích hợp có thể gây 422 và nhiều lần xác minh cùng một lượt; còn slip_image của luồng exit kho cũ. Trước nghiệm thu camera tự động phải sửa contract với đầu đọc thẻ thật, trigger/presence/encounter, debounce/idempotency và đồng bộ ảnh; không đếm vòng lặp 5 giây thành lượt người/xe đã qua cổng. Camera preview ở browser cũng chưa là video inference liên tục.

### 15.6. Thống kê nhân viên và phân nhóm phương tiện

Dashboard ưu tiên lượt xác minh nhân viên đi bộ và phương tiện theo ENTRY/EXIT, kết quả face/card/authorization, trạng thái cửa/barrier và cảnh báo. Nhóm vehicle_type phải là motorcycle/car/truck/unknown theo dữ liệu chuẩn hóa; records chưa khớp xe không được đoán loại. Có sample/coverage cho các subgroup, không kết luận accuracy từ tỷ lệ PASSED.

Số nhân viên có xác minh dùng distinct person/driver ID với phạm vi thời gian rõ và registry loại nhân viên; không mặc định Driver là nhân viên và không suy ra số người thực sự hiện diện. Không cộng employee/pedestrian count với vehicle count để thành tổng người vì có thể đếm trùng. Khi thiếu actual crossing/session, chỉ dùng nhãn lượt xác minh. Kho metrics và hành vi theo video chỉ bật khi module/source tương ứng có dữ liệu thật và có quyền.

### 15.7. Kho bãi và nhận diện hành động là module mở rộng

Thiết kế kho/order/dock/slip đã có được giữ lại nhưng triển khai theo extension, không ép mọi nhân viên/xe máy/ô tô phải có order kho. Cargo object detection hiện tại nhận person/car/motorcycle/truck trên ảnh không đồng nghĩa đã nhận diện hành động hoặc quan hệ người–xe theo thời gian.

```text
Camera stream + RFID/presence trigger
  -> timestamp/frame buffer theo lane
  -> vehicle/person detection + tracking
  -> ghép encounter và evidence người–xe–thẻ–biển số
  -> temporal observation / rule hoặc model hành động
  -> policy backend + operator review
  -> alert/report; command chỉ qua use case được kiểm soát
```

Các tình huống nghiên cứu mở rộng: dừng quá lâu, đổi hướng/đi ngược làn, nhiều người/xe trong một lượt, bám đuôi qua cổng hoặc đi vào vùng hạn chế. Đây là hành vi quan sát được theo cảnh, không là kết luận về ý định/tính cách hoặc vi phạm đã được xác nhận. Không đưa suy đoán thành quyết định tự động mở barrier, kỷ luật nhân viên hoặc bỏ qua xác minh.

Contract tương lai cần encounter_id/camera_id/lane_id, track_id có phạm vi phiên, start/end timestamps, observation type, confidence, model/version, evidence clip refs, quality và review status. Track ID không phải danh tính. Cần persistent video ingest, tracking/temporal window, calibration ROI/zones, storage/retention, replay đánh giá và latency budget; các thành phần này chưa có ở snapshot adapter hiện tại. ActionObservationGateway là port riêng với ModelGateway báo cáo LLM; Assistant chỉ tóm tắt observations có nguồn đã được phép đọc, không tự suy diễn hành động từ bảng số liệu.

## 16. DoD, negative tests và nghiệm thu

Tất cả dòng dưới là mục tiêu kiểm thử CHƯA NGHIỆM THU; áp dụng không có nghĩa đã đạt.

### 16.1. Tám DoD của PDF, trang 44

| ID | Áp dụng | Evidence cần có |
| --- | --- | --- |
| DOD-FE-AI-01 | Observation/operator decision/barrier result tách bạch | Component/E2E nhãn và quyền |
| DOD-FE-AI-02 | Confirm + disabled/pending cho action rủi ro | Keyboard/double-submit/server rejection |
| DOD-FE-AI-03 | Loading theo thông tin thật | State matrix gate/dock và report worker events thật |
| DOD-FE-AI-04 | Schema guard + boundary | Thiếu field/sai enum/render crash |
| DOD-FE-AI-05 | Cleanup WS và Assistant event stream | Unmount/logout/reconnect không leak |
| DOD-FE-AI-06 | Abort client đúng nghĩa; server report cancel theo contract | Abort/reconcile/cancel-completion race |
| DOD-FE-AI-07 | Privacy/egress và prompt guard Assistant nội bộ | Storage/telemetry/Restricted/masking checks |
| DOD-FE-AI-08 | Keyboard/live region/status/alert | Automated checks + manual A11Y |

### 16.2. Tám negative tests của PDF, trang 47-48

| Case | Ánh xạ Smart Gate | Phạm vi |
| --- | --- | --- |
| FE-NEG-01 | Script trong alert/ghi chú không thực thi | Bắt buộc |
| FE-NEG-02 | Img/onerror không tạo executable DOM | Bắt buộc |
| FE-NEG-03 | Password trong prompt Assistant bị hard-block | Bắt buộc; không áp nhầm login |
| FE-NEG-04 | Restricted/card data trong prompt bị chặn trước model | Bắt buộc cho Assistant nội bộ |
| FE-NEG-05 | Dừng theo dõi stream khác hủy report job; server xác nhận CANCELED | Bắt buộc khi triển khai job/event API |
| FE-NEG-06 | WS disconnect -> state/resync, không crash | Tương đương SSE demo |
| FE-NEG-07 | Thiếu field Verification/Dock DTO -> fallback | Schema thật, không confidenceScore giả |
| FE-NEG-08 | Unmount/logout cleanup, response cũ không ghi lại | Bắt buộc |

### 16.3. Test bổ sung theo yêu cầu dự án

| Nhóm | Kiểm tra |
| --- | --- |
| Contracts/types | Đúng method/path/query/body/multipart/bytes; nullable/enum/mapper không bù giả |
| Auth | Refresh concurrency/multi-tab/revoke/logout pending; không loop 401 |
| Authorization | Baseline A/W/S, custom role và deny-by-default cả UI/API/ảnh/WS/report |
| Users/RBAC | CRUD, mass assignment, unknown permission, version conflict, last-admin race, deactivate assigned role, protected ADMIN reset/create, forced-password direct API denial, migration không tăng quyền |
| Revoke/audit | Khóa/reset/đổi quyền ảnh hưởng JWT/WS/jobs, mọi worker/cache; audit redact và atomic |
| Modal/toast | Render props context, focus/dirty/pending; dedupe, không spam/callback stale |
| Layout/sidebar | Expand/collapse/drawer, active route, shell không reset |
| Routes/barrels | Lazy entry đúng, alias nhất quán, không circular/eager all-pages |
| Responsive | Mọi page/state ở mục 7.3, gồm kho/slip/camera/modal |
| Gate | Không opened trước ACK, timeout unknown, event_id giữ nguyên |
| Nhân viên/đa phương tiện | Nhân viên không tự là User; motorcycle/car/truck đều cần face, đúng người–xe–thẻ, không tự nhận diện 1:N |
| Người đi bộ | API không cần plate, policy employee/access riêng, logs/evidence có quyền, không giả vehicle data |
| Registry/grants | Onboarding thật, employee_code unique, enrollment link, grant theo lối đi/hướng/hiệu lực, revoke/deactivate fail-closed và audit |
| Camera/edge | Card UID thật, encounter/debounce/freshness, không mặt/multiple faces/che mặt/sai xe, contract client không 422 thiếu field |
| Capture trust | Envelope version, device binding, server manifest, replay/skew/forged timestamps và legacy downgrade không bypass |
| Warehouse | Gate In prerequisite, capture required, LOADED/ANOMALY, reissue conflict |
| Analytics | Aggregate đúng toàn tập có quyền, [from,to)/timezone, zero/null/partial, snapshot khác event flow, không fake occupancy/accuracy |
| Assistant | Model nội bộ thật, không cloud fallback, mọi con số có nguồn; reject hallucination/citation giả/output sai schema |
| Assistant access | Prompt injection/direct report ID/cross-user/cache không bypass domain RBAC; revoke khi đang stream/download |
| Report lifecycle | Idempotency, worker timeout/lease/recovery, cancel race, expiry/retention và lỗi provider có fallback trung thực |
| Module mở rộng | Kho/action không bắt buộc cho core; feature flag có server policy, temporal evidence không giả từ ảnh đơn |
| Realtime | Duplicate/out-of-order/gap/schema lỗi, nhiều batch resync |
| Privacy/runtime | Không token/evidence trong storage/log; không fixtures/mock runtime |

Fixtures/payload lỗi chỉ ở unit/component tests cô lập. Integration/E2E gọi FastAPI thật với database/storage test riêng; không dùng dữ liệu sinh trắc học thật hoặc seed production. Không có mock mode cho UI vận hành.

PR evidence cần typecheck/lint/build/test reports, API integration evidence, screenshots theo viewport, keyboard/modal video và negative cases. Chỉ ghi đạt khi có kết quả chạy, không đánh dấu từ thiết kế.

Nghiệm thu camera phải có ca kiểm thử riêng cho đi bộ/xe máy/ô tô/xe tải với góc camera và điều kiện ảnh thực tế, che mặt, nhiều người và replay/stale frames. Không suy ra coverage mọi loại xe từ test sedan/truck hoặc simulator. Kho/action có bộ test extension riêng khi triển khai, không biến chúng thành điều kiện bắt buộc để phát hành phần ra/vào cốt lõi.

## 17. Migration, rủi ro và điểm còn mở

### 17.1. Lộ trình đề xuất

| Mốc | Kết quả | Điều kiện |
| --- | --- | --- |
| M0 Contract | Live OpenAPI, employee mapping, pedestrian/vehicle contracts, Users/RBAC/analytics/reports mới | Phân biệt API hiện có và API mới; xác nhận ba loại xe + người đi bộ |
| M1 Auth/RBAC backend | JWT/refresh/revoke, users/roles/catalog/audit, me contract, WS authorization | Migration một role/user, không tăng quyền; kiểm last-admin/revoke/concurrency |
| M2 UI Foundation | Package, CSS/tokens, layouts/sidebar, modal/toast, routes/barrels và permission hooks | Design + responsive review |
| M3 Core access integration | Users/Roles UI, nhân viên/thẻ, người đi bộ và ba nhóm xe; edge/camera contract thật | Face mọi nhóm, RFID/plate theo mode, encounter/idempotency; không mock |
| M4 Dashboard | Aggregate ra/vào nhân viên/xe, metric definitions/charts/drilldown có quyền | Metrics có nguồn, coverage/timezone/null đúng; không giả occupancy/chấm công |
| M5 AI Assistant | Local ModelGateway, report jobs/worker/events/cancel, grounding/export có quyền | Benchmark tiếng Việt, model nội bộ thật, privacy và chống prompt injection |
| M6 Core release | A11Y/responsive/negative/E2E/rollback phạm vi ra/vào + RBAC/Dashboard/Assistant | Evidence đầy đủ, không phụ thuộc module kho chưa triển khai |
| E1 Kho mở rộng | Orders/dock/slip và báo cáo kho theo API thật | Bật module riêng; chưa liên thông Gate Out/order nếu chưa có change mới |
| E2 Video/action mở rộng | Tracking/temporal observations, review, alert và thống kê hành vi | Video pipeline/evidence/benchmark có thật; không cấp lệnh trực tiếp từ AI |

Thứ tự trên ưu tiên backend JWT/RBAC trước màn hình quản trị, pedestrian/camera trước nghiệm thu core và analytics trước Assistant. Kho/hành động được giữ trong roadmap extension để không làm loãng nghiệp vụ nhân viên/đa phương tiện. UI/session cũ chỉ phục vụ smoke/compatibility có thời hạn, không thay tiêu chí JWT/RBAC. Mỗi mốc đi theo domain -> application -> infrastructure -> presentation -> bootstrap -> tests theo schema intent-driven.

Dev dùng Vite proxy `/api`, `/ws`, `/health`. Production Node build stage tạo assets, FastAPI/reverse proxy phục vụ cùng origin, không cần Node runtime riêng cho SPA. Base/basename/assets/fallback phải cùng `/console`; không fallback `/api`, `/ws`, `/health`, `/docs` thành HTML. Cache hashed assets phù hợp và HTML không giữ bootstrap cũ sai lâu dài. Migration giữ UI cũ để rollback, hỗ trợ session cũ có thời hạn rõ và không bỏ CSRF ngoài kế hoạch.

### 17.2. Rủi ro và biện pháp dự kiến

| Rủi ro | Biện pháp |
| --- | --- |
| BRD khác Gate Out router | Bám code + U-06; ghi quyết định riêng nếu nối kho |
| Thiết kế thiên xe tải/kho, bỏ xe máy/người đi bộ | Ma trận access modes, employee mapping, core/extension rõ |
| Ghép sai mặt người ngồi sau/hành khách với xe | ROI/encounter/freshness/ambiguity, fail-closed, test mọi nhóm |
| Edge client thiếu card_uid hoặc loop nhiều event | Sửa contract/trigger/debounce/idempotency trước nghiệm thu automatic access |
| Frontend JWT nhưng backend session | Contract-first; auth/ảnh/WS migration rõ |
| UI RBAC nhưng backend vẫn kiểm enum role cứng | Migrate toàn bộ entry points, principal contract và test tập quyền trước/sau |
| Còn session/WS/report dùng quyền cũ | Version bền vững, revoke/invalidation mọi worker, revalidate stream/download |
| CSS/Tailwind lệch theme | Tokens chung, shared variants, review override |
| Callback/render props vào Redux | Provider/controller và typed lifecycle |
| Hook quá lớn/barrel vòng | Feature ownership/public API nhỏ/dependency lint |
| Progress/optimistic giả side effect | Chỉ event/response thật, reconciliation |
| Metrics coi list limit là toàn bộ | Coverage labels và aggregation API khi cần |
| Assistant bịa số hoặc lộ dữ liệu trái quyền | Aggregate trước model, scope snapshot, citations/numeric validation và safe tool allowlist |
| Self-hosted quá tải/không đủ model resources | Worker bounded, deadline, benchmark và fallback template có nhãn từ dữ liệu thật |
| Báo cáo lịch sử dùng trạng thái hiện tại | Tách flow/snapshot; thiếu journal thì unavailable, không nội suy |
| Race/gap WS | Buffer/dedupe/sequence/multi-batch resync |
| Motion làm nhảy bảng/focus | Shell ổn định, transform/opacity, reduced motion |
| Copy nguyên code đào tạo | Review security/A11Y/cleanup theo mục 3.1 |

### 17.3. Điểm cần chốt trước phần triển khai phụ thuộc

- Chốt chi tiết một role/user, system/custom role policy và protected ADMIN guards theo phương án đề xuất; không tự mở multi-role/hierarchy.
- Chi tiết registry nhân viên/người điều khiển ngoài và policy người đi bộ; giữ face 1:1/chủ thẻ ban đầu, face-first 1:N nếu muốn là quyết định riêng.
- Camera/lane/ROI, đầu đọc thẻ, actual crossing sensor và điều kiện nghiệm thu cho đi bộ/xe máy/ô tô/xe tải; không hỏi lại việc có bao gồm các nhóm này.
- Lifetime/revocation, multi-tab rotation, cache invalidation và report retention/expiry.
- Model/runtime/hardware self-hosted và benchmark tiếng Việt; không cần hỏi lại lựa chọn nội bộ/cloud.
- Thứ tự bổ sung telemetry/event journal cho các KPI chưa có dữ liệu; core aggregation và report cancellation đã nằm trong phạm vi thiết kế.
- Pagination/drilldown mới và report artifact/export format cần contract cụ thể.
- Theme/sidebar defaults và screenshot baseline review.

Không hỏi lại những phạm vi đã chốt mục 1. Các điểm mở không chặn báo cáo này, nhưng chưa được coi là quyết định đã duyệt.

### 17.4. OpenSpec

Đây là tài liệu explore người dùng đã yêu cầu ghi lại, chưa là proposal/change/ADR chính thức. Khi chuyển propose dùng schema intent-driven, liên kết nội dung với proposal/specs/design/tasks; ADR chỉ cho quyết định có ý nghĩa kiến trúc. Các checkpoint của [Git discipline](../.claude/skills/openspec-git-discipline/SKILL.md) áp dụng khi vào lifecycle tương ứng; không tự commit/branch/merge. Không thay code ứng dụng, schema hoặc tasks trong lượt này.

## 18. Nguồn tham chiếu

### 18.1. Nguồn chuẩn trong repo

- [PDF AI-First UX v2](Bo_Tai_Lieu_4_ReactJS_AI_First_UX_OJT_2026_v2.pdf): đã đọc 48 trang; các số trang trong báo cáo là trang vật lý PDF.
- SHA-256 PDF: `D4F0ADBEE34A13D5273DDC40233D02F5B31C50DE029848BE51FA693B2A556F09`.
- [opsx-explore](../.claude/commands/opsx-explore.md), [AGENTS](../AGENTS.md), [OpenSpec config](../openspec/config.yaml).
- [design-taste-frontend-v1](../.claude/skills/design-taste-frontend-v1/SKILL.md): UI/motion/responsive; yêu cầu CSS mới của người dùng được ưu tiên.
- [BRD](BRD.md), [OpenAPI](openapi.json), [schemas](../src/smart_gate/presentation/schemas.py), [DTO](../src/smart_gate/application/dto.py).
- Routers: [auth](../src/smart_gate/presentation/routers/auth.py), [master data](../src/smart_gate/presentation/routers/master_data.py), [cards](../src/smart_gate/presentation/routers/employee_cards.py), [gates](../src/smart_gate/presentation/routers/gates.py), [logs](../src/smart_gate/presentation/routers/gate_logs.py), [warehouse](../src/smart_gate/presentation/routers/warehouse.py), [security](../src/smart_gate/presentation/routers/security.py), [health](../src/smart_gate/presentation/routers/health.py).
- Camera/vision: [edge client](../src/edge_agent/client.py), [edge main](../src/edge_agent/main.py), [capture](../src/edge_agent/capture.py), [face adapter](../src/smart_gate/infrastructure/vision/face.py), [cargo detector](../src/smart_gate/infrastructure/vision/cargo.py).

### 18.2. Nguồn kỹ thuật chính thức

- [React versions](https://react.dev/versions), [Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary), [Vite releases](https://vite.dev/releases).
- [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state), [RTK Query](https://redux.js.org/toolkit/rtk-query/overview), [Axios interceptors](https://axios-http.com/docs/interceptors), [React Router](https://reactrouter.com/start/modes).
- [Tailwind theme](https://tailwindcss.com/docs/theme), [responsive](https://tailwindcss.com/docs/responsive-design), [custom styles](https://tailwindcss.com/docs/adding-custom-styles), [React Bits](https://reactbits.dev/get-started/introduction).
- [WAI-ARIA Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [WCAG Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [MDN SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), [MDN AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort).
- [OWASP XSS](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html), [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14).
- [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [OWASP LLM Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html).

## 19. Bàn giao riêng cho team backend

### 19.1. Mục tiêu và ranh giới bàn giao

Backend cung cấp API thật cho React quản lý nhân viên đi bộ, xe máy, ô tô và xe tải ra/vào; xác minh khuôn mặt ở mọi luồng; Users/RBAC, Dashboard và AI Assistant self-hosted. Hồ sơ nhân viên là đối tượng ra/vào, User là tài khoản vận hành; quyền đi qua lối/cổng là policy nghiệp vụ riêng với quyền sử dụng ứng dụng.

Tại thời điểm khảo sát có **44 HTTP operations và 1 WebSocket** ở mục 10.2–10.4. Các bảng 10.7–10.9 mô tả **API mới đề xuất, chưa được triển khai**; JWT refresh/revoke và WS ticket cũng cần contract mới. Team backend chốt tên/path/schema trong OpenAPI trước khi frontend tạo client/types. Bản bàn giao này là kết quả explore, chưa phải xác nhận API đã hoạt động hay proposal được duyệt.

### 19.2. Các gói việc và thứ tự phụ thuộc

| Gói | Ưu tiên | Backend cần thực hiện | Kết quả để frontend tích hợp |
| --- | --- | --- | --- |
| BE-01 Contract | P0, bắt đầu trước | Xuất OpenAPI khớp router/schema chạy thật; phân biệt API giữ nguyên, sửa và mới; chốt pagination/filter/search, enum/nullability, multipart/ảnh/file, lỗi và quyền từng operation | OpenAPI có version, permission matrix, hướng dẫn migration; danh mục API mục 10 được đối chiếu |
| BE-02 JWT và phiên | P0, sau contract auth | Access JWT ngắn hạn; refresh cookie HttpOnly/Secure, CSRF/Origin protection, rotation/reuse detection; logout/revoke, password change/reset; mở rộng me; WS ticket và kiểm tra quyền trong suốt kết nối | Auth/principal contract; policy lifetime/rotation; luồng hết hạn/thu hồi có thể kiểm thử từ browser |
| BE-03 Users/RBAC | P0, cùng nền tảng auth | API users/roles/permission catalog/sessions/audit theo mục 10.7; migration một role/user, system/custom roles; chặn tự nâng quyền/mass assignment, bảo vệ ADMIN cuối cùng và cưỡng chế đổi mật khẩu ở server | Permissions hiệu lực + authz_version; revoke/invalidation xuyên worker, JWT, WS, report và cache; audit đã redact |
| BE-04 Nhân viên và các luồng ra/vào | P0, dùng principal/policy đã chốt | Registry nhân viên liên kết enrollment hiện có; phân biệt nhân viên/người điều khiển ngoài; access points/grants cho người đi bộ; verify/log/evidence đi bộ không cần plate; chuẩn loại xe motorcycle/car/truck và xử lý unknown/legacy rõ | API mục 10.9, DTO/policy/migration; face bắt buộc cho đi bộ và cả ba loại xe; luồng xe giữ RFID + mặt + biển số |
| BE-05 Camera/edge và thiết bị | P0, phối hợp BE-04 trước nghiệm thu core | Sửa RFID card_uid; trigger/encounter/debounce, đồng bộ thẻ–mặt–biển số; capture manifest tin cậy, camera/lane/ROI, freshness/max-skew, xử lý thiếu/nhiều ứng viên; idempotency và retry cùng event | Edge gọi API thật không thiếu field; phân biệt verification, quyết định cho qua, lệnh thiết bị và ACK; lỗi fail-closed |
| BE-06 Dashboard | P1, sau schema/sự kiện core | Hai API analytics mục 10.8; aggregate server trên toàn bộ tập được phép; metric definitions, timezone/[from,to), snapshot/coverage/warnings/null và provenance/drilldown | DTO thống kê có data_as_of, đơn vị, định nghĩa, nguồn và giới hạn dữ liệu; không cộng list bị giới hạn để giả tổng |
| BE-07 AI Assistant nội bộ | P1, sau analytics/RBAC | ModelGateway self-hosted; worker/jobs, history/detail/events/cancel/export; aggregate snapshot bất biến, output schema/numeric/citation validation, expiry/retention và giới hạn tài nguyên | Sáu API reports mục 10.8; trạng thái/cancel thật, quyền owner + domain; lỗi model trả trạng thái/fallback minh bạch |

P0/P1 biểu thị thứ tự phụ thuộc kỹ thuật, chưa phải cam kết thời gian. BE-04/BE-05 có thể triển khai song song khi contract chung đã chốt. Dashboard phụ thuộc dữ liệu core có ý nghĩa; Assistant phụ thuộc aggregate và authorization thật. Mỗi gói vẫn đi theo Domain -> Application -> Infrastructure -> Presentation -> Bootstrap -> Tests, không gom nghiệp vụ vào router.

### 19.3. Những điểm phải sửa hoặc bổ sung dữ liệu

1. **Edge đang lệch contract:** client chưa gửi card_uid trong khi gate API bắt buộc, có thể nhận 422; exit còn lấy slip_image và vòng lặp tạo event_id mới mỗi khoảng chạy. Cần nguồn RFID thật, bỏ phụ thuộc phiếu kho không thuộc Gate Out hiện tại, gắn sự kiện với encounter và giữ nguyên event_id khi retry. Không chèn UID/ảnh/biển số giả để vượt validation.
2. **Danh tính và camera:** Driver.employee_code tùy chọn chưa tạo thành registry nhân viên; vehicle_type còn là chuỗi tự do. Face hiện là xác minh 1:1 theo chủ thẻ, thuật toán chọn mặt lớn nhất chưa bảo đảm đúng người điều khiển. Cần liên kết identity và evidence đáng tin cậy; thiếu mặt, che mặt, nhiều người, sai xe hoặc ảnh quá hạn phải xử lý theo policy fail-closed đã định nghĩa.
3. **Nguồn thống kê:** GateLog chưa có gate_id/site_id; không join riêng các lệnh barrier rồi bỏ mất lần từ chối trước khi ra lệnh. Bổ sung schema/migration và coverage cho dữ liệu lịch sử; phần không xác định giữ unknown, không tự gán cổng/chi nhánh.
4. **Thời gian và ý nghĩa KPI:** occurred_at được ghi sau inference, completed_at là ACK thiết bị; chưa đủ đo độ trễ AI/toàn luồng. Cần các mốc nhận capture, kết thúc verify, gửi lệnh và nhận ACK nếu công bố latency. Verification PASS hoặc ACK mở barrier chưa chứng minh người/xe thực tế đã đi qua; chưa có crossing/session/ground truth thì không công bố occupancy, chấm công hoặc AI accuracy.
5. **Quyền trên mọi đường dữ liệu:** thay kiểm enum role cứng bằng policy/permission thống nhất cho API, ảnh, downloads, WS, analytics và report jobs. Khóa tài khoản/đổi role/reset mật khẩu phải có hiệu lực cả với kết nối đang chạy, worker khác và artifacts đã tạo, theo policy thu hồi đã chốt.
6. **AI chỉ báo cáo:** tính số liệu bằng code trước model, chỉ đưa aggregate có quyền và citations vào model nội bộ; không đưa embeddings/ảnh/raw PII mặc định, không cloud fallback, không truy cập SQL/DB tùy ý hoặc tool mở barrier. Nhận diện hành động từ video là pipeline mở rộng riêng, không suy ra từ ảnh đơn hoặc giao cho LLM báo cáo.

### 19.4. Bộ bàn giao bắt buộc của mỗi gói backend

- **Contract:** OpenAPI cập nhật; request/response/error examples đã khử dữ liệu nhạy cảm; enum/nullability, thời gian, pagination/filter, upload limits, bytes/content type, permissions và idempotency/version-conflict semantics. Giữ hoặc migration rõ envelope lỗi error.code/message/details và X-Request-ID; không yêu cầu frontend đoán field.
- **Tích hợp:** môi trường FastAPI/database/storage test chạy thật; cấu hình origin/cookie/CSRF/proxy, tài khoản thử theo role và dữ liệu tổng hợp cô lập khỏi production; hướng dẫn gọi API và kiểm tra trạng thái. Frontend vận hành không có mock mode; fixtures chỉ dùng trong tests cô lập.
- **Realtime/jobs:** schema/version/sequence, reconnect/resync và expiry cho WS; report stream xác thực bằng fetch Bearer, trạng thái job/cancel/retry/download có contract. Đóng kết nối browser không được giả là server đã hủy công việc.
- **Migration/vận hành:** scripts và kế hoạch rollback/compatibility, indexes, backfill có coverage, audit, health/observability, giới hạn worker/model và quản lý secrets ở server. Không chuyển device key, signing key hay endpoint model nội bộ cho browser.
- **Bằng chứng nghiệm thu:** unit tests use case mới; contract/integration tests; quyền cho phép/từ chối/IDOR, last-admin race, forced-password, refresh/revoke trên nhiều worker, replay/idempotency; camera thực tế cho đi bộ/xe máy/ô tô/xe tải và lỗi camera/AI/storage/device fail-closed. Analytics/report phải có ca đối chiếu số liệu nguồn, thiếu dữ liệu, thu hồi quyền và cancel race. Chỉ xác nhận đạt khi có kết quả chạy.

### 19.5. Phần mở rộng và thứ tự giao việc đề nghị

Giao BE-01 trước để frontend/backend thống nhất hợp đồng, sau đó BE-02/BE-03 và BE-04/BE-05; tiếp theo BE-06 rồi BE-07. Frontend có thể xây design system/layout trong khi backend triển khai, nhưng chỉ nghiệm thu chức năng khi tích hợp API thật.

Module kho tiếp tục dùng orders/dock/slip hiện có khi bắt đầu giai đoạn extension; **chưa nối order/QR kho vào Gate Out**. Action recognition người/xe cần contract video ingest/tracking/temporal evidence/review và benchmark riêng. Hai extension này không là điều kiện để hoàn thành các gói backend core trên.
