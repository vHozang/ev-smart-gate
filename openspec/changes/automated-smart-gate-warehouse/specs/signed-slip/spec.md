# Đặc tả Exit Slip đã ký

## Requirement: Compact JWS Ed25519

QR SHALL chứa `order_id`, `vehicle_id`, `driver_id`, `slip_version`, `jti`, `iat`, `exp`, `kid` và chữ ký Ed25519.

### Scenario: Reissue

- Given order đã có slip version N
- When operator reissue
- Then slip mới có version N+1 và token cũ không còn khớp dữ liệu nội bộ

### Scenario: QR hỏng

- When PyZbar/OpenCV không đọc được QR
- Then OCR hint không được dùng thay chữ ký số
