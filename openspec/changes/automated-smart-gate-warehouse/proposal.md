# Đề xuất: Hệ thống Smart Gate và xác minh xuất kho tự động

## Mục tiêu

Thay tài liệu PoC rời rạc bằng backend Clean Architecture chạy được, dùng MongoDB/MinIO và xác minh nhất quán tài xế–xe–order tại Gate In, dock và Gate Out.

## Phạm vi

- Enrollment tài xế bằng ảnh, embedding mã hóa; đăng ký xe và authorization có thời hạn.
- Gate In face/plate/authorization, barrier ACK và cảnh báo realtime.
- Dock inspection, cargo timeline và operator finalize.
- Exit Slip QR compact JWS Ed25519, reissue/version/JTI.
- Gate Out xác minh ba chiều và hoàn tất order sau ACK.
- Session/CSRF/role cho operator; device API key theo scope.

## Không thuộc phạm vi

- Huấn luyện model riêng hoặc cam kết accuracy trước benchmark tại hiện trường.
- Tích hợp PLC/vendor barrier cụ thể ngoài HTTP adapter mẫu.
- Lưu video liên tục hoặc nhận dạng sinh trắc học từ dữ liệu thật trong repository.

## Rủi ro và kiểm soát

- AI false positive: threshold, liveness, authorization và fail-closed.
- Replay QR/request: chữ ký Ed25519, JTI/version/token hash, `event_id` và command idempotency.
- Rò rỉ sinh trắc học: AES-GCM, MinIO private, không trả embedding qua API.
- Lỗi nhiều document: MongoDB replica set transaction tại các điểm chuyển trạng thái quan trọng.
