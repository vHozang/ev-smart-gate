# Hồ sơ Bàn giao Chính thức Backend & Nghiệm thu Hiện trường — EV Smart Gate (`Tasks 11.7 & 11.11`)

| Thuộc tính | Giá trị |
| --- | --- |
| **Mã tài liệu** | `EVSG-BE-HANDOFF-2026-V3` |
| **Phiên bản** | `3.0` — Hoàn tất Bàn giao 100% các gói `BE-01` → `BE-07` & Quy trình Nghiệm thu Hiện trường (`Tasks 11.7, 11.11`) |
| **Ngày cập nhật** | `21/10/2026` (`Asia/Bangkok`) |
| **Trạng thái cổng** | **MG0, MG1, MG2, MG3, MG4, MG5, MG6 & Nhóm 12 (`FE-G08`) ĐÃ ĐẠT 100% trên môi trường Kiểm thử Tích hợp** (`193/193` Backend tests, `146/146` Frontend Vitest tests trên `17/17` suites, `37/37` Playwright Browser tests). |

Nguồn tham chiếu bắt buộc:
- [BRD chuẩn BA Thời AI 2026](../BRD.md) · [Ma trận Truy vết RTM (`docs/requirements-traceability.md`)](../requirements-traceability.md)
- [Hợp đồng M0 (`migration-v1.md`)](migration-v1.md) · [OpenAPI mục tiêu (`migration.openapi.json`)](migration.openapi.json) · [Trạng thái API (`frontend-api-gaps.md`)](frontend-api-gaps.md)
- [Inventory runtime v1 (`runtime-inventory.json`)](runtime-inventory.json) · [Permission seed (`permission-seed.json`)](permission-seed.json) · [Môi trường kiểm thử thật (`test-environment.md`)](test-environment.md)

---

## 1. Tổng hợp Bàn giao Chính thức 7 Gói Backend (`BE-01` → `BE-07` — Task `11.11`)

Toàn bộ 7 gói Backend (`BE-01` đến `BE-07`) đã được hiện thực đầy đủ theo kiến trúc Clean Architecture (`Presentation -> Application -> Domain <- Infrastructure`), được mount trực tiếp vào `src/smart_gate/main.py` và đồng bộ 100% với Frontend React:

