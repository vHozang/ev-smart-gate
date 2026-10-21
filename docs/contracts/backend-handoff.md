# Bàn giao backend — migration React

MG0 được người dùng duyệt ngày 20/10/2026. API mục tiêu chưa mặc nhiên khả dụng; kiểm runtime/permission trước tích hợp UI.

Nguồn: [contract/policy](migration-v1.md), [OpenAPI mục tiêu](migration.openapi.json), [inventory runtime](runtime-inventory.json), [permission seed](permission-seed.json), [bằng chứng test](m0-evidence.json), [môi trường thật](test-environment.md).

| Gói | Đầu ra backend | Điều kiện |
| --- | --- | --- |
| BE-01 JWT | Auth v2, access RAM/refresh cookie, Origin/CSRF, atomic rotation/hash/history/revoke/version, restricted principal, WS tickets | Unit + race/multi-worker/security, MG1 |
| BE-02 RBAC | Users/roles/catalog/audit, một role/user, protected ADMIN/last-admin, CAS/version, audit atomic, enum migration không tăng quyền cũ | Permission diff/negative/direct API tests, MG1 |
| BE-03 Registry | Employee map enrollment, physical grants/access points/pedestrian/log/evidence; tách User/RBAC | G3 và MG3 |
| BE-04 Capture | Trusted source/lane/calibration/freshness, 4 modes face 1:1, event idempotency/lookup/ACK riêng crossing | G3 hiện trường, không bypass legacy; MG3 |
| BE-05 Analytics | Metrics/formula/permissions/filters/period/coverage/watermarks, aggregates toàn tập | G4 telemetry thật, MG4 |
| BE-06 Assistant | ModelGateway nội bộ, deterministic aggregates/citations/validation, durable worker/jobs/events/cancel/expiry/purge, owner/domain auth | G5/G6, MG5 |
| BE-07 Rollout | OpenAPI khớp runtime, indexes/migrations/backfill/rollback additive, compatibility cutoff, test thật/multi-worker/security/E2E | MG1–MG6 |

Thứ tự mỗi gói: Domain/ports → Application → Infrastructure → Presentation → Bootstrap → Tests. Không gắn order kho vào Gate Out. Quyền mới tách baseline; rollback không khôi phục credential hoặc quyền đã revoke. G3 calibration cần edge/vận hành; G4 cần nghiệp vụ dữ liệu; G5/G6 cần hạ tầng/vận hành; G7 cần frontend/người dùng.

Contract đã duyệt: auth v2; access 300s, refresh idle 24h/absolute 7d, grace rotation 5s trả 409 và retry một lần; mất cookie mới phải login lại; operator key tách phiếu kho. Alerts v2 durable delta/resync có watermark và retention đề nghị 7 ngày. Production cutoff, secrets, camera calibration, model hardware và report operational limits vẫn phải cấu hình/nghiệm thu ở gate tương ứng.


## Phân công cập nhật 21/10/2026

Team backend triển khai API; Frontend tiến hành M2 và tích hợp từng endpoint sẵn sàng. Khoảng trống theo màn hình được ghi tại [frontend-api-gaps.md](frontend-api-gaps.md). Mã backend dở dang chưa được nghiệm thu, không dùng làm bằng chứng API đã sẵn sàng.
