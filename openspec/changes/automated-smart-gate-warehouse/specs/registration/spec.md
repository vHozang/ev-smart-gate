# Đặc tả đăng ký

## Requirement: Enrollment tài xế an toàn

Hệ thống SHALL nhận ảnh enrollment, tự trích embedding và mã hóa trước khi ghi MongoDB; client SHALL NOT được ghi vector trực tiếp.

### Scenario: Enrollment hợp lệ

- Given ảnh có một khuôn mặt đủ chất lượng và vượt liveness
- When ADMIN tạo tài xế
- Then embedding được chuẩn hóa, mã hóa AES-GCM và API không trả embedding

## Requirement: Authorization có thời hạn

Gate In SHALL chỉ chấp nhận khi đúng driver và vehicle thuộc cùng authorization đang hiệu lực.
