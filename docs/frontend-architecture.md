# Kiến trúc giao diện điều hành

## Mục tiêu

Giao diện là SPA nhẹ được phục vụ trực tiếp bởi FastAPI tại `/`. Thiết kế này giữ UI và API cùng origin, loại bỏ cấu hình CORS phức tạp và cho phép cookie session HttpOnly/SameSite Strict hoạt động đúng mặc định. Frontend không phụ thuộc CDN, framework JavaScript hoặc Node.js ở runtime.

## Cấu trúc

```text
src/smart_gate/presentation/static/
├── index.html          Điểm vào SPA và metadata
└── assets/
    ├── api.js          HTTP client, cookie credentials và ánh xạ lỗi
    ├── app.js          State, router hash, màn hình và workflow
    ├── ui.js           Icon, format và helper an toàn HTML
    ├── styles.css      Design system responsive
    └── favicon.svg     Dấu hiệu nhận diện Smart Gate
```

`smart_gate.main` mount `/assets` bằng `StaticFiles` và trả `index.html` tại `/`. SPA dùng hash route nên refresh trang không cần server fallback riêng.

## Màn hình và quyền

| Màn hình | ADMIN | WAREHOUSE | SECURITY |
|---|---:|---:|---:|
| Tổng quan và sức khỏe hệ thống | Có | Có | Có |
| Tài xế, phương tiện, ủy quyền | CRUD | Chỉ đọc | Chỉ đọc |
| Lệnh xuất kho, dock, Exit Slip | Có | Có | Chỉ đọc |
| Gate In và Gate Out thủ công | Có | Không | Có |
| Nhật ký cổng và ảnh bằng chứng | Có | Có | Có |
| Cảnh báo WebSocket và xử lý trạng thái | Có | Không | Có |

Thiết bị edge vẫn gọi Gate In/Gate Out bằng `X-Device-Key`. Khi ADMIN hoặc SECURITY thao tác trên UI, backend xác thực session và `X-CSRF-Token`; không có device key nào được đưa vào mã frontend.

## Xác thực

1. `POST /api/v1/auth/login` đặt cookie session HttpOnly và cookie CSRF.
2. UI giữ CSRF trong memory; sau khi refresh, `GET /api/v1/auth/me` trả lại token CSRF hiện tại.
3. Mọi mutation gửi `X-CSRF-Token` và `credentials: include`.
4. HTTP 401 phát sự kiện toàn cục, đóng WebSocket và đưa người dùng về màn hình đăng nhập.
5. Session token không được ghi vào localStorage, sessionStorage hay DOM.

## Cảnh báo thời gian thực

UI tải lịch sử bằng `GET /api/v1/security/alerts`, sau đó mở `/ws/v1/security/alerts`. Ping được gửi mỗi 25 giây. Khi mất kết nối, client thử kết nối lại sau 3,5 giây và REST resync giúp bù các sequence bị lỡ. Event được dedupe theo `id`/`sequence` từ dữ liệu API.

## Ảnh và tệp bảo vệ

- Ảnh Gate Log và dock capture được đọc qua API có session, không dùng URL MinIO public.
- Exit Slip QR/HTML/PDF được tải qua endpoint có kiểm tra vai trò.
- Camera trình duyệt dùng `getUserMedia`; stream được đóng ngay khi modal đóng hoặc ảnh đã chụp.
- Blob URL chỉ tồn tại tạm thời và được thu hồi sau khi preview/download.

## Quy tắc UX an toàn

- `verification_status=PASSED` không đồng nghĩa cổng đã mở.
- UI chỉ hiển thị “Đã mở cổng” khi `permit_granted=true` và `barrier_status=OPENED`.
- Gate form tự tạo `event_id`, đồng thời giải thích phải giữ nguyên ID khi retry cùng sự kiện.
- Reissue Exit Slip luôn yêu cầu xác nhận vì QR cũ bị vô hiệu.
- Hành động ngừng tài xế, xe hoặc hủy order đều có bước xác nhận rõ hậu quả.
