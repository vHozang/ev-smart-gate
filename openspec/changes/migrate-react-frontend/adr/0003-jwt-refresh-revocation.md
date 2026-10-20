# ADR-0003: JWT kết hợp refresh session và thu hồi bền vững

## Status

Proposed

## Context and Problem Statement

JWT access/refresh đã được yêu cầu, nhưng khóa user/đổi quyền phải tác động HTTP, WS và reports trước khi access JWT tự hết hạn. Backend hiện có session cookie/CSRF và WS kiểm auth lúc kết nối; [design D3](../design.md) cần migration và multi-worker correctness.

## Considered Options

- Giữ session-only: phù hợp backend hiện tại nhưng không đáp ứng access JWT contract đã yêu cầu.
- JWT hoàn toàn stateless đến hết TTL: giảm storage checks nhưng quyền cũ còn hiệu lực sau revoke.
- Access JWT + refresh token family và session/authz versions bền vững: hỗ trợ thu hồi ngay, tăng storage/cache coordination.

## Decision Outcome

Chọn access JWT trong browser RAM và opaque refresh cookie HttpOnly/Secure có Origin/CSRF protection, rotation/reuse detection. Backend kiểm user/session/effective authz version mỗi request và trước phát dữ liệu stream; invalidation phủ mọi worker. Keys/claims tách JWS phiếu kho. WS dùng ticket ngắn hạn dùng một lần, không URL chứa access/refresh token dài hạn. Policy TTL/idle/đa tab phải chốt M0.

### Consequences

- Tốt: thay đổi quyền có hiệu lực trên nhiều entry points, vẫn dùng JWT chuẩn cho client/API và migration có version.
- Bất lợi: không còn lợi ích stateless hoàn toàn; rotation/reuse đa tab và notifier/outbox đòi hỏi tests cạnh tranh và recovery.
- Theo dõi: forced-password restricted principal, cache failure fail-closed, logout stale responses và revoke không bị rollback UI khôi phục.
