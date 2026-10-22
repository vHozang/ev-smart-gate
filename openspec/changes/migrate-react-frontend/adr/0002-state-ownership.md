# ADR-0002: TanStack Query sở hữu server state

## Status

Proposed

## Context and Problem Statement

User yêu cầu Redux Toolkit và đề xuất API/state architecture. [Design D2](../design.md) cần một nguồn cache cho me/lists/analytics/jobs, trong khi sidebar/workspace/auth lifecycle là client state. Hai caches cho cùng tài nguyên gây stale invalidation và khó revoke dữ liệu.

## Considered Options

- Redux Toolkit + RTK Query cho server state: gắn chặt query layer vào Redux, một lựa chọn khả thi nếu thay toàn bộ Query design.
- Redux Toolkit + TanStack Query: tách lifecycle/cache server khỏi serializable client state.
- Redux tự quản lý toàn bộ API lists: ít dependency query nhưng phải tự xây retry/cancellation/invalidation/cache.

## Decision Outcome

Chọn TanStack Query cho server state, Redux Toolkit cho client state theo báo cáo. Axios là transport chung; local/form/URL giữ state đúng phạm vi. Không thêm Zustand/RTK Query song song. Access token ở auth service RAM, không persist query cache nhạy cảm.

### Consequences

- Tốt: query ownership và invalidation nhất quán, dễ gom custom hooks theo feature và xóa dữ liệu khi đổi identity.
- Bất lợi: team cần hiểu hai công cụ và tránh copy response vào Redux; auth/query lifecycle phải phối hợp khi logout/revoke.
- Theo dõi: dependency rules/tests chặn cache thứ hai, stale responses và objects không serializable trong Redux.
