# EV Smart Gate — React Console

Package React/TypeScript riêng, chạy dưới `/console/`. Backend/API do team khác triển khai; Frontend tích hợp lần lượt các endpoint sẵn sàng. Không có mock mode trong runtime.

## Chạy Frontend

Node >=22.12 (đã kiểm tra với Node 24.21). Từ thư mục `frontend/`:

```powershell
npm ci
npm run dev
```

Mở `http://127.0.0.1:5173/console/`. Vite proxy `/api`, `/health`, `/ws` tới `http://127.0.0.1:8000`; đổi `DEV_API_TARGET` trong `.env.local` nếu backend chạy địa chỉ khác. Không đưa device key hoặc secrets vào biến `VITE_*`.

API chưa chạy sẽ hiện lỗi kết nối hoặc trạng thái chưa xác định. Bản UI này không tự khởi động/sửa backend. Tài khoản phải do backend cấp; không hardcode tài khoản demo.

## Phạm vi hiện tại

- AppShell/sidebar desktop mở rộng/rail và mobile drawer, nested route, breadcrumb và lazy page entries.
- Bộ semantic tokens, CSS chung; Tailwind chỉ cho bố cục trên cùng tokens. Geist/Geist Mono tự host có tiếng Việt, neutral sáng và một accent xanh lục. Palette là baseline đề xuất, chờ review G7.
- Button, Field, Input, Select, Badge, Skeleton, StatePanel và DataTable dùng chung; 5 layout composition.
- Một FeedbackProvider với renderContent/renderFooter, một blocking modal, focus/scroll/dirty/pending guards và toast dedupe/queue/pause.
- Đăng nhập/me/logout qua **session v1 hiện có**, CSRF chỉ trong RAM. Permission adapter chỉ chứa baseline v1 để hỗ trợ UX, backend luôn quyết định quyền. **JWT/refresh/custom RBAC chưa tích hợp**; không decode JWT hoặc tự fallback giữa auth versions.
- Phương tiện: list, lọc trong tập đã tải, thêm/sửa/ngừng hoạt động qua API hiện tại. Mutation không tự retry; mất phản hồi hoặc sai response contract chặn gửi lặp và yêu cầu kiểm tra lại danh sách.
- Hồ sơ nhận diện và đơn hàng kho: danh sách chỉ đọc. Không giả phòng ban/chấm công, không hoàn tất order qua Gate Out.
- Overview và hệ thống đọc health thật. Không suy camera/AI/barrier khỏe từ DB readiness, không dựng KPI từ số dòng đã tải.
- Users/Roles, gate/pedestrian, Dashboard và Assistant hiện là trạng thái chưa khả dụng; không gọi endpoint dự kiến hoặc tạo kết quả giả. Backlog API: [frontend-api-gaps](../docs/contracts/frontend-api-gaps.md).

Các lời gọi API đã được nối vào feature modules; nghiệm thu đăng nhập/CRUD end-to-end với backend thật còn chờ môi trường API. Chrome QA hiện kiểm giao diện thật và trạng thái khi backend chưa chạy; các adapter response tổng hợp chỉ nằm trong unit tests cô lập.

## Quy ước code

`app → layouts/pages/widgets → features → shared`. Layout nhận props/slots; page ghép feature hooks. `shared` không import app/store/feature/page. Feature auth được dùng qua public API như dịch vụ identity dùng chung; feature khác không deep-import nội bộ của nhau. Mỗi component/layout/page folder có `index.ts` named exports; mỗi page entry xuất `Component`, router lazy-import từng entry.

Redux giữ preferences serializable, chỉ persist trạng thái sidebar. TanStack Query sở hữu principal/lists/health; không persist query cache, CSRF hoặc tokens. URL giữ redirect hợp lệ; tìm kiếm hiện tại là local trong tập đã tải, không gửi bộ lọc backend chưa hỗ trợ. `useVehiclesScreen`, `useDriversScreen`, `useOrdersScreen`, `useSystemHealth` trả `data/state/actions`; schemas/API functions độc lập.

Một stylesheet entry ở `src/app/styles/index.css`, với layers Tailwind theme/base/components/utilities; tokens, base, components, layouts và motion tách file để bảo trì. Không thêm theme/hex theo page. Không copy animation/component từ React Bits ở chặng này; chỉ tham khảo bố cục/micro-interaction, tránh thêm dependency và giữ ổn định dữ liệu vận hành. Design skill và báo cáo của repo được ưu tiên theo yêu cầu người dùng.

API DTO sinh từ `docs/openapi.json`, runtime Zod schemas kiểm dữ liệu trước khi vào cache. Snapshot này là API v1 baseline, không chứng minh API tương lai hoặc working tree backend đã được triển khai. Khi team backend bàn giao runtime OpenAPI, review contract, cập nhật snapshot/DTO/schema rồi bật endpoint tương ứng. Không dùng file OpenAPI mục tiêu như runtime source.

## Kiểm tra

```powershell
npm run typecheck
npm run lint
npm run api:check
npm run test
npm run build
npm run test:e2e
```

Browser QA dùng Chrome đã cài trên máy, chạy production preview, không intercept/mock API. Ảnh và JUnit lưu tại `../.tmp/frontend-qa/`. Backend có thể chưa chạy để kiểm error/unavailable; các ca nghiệp vụ cần được bổ sung khi API thật sẵn sàng. Ma trận đầy đủ mọi page/state, portrait/landscape, zoom 200% và visual review vẫn cần hoàn thiện; không coi vài screenshot là nghiệm thu toàn hệ thống.

```powershell
npm run api:generate
npm run format:check
```

`api:check` kiểm DTO drift so với snapshot; lint kiểm dependency boundaries/circular imports/index exports. Build tách các page cùng React/validation chunks. Node chỉ cần ở build/dev; production reverse proxy cần static assets và SPA fallback riêng `/console/*`, tuyệt đối không fallback `/api`, `/ws`, `/health` sang HTML. Chưa thay cấu hình deploy backend trong phạm vi Frontend hiện tại.