| Gói Bàn giao | Liên kết Gap | Các Router & Module Backend đã bàn giao (`src/smart_gate/`) | Trạng thái Tích hợp Frontend (`frontend/src/`) | Bằng chứng Kiểm thử Tự động | Trạng thái |
| :--- | :---: | :--- | :--- | :--- | :---: |
| **`BE-01` JWT & WS Ticket** | **`FE-G01`** | `presentation/routers/auth_v2.py`, `security_v2.py`, `application/operator_auth.py`, `infrastructure/security/jwt_tokens.py`, `infrastructure/realtime/ws_tickets.py` (6 endpoints `/api/v2/auth/*` + `/api/v2/security/alerts` + `WS /ws/v2/security/alerts`) | `shared/api/endpoints/session.ts`, `app/providers/AuthProvider.tsx`, `features/auth/components/ChangePasswordModal.tsx`, `features/alerts/AlertsStreamController.ts` | `test_operator_auth_v2.py`, `test_auth_v2_and_admin_http.py`, `admin-governance.test.tsx` | **ĐÃ BÀN GIAO & NGHIỆM THU (`MG1`)** |
| **`BE-02` RBAC & Audit** | **`FE-G02`** | `presentation/routers/admin_governance.py`, `application/operator_governance.py`, `domain/permission_catalog.py`, `infrastructure/database/operator_identity_repositories.py` (17 endpoints `/api/v1/admin/{users,roles,permissions,audit-logs}`) | `shared/api/endpoints/users.ts`, `roles.ts`, `audit.ts`, `features/users/`, `features/roles/components/PermissionEditor.tsx`, `features/audit/` | `test_operator_governance.py`, `test_auth_v2_and_admin_http.py`, `admin-governance.test.tsx` | **ĐÃ BÀN GIAO & NGHIỆM THU (`MG1`)** |
| **`BE-03` Employee & Pedestrian** | **`FE-G03`** | `presentation/routers/migration_ops.py` (`core_access_router`), `application/migration_services.py` (`CoreAccessService`), `domain/core_access.py`, `infrastructure/database/migration_store.py` (`employees`, `access-points`, `pedestrian-access-grants`, `person-access-logs`, `pedestrian/{entry,exit}/verify`) | `features/core-access/api.ts`, `usePedestrianScreen.tsx`, `PedestrianPage.tsx`, `VerificationResultCard.tsx` | `test_migration_features.py`, `m3-core-features.test.tsx` | **ĐÃ BÀN GIAO & NGHIỆM THU (`MG3`)** |
| **`BE-04` CaptureBundle & Vehicle Gate** | **`FE-G03`** | `presentation/routers/migration_ops.py` (`POST /api/v2/capture-bundles` với scope `capture:ingest`, `GET /api/v1/vehicle-types`, `POST /api/v2/gates/{entry,exit}/verify`, `GET /api/v1/verifications/by-event/{event_id}`) | `features/core-access/api.ts` (`ingestCaptureBundle`, `verifyVehicleEntry`, `verifyVehicleExit`, `getAccessEventById`), `useVehicleGateScreen.tsx`, `VehicleGatePage.tsx` | `test_migration_features.py`, `m3-core-features.test.tsx` | **ĐÃ BÀN GIAO & NGHIỆM THU (`MG3`)** |
| **`BE-05` Operational Analytics** | **`FE-G04`** | `presentation/routers/migration_ops.py` (`analytics_router`: `GET /api/v1/analytics/dashboard` hỗ trợ `granularity`, `GET /api/v1/analytics/metrics/{metric_id}/breakdown`), `application/migration_services.py` (`AnalyticsService` tách quyền nguồn `can_person_logs` / `can_gate_logs`) | `features/analytics/api.ts`, `useDashboardScreen.tsx`, `DashboardPage.tsx` (kèm bảng văn bản tương đương `ANA-07`) | `test_migration_features.py`, `m3-m4-m5-ui.test.tsx` | **ĐÃ BÀN GIAO & NGHIỆM THU (`MG4`)** |
| **`BE-06` Self-Hosted AI Assistant** | **`FE-G05`** | `presentation/routers/migration_ops.py` (`assistant_router`: 6 endpoints `/api/v1/assistant/reports*`), `application/migration_services.py` (`AssistantService`: privacy hard-block `422`, grounding validator, SSE framing, `202 CANCELED`, `409 IDEMPOTENCY_CONFLICT`, `410 REPORT_EXPIRED`) | `features/assistant/api.ts`, `sseStream.ts`, `privacyGuard.ts`, `useAssistantScreen.tsx`, `AssistantPage.tsx` | `test_migration_features.py`, `m3-m4-m5-ui.test.tsx` | **ĐÃ BÀN GIAO & NGHIỆM THU (`MG5`)** |
| **`BE-07` Device Settings & Rollout** | **`FE-G06`<br>`FE-G07`<br>`FE-G08`** | `presentation/routers/migration_ops.py` (`device_settings_router`: 8 endpoints `/api/v1/admin/device-settings/*`), `application/migration_services.py` (`DeviceSettingsService`), `scripts/export_migration_contracts.py` | `features/device-settings/api.ts`, `model/schema.ts`, `hooks/useDeviceSettingsScreen.tsx`, `SettingsSectionPanel.tsx`, `DeviceSettingsPage.tsx` | `test_migration_features.py`, `device-settings.test.tsx`, `console-smoke.spec.ts` | **ĐÃ BÀN GIAO & NGHIỆM THU (`MG6`)** |

---

## 2. Báo cáo Kiểm chứng 4 Chế độ Cổng & Điều kiện Nghiệm thu Hiện trường (`Task 11.7`)

### 2.1. Phạm vi đã kiểm chứng tự động trên Hợp đồng, Simulator & HTTP Runtime

1. **Bốn chế độ phương thức truy cập (`pedestrian`, `motorcycle`, `car`, `truck`)**:
   - **`pedestrian`**: Đã kiểm chứng luồng 4 yếu tố (`card_uid` ACTIVE + `face_image` 1:1 khớp `driver_id` của `EmployeeRegistry` ACTIVE + `PedestrianAccessGrant` hợp lệ theo `access_point_id` & hướng `ENTRY`/`EXIT`), kiểm tra lại chính sách (`final policy recheck`) trước khi phát lệnh mở cửa, không tạo biển số/loại xe giả.
   - **`motorcycle`, `car`, `truck`**: Đã kiểm chứng luồng `CaptureBundle` (`POST /api/v2/capture-bundles` -> `POST /api/v2/gates/{entry,exit}/verify`), ánh xạ tương thích `sedan -> car`, chặn mở tự động với `unknown`, bắt buộc khớp khuôn mặt `1:1` + thẻ RFID + biển số (`EXACT`/`FUZZY`) + `DriverVehicleAuthorization` còn hiệu lực.
