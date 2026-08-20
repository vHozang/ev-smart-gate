# Đặc tả thiết bị

## Requirement: Device scope

Edge SHALL dùng `X-Device-Key` đã băm và chỉ gọi workflow thuộc scope. Operator mutation SHALL dùng session HttpOnly, SameSite Strict và CSRF token.

## Requirement: Idempotency

`event_id` và `command_id` SHALL ngăn camera reconnect hoặc HTTP retry tạo lượt mở cổng thứ hai.
