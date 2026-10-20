# ADR-0001: Phục vụ React Vite SPA dưới /console

## Status

Proposed

## Context and Problem Statement

[Proposal](../proposal.md) cần giao diện React có composition và reuse trên FastAPI hiện có. [Design D2](../design.md) cần rollout/rollback độc lập mà không bổ sung application server frontend khi production chỉ cần static assets.

## Considered Options

- Giữ vanilla JS và refactor: ít build tooling mới nhưng tiếp tục tự quản lý composition/routing/state ở quy mô nhiều màn hình.
- React + Vite SPA: build assets và dùng API FastAPI hiện có, cần tự xử lý SPA routing/auth bootstrap.
- Next.js: có SSR/server features nhưng thêm runtime/deployment cho các tính năng hiện chưa cần.

## Decision Outcome

Chọn React + TypeScript strict + Vite SPA ở frontend/, phục vụ /console cùng origin với FastAPI. Giữ UI cũ trong cửa sổ migration có cutoff; route fallback chỉ dành /console. Stable versions/peer dependencies chốt tại implementation, không ghim số chưa xác minh trong ADR.

### Consequences

- Tốt: tái sử dụng backend/deployment, code splitting, rollout UI theo chặng và rollback có kiểm soát.
- Bất lợi: phải quản lý auth bootstrap, fallback/deep links và caching assets; không có SSR mặc định.
- Theo dõi: task bootstrap/deployment kiểm base/basename/assets, 404 API không thành HTML, compatibility không làm giảm bảo mật.
