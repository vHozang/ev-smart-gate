# ADR-0005: Verify bằng capture bundle có manifest tin cậy

## Status

Proposed

## Context and Problem Statement

Mặt/RFID/biển số phải cùng người và lượt tiếp cận cho cả đi bộ/xe máy/ô tô/xe tải. Snapshot multipart không chứng minh freshness/source/correlation; SFace chọn mặt lớn nhất có thể chọn hành khách. [Design D5](../design.md) cần trust boundary độc lập UI.

## Considered Options

- Tiếp tục ảnh multipart và chọn mặt lớn nhất: tương thích cũ nhưng không chứng minh đúng encounter/người lái.
- Tin camera/time/ROI metadata browser tự gửi: linh hoạt nhưng client có thể sửa/bịa hoặc replay.
- Manifest được authenticated gateway/device ghi và backend xác minh: kiểm được source/binding/freshness, cần ingestion và thiết bị cấu hình.

## Decision Outcome

Chọn versioned CaptureBundle với server-validated manifest, device/gate/lane/access mode/encounter/frame hash/time và ROI config binding. Face 1:1 + card, xe thêm plate/authorization; ambiguity/stale/mismatch fail-closed. Idempotency bind canonical scope và fingerprint, lookup phục hồi timeout. Legacy/manual flow không bypass strict capture policy.

### Consequences

- Tốt: tách evidence trust khỏi model similarity và browser, tránh ghép ảnh/thẻ khác sự kiện hoặc retry sai cổng.
- Bất lợi: cần camera/reader/gateway/clock calibration và hiện trường benchmark; ảnh không đủ chất lượng bị từ chối thay vì tự đoán.
- Theo dõi: M0 chốt ingest/lookup contract; G3 chốt freshness/ROI và tests đủ bốn mode, không cam kết accuracy trước evidence.