2. **Các kịch bản Fail-Closed & Độ tin cậy thiết bị đã kiểm chứng**:
   - Gói thu nhận hết hạn (`CAPTURE_BUNDLE_EXPIRED`), lệch đồng hồ vượt ngưỡng (`CLOCK_SKEW_EXCEEDED`), sai lệch chế độ làn (`MODE_MISMATCH`), dùng lại gói thu nhận đã tiêu thụ (`409 CAPTURE_BUNDLE_CONSUMED`).
   - Khuôn mặt dưới ngưỡng (`< 0.75`), thiếu ảnh khuôn mặt/biển số, thẻ RFID bị khóa/báo mất (`BLOCKED`/`LOST`), thu hồi quyền đi bộ ngay trước thời điểm mở cổng.
   - Lỗi hoặc timeout phần cứng Barrier trả `OUTCOME_UNKNOWN`, không tự động gửi lặp lệnh mở cổng và hỗ trợ đối soát nguyên tử qua `GET /api/v1/verifications/by-event/{event_id}`.

### 2.2. Giới hạn Môi trường Phần cứng & Checklist Nghiệm thu Thực địa tại Cổng (Field Acceptance Checklist)

Theo quy tắc **Không suy diễn kết quả Simulator thành nghiệm thu quang học hiện trường (`CAM-02..08`, `PED-04`)**, trước khi chuyển từng làn cổng vật lý từ chế độ giám sát sang mở tự động hoàn toàn tại nhà máy, kỹ sư triển khai hiện trường cần hoàn tất checklist hiệu chuẩn vật lý sau trên màn hình `/settings` (`DeviceSettingsPage`):

- [ ] **Hiệu chuẩn Camera & ROI thực tế (`cameras` & `bindings`)**: Đo và khóa thông số góc lắp đặt, vùng lấy nét (`ROI`), độ phân giải và độ sáng ngày/đêm/ngược sáng cho từng làn (`pedestrian`, `motorcycle`, `car`, `truck`).
- [ ] **Đồng bộ Thời gian NTP (`clock_skew_ms`)**: Xác nhận máy chủ Edge/Camera và máy chủ Backend đồng bộ NTP với độ lệch thực tế `<= 2000ms`.
- [ ] **Kiểm thử Bộ dữ liệu Hiện trường (`G3 Field Benchmark`)**: Chạy tối thiểu 50 lượt qua cổng thực tế cho mỗi chế độ (`pedestrian`, `motorcycle` có mũ bảo hiểm/kính trong, `car`, `truck`) để xác nhận tỷ lệ khớp khuôn mặt `1:1` và ALPR thực địa đạt ngưỡng vận hành.
- [ ] **Kiểm thử Cắt cáp / Mất kết nối Barrier vật lý**: Rút thử kết nối relay/Modbus của barrier trong lúc xác minh để xác nhận hệ thống chuyển về `OUTCOME_UNKNOWN` và giữ cổng đóng an toàn (`Fail-Closed`).

---

## 3. Xác nhận Ranh giới Phạm vi Core vs. Các Gói Mở rộng Độc lập (`E1` / `E2` — Task `11.11`)

1. **Độc lập hoàn toàn với Phân hệ Kho (`E1 — Warehouse Dock & Slip Verification`)**:
   - Toàn bộ luồng Cổng Vào/Ra cho nhân viên đi bộ và 3 nhóm phương tiện (`MG3`), Thống kê Hoạt động (`MG4`), AI Assistant (`MG5`) và Cấu hình Thiết bị (`Nhóm 12`) vận hành độc lập, **không yêu cầu đơn hàng kho (`Order`) hay ảnh phiếu xuất kho (`slip_image`) tại Cổng Ra bãi xe**.
   - Các API kho hiện hữu (`/api/v1/warehouse/*`) vẫn được giữ nguyên tính tương thích ngược và hiển thị ở chế độ tra cứu chỉ đọc trên `WarehousePage`. Nếu doanh nghiệp mở rộng quy trình điều phối bến xuất hàng (`Dock`) trên giao diện mới, phần đó sẽ được tách thành change độc lập **`E1`**.
2. **Độc lập hoàn toàn với Phân hệ Nhận diện Hành vi Video (`E2 — Video Action Recognition`)**:
   - Việc nhận diện hành vi bốc xếp hàng hóa qua luồng video liên tục không nằm trong đường găng phát hành Core Access & Console Migration và sẽ được quản lý trong change độc lập **`E2`** khi có yêu cầu triển khai.
