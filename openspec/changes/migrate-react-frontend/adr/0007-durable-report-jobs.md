# ADR-0007: Report chạy qua durable worker độc lập HTTP connection

## Status

Proposed

## Context and Problem Statement

Self-hosted inference có thể dài/quá tải; người dùng cần history, reconnect, cancel và export có quyền. Request lifecycle hoặc in-process task đơn lẻ không đủ phục hồi khi API worker chết. Xem [design D9](../design.md); model/hardware cụ thể còn Unknown.

## Considered Options

- Inference đồng bộ trong HTTP request: ít orchestration nhưng mất khả năng theo dõi sau disconnect và chiếm API resources.
- Background task trong process API: nhẹ nhưng mất job/cancel coordination khi restart hoặc nhiều workers.
- Durable jobs và bounded worker với claim/lease/recovery: thêm state machine/storage nhưng độc lập kết nối và kiểm soát tài nguyên.

## Decision Outcome

Chọn ReportJobRepository bền vững và worker tách API event loop, atomic claim/lease/deadline/recovery, ModelGateway nội bộ có timeout/cancel capability. Giai đoạn đầu stream stage/status thật, final chỉ sau validation; cancel request khác worker-confirmed CANCELED. Ưu tiên Mongo hiện có và bổ sung outbox/notification adapter phù hợp; không mặc định thêm Redis/Celery trước khi benchmark cho thấy cần thiết.

### Consequences

- Tốt: reconnect/history/cancel có trạng thái nguồn, bounded concurrency bảo vệ API và có recovery khi worker lỗi.
- Bất lợi: phải quản lý leases, retries, completion/cancel races, expiry/purge và model adapter không phải lúc nào cũng hủy inference ngay.
- Theo dõi: quota/deadline/retention chốt trước release; revoke chặn output ngay cả khi inference chưa dừng vật lý.
