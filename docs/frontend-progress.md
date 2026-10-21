# Tiến độ React Frontend — 21/10/2026

Theo yêu cầu cập nhật của người dùng, triển khai chỉ tập trung Frontend. Team backend phụ trách API, bàn giao từng endpoint để Frontend tích hợp tiếp, không đợi hoàn tất cả M1. Các thay đổi backend từ giai đoạn trước được giữ nguyên và chưa được coi đã nghiệm thu.

## Phần đã có

Package `frontend/` riêng: React 19.3.1, Vite 8.3.4, TypeScript strict 5.9.3, React Router 8.5.0, Redux Toolkit 2.13.0, TanStack Query 5.104.5, Axios 1.20.0, Tailwind 4.3.3 và Zod 4.6.7. Phiên bản React/Vite lấy stable npm dist-tags tại thời điểm cài; dependencies được ghim trong package/lockfile và cài với strict peer checks. TypeScript 5.9 đáp ứng OpenAPI generator yêu cầu ^5; resolver 5.2.2 đáp ứng RHF/Zod trong bộ dependency này. Không ép `--force`/`--legacy-peer-deps`.

- CSS semantic tokens dùng chung; Tailwind cho bố cục riêng, một stylesheet entry, Geist/Geist Mono có tiếng Việt; giảm chuyển động theo hệ điều hành.
- AppShell + Auth/List/Detail/Workspace layouts; desktop sidebar/rail, mobile drawer, breadcrumb, preference không nhạy cảm. Một route registry, named lazy entries và public `index.ts`.
- UI primitives và bảng cuộn nội bộ (`DataTable` sticky header, `DataTablePagination`, `DataTableFilter`, `formatNullable`); `EvidenceViewer` hiển thị bằng chứng ảnh/blob có resource cleanup tự động (`URL.revokeObjectURL`) chống rò rỉ bộ nhớ.
- Modal render props và modal compositions dựng sẵn: `NoticeModal`, `ConfirmModal` (có pending/double-submit guard và giữ modal khi lỗi), `FormModal` (chuẩn hóa `formId` và dirty guard), `DetailModal` và `EvidenceModal`. Một toast host dedupe/queue/pause/dismiss; feature sở hữu kết quả.
- Auth session v1 hiện có: login/me/logout, CSRF RAM, permission adapter baseline chỉ hỗ trợ UX. Query/cache và mutation callbacks bị chặn khi identity đổi. JWT/refresh/multi-tab/custom RBAC chưa tích hợp.
- Phương tiện có list/tìm trong tập đã tải/tạo/sửa/ngừng hoạt động qua API hiện tại. 422 giữ form, không toast thành công giả; response bị mất/sai contract chặn gửi lặp và yêu cầu kiểm tra lại danh sách.
- Hồ sơ nhận diện và đơn hàng kho có danh sách chỉ đọc; overview/system có health thật. Các trang chức năng còn thiếu được ghi là chưa khả dụng, không có runtime data mocks/KPI/report giả.

## Bằng chứng đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript strict | Đạt |
| ESLint + boundaries/circular/import/export | Đạt, 118 source files |
| Generated DTO vs API v1 snapshot | Đạt |
| Prettier | Đạt |
| Unit/component tests | 75 đạt 100% (thêm tests cho DataTable, Pagination, EvidenceViewer cleanup và 5 modal compositions) |
| Chrome production-preview tests | 25 đạt, không mock/intercept API |
| Production build | Đạt; lazy chunks theo page, React và validation chunks riêng; không còn cảnh báo JS chunk >500 kB |

Browser coverage: overview/login/system ở 320/360/768/1024/1440/1920 px; kiểm không tràn ngang, drawer focus/restore/navigation, rail giữ sau navigation/reload, unavailable route không gọi API dự kiến, theme không đổi theo lazy route, reduced motion, landscape, viewport hiệu dụng tương đương zoom 200%, deep link/404 và API không bị SPA fallback. Ảnh ở `.tmp/frontend-qa/screenshots/`, JUnit `.tmp/frontend-qa/junit.xml`.

Đã xem trực tiếp ảnh overview desktop/mobile và login desktop để kiểm bố cục. Palette/baseline là đề xuất chờ G7, chưa gọi là người dùng đã duyệt. Chưa chạy đầy đủ mọi trang/state/zoom browser thực hoặc nghiệp vụ xác thực/CRUD với backend thật: backend tại 127.0.0.1:8000 chưa chạy trong browser QA. Các synthetic responses chỉ ở unit tests cô lập.

## Phần tiếp tục theo từng màn hình

API gap backlog: [frontend-api-gaps](contracts/frontend-api-gaps.md). Ưu tiên endpoint Auth v2/Users/Roles theo contract đã thống nhất; Frontend tiếp tục form/detail/pagination/evidence, thẻ/logs và workflow kho theo API hiện hữu. Những gì endpoint chưa hỗ trợ cần ghi rõ để backend bổ sung, không tự viết backend hoặc tạo dữ liệu giả.

JWT single-flight/multi-tab/revoke/authz-version, Users/Roles/Audit CRUD, enrollment/camera/pedestrian, realtime, Dashboard/Assistant và deployment production vẫn là việc chưa hoàn tất. MG1/MG2 và toàn change chưa được nghiệm thu; không commit/merge/sync/archive trong lượt này.

Hướng dẫn chạy: [frontend README](../frontend/README.md).
