# Tài liệu yêu cầu nghiệp vụ — Smart Gate và xác minh xuất kho

## 1. Mục tiêu

Tự động hóa kiểm soát phương tiện ra/vào và xác minh lệnh xuất kho, đồng thời duy trì khả năng truy vết đầy đủ người–xe–hàng–phiếu–quyết định–lệnh barrier.

## 2. Vai trò

| Vai trò | Trách nhiệm |
|---|---|
| ADMIN | Dữ liệu nền, tài khoản, cấu hình và audit |
| WAREHOUSE | Tạo order, kiểm tra dock, finalize và phát hành slip |
| SECURITY | Nhận/giải quyết cảnh báo, theo dõi Gate Log |
| Edge Device | Chụp ảnh/RTSP, lấy mẫu và gọi workflow đúng scope |
| Barrier | ACK lệnh mở idempotent; không nhận lệnh trực tiếp từ AI |

## 3. Quy tắc nghiệp vụ

1. Face similarity phải `>= 0.75`, đủ detector confidence và vượt liveness khi policy bật.
2. Plate exact được ưu tiên. Fuzzy chỉ chấp nhận cùng độ dài, cùng hai ký tự tỉnh đầu, Levenshtein `<= 1`, RapidFuzz `>= 90` và chỉ có một candidate tốt nhất.
3. Gate In bắt buộc driver–vehicle authorization đang hiệu lực.
4. AI/camera/storage/device lỗi luôn fail-closed.
5. Order: `PENDING -> LOADING -> READY_FOR_EXIT -> SLIP_ISSUED -> COMPLETED`; `CANCELLED` là terminal.
6. AI cargo chỉ tạo observation. Operator phải finalize `LOADED`.
7. Slip dùng compact JWS Ed25519; reissue tăng version và vô hiệu token cũ.
8. Gate Out yêu cầu QR/order/live face/live plate cùng trỏ tới một driver–vehicle–order.
9. Order chỉ `COMPLETED` sau barrier ACK.
10. `event_id` và `command_id` ngăn retry mở cổng lần hai.

## 4. Yêu cầu phi chức năng

- FastAPI async; inference CPU-bound chạy bounded executor.
- MongoDB replica set, unique/compound/TTL indexes và transaction nhiều document.
- Evidence và embedding mã hóa AES-GCM; MinIO bucket private.
- Session HttpOnly/SameSite Strict, CSRF cho mutation; API key device lưu dạng hash.
- Alert có sequence, WebSocket realtime và REST resync.
- Không lưu dữ liệu sinh trắc học thật, model binary hoặc production secret trong Git.

## 5. Tiêu chí nghiệm thu

- Docker Compose khởi động API, MongoDB replica set, MinIO và barrier simulator.
- Gate In exact/fuzzy hợp lệ mở barrier sau ACK; mismatch tạo alert và không mở.
- Dock không thể READY nếu chưa có capture và operator finalize.
- QR giả, hết hạn, sai version/JTI/order bị từ chối.
- Gate Out thành công hoàn tất order; barrier timeout để order ở `SLIP_ISSUED`.
- Ruff, format, mypy, pytest và OpenAPI contract đều đạt.
