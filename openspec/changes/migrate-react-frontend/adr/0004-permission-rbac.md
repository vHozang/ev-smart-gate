# ADR-0004: Một role/user và permission catalog do backend quản lý

## Status

Proposed

## Context and Problem Statement

Backend có một enum role/user và guards hardcoded. Users/custom roles được yêu cầu nhưng cần bảo toàn baseline ADMIN/WAREHOUSE/SECURITY, tránh leo quyền và tách quyền ứng dụng khỏi physical access. Xem [design D4](../design.md).

## Considered Options

- Tiếp tục enum guards: đơn giản nhưng mọi nhóm quyền mới cần sửa code và không có custom role editor đúng nghĩa.
- Một role_id/user với role-permission catalog: gần cardinality hiện tại và đủ các use cases quản trị đã nêu.
- Multi-role/hierarchy/direct-user grants: linh hoạt hơn nhưng tăng conflict/privilege-analysis và migration chưa có nhu cầu xác nhận.

## Decision Outcome

Chọn một role hoạt động/user, system/custom Role và backend-owned catalog/version/grantable policy. Deny-by-default ở API/evidence/WS/analytics/jobs; device scopes và Employee access grants là policy riêng. Protected ADMIN guards, last-admin transaction, expected_version, audit atomic và revoke xuyên worker là invariants của quản trị.

### Consequences

- Tốt: migration dễ đối chiếu quyền cũ, permission hooks UI không phải hardcode role strings và custom roles có giới hạn rõ.
- Bất lợi: chưa đáp ứng tổ hợp nhiều roles; thay permissions một role ảnh hưởng nhiều users cần propagation và review.
- Theo dõi: seed quyền mới phải được review, không wildcard/permission CRUD tùy ý hoặc bootstrap khôi phục quyền đã thu hồi.
