# ADR-0006: Backend tính aggregate và đóng băng nguồn trước LLM

## Status

Proposed

## Context and Problem Statement

Dashboard và Assistant phải dùng dữ liệu thật, kiểm quyền và giải thích được con số. List API có limit và logs thiếu crossing/telemetry/history; model không được tự biến dữ liệu thiếu thành KPI. Xem [design D8/D9](../design.md).

## Considered Options

- Browser cộng REST lists rồi gửi model: nhanh ban đầu nhưng list limit và quyền/coverage dễ gây tổng sai.
- Model đọc raw records và tự tính trong phạm vi được cấp: linh hoạt nhưng khó kiểm chứng số học, tăng egress/PII và injection surface.
- Backend deterministic aggregates + immutable snapshot/metric refs trước model: kiểm soát nghĩa số liệu và validation, giảm linh hoạt truy vấn tự do.

## Decision Outcome

Chọn AnalyticsQueryService tính totals/ratios/period comparisons trên toàn tập có quyền, definitions/coverage/units/null rõ. Report đóng băng aggregate snapshot; khi nguồn không đồng thời ghi watermarks/partial và không tính cross-source ratio không hợp lệ. LLM chỉ diễn đạt; final validator kiểm schema, mọi số và citations theo snapshot/quyền.

### Consequences

- Tốt: số liệu có thể tái kiểm chứng, giảm raw data tới model và chặn fabricated metrics/cross-domain leakage.
- Bất lợi: cần metric catalog, snapshot lifecycle/retention và thêm công việc cho KPI mới; model không trả lời truy vấn ngoài nguồn đã hỗ trợ.
- Theo dõi: không gọi PASS ratio là accuracy, ACK là crossing, current snapshot là lịch sử; dữ liệu thiếu -> unavailable và limitations.
