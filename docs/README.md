# Bộ Tài liệu Dự án EV Smart Gate (Chuẩn BA Thời AI 2026)

Thư mục `docs/` chứa toàn bộ đặc tả yêu cầu nghiệp vụ, kiến trúc hệ thống, mô hình dữ liệu, hợp đồng API và ma trận truy vết của hệ thống **EV Smart Gate** (đã được chuẩn hóa theo khung **Bộ Tài Liệu 2: Đặc tả Hệ thống BA Thời AI — OJT 2026 Mức 4** và **Bộ Tài Liệu 4: ReactJS AI-First UX**).

---

## 1. Tài liệu Nền tảng & Đặc tả Hệ thống (Dành cho BA, Backend Agent, Frontend Agent & QA)

| Tài liệu | Nội dung chính | Đối tượng cần đọc |
| :--- | :--- | :--- |
| [**`BRD.md`**](BRD.md) | **Tài liệu Đặc tả Yêu cầu Nghiệp vụ & Hệ thống AI (AI-Ready BRD v2.0)**: Problem Statement, Scope (Core vs. Extension), **3 Feature Discovery Canvas**, **AI Permission Matrix**, **Data Classification Matrix (4 cấp)**, **4 Use Cases chuẩn 14 mục (`UC-AI-01..04`)**, **Safe Flow 4 Lớp Khóa**, **Output JSON Schemas (`additionalProperties: false`)**, **Bảng NFR-AI (`NFR-AI-001..008`)**, **Decision Gates (`G1–G7`)**, **Acceptance Criteria (`GIVEN/WHEN/THEN`)**, **Bộ Negative Test Cases (`TC-NEG-01..08`)** và Checklist cho Agents. | **Tất cả** (BA, Backend Agent, Frontend Agent, QA/Tester) |
| [**`smart-gate-system-design.md`**](smart-gate-system-design.md) | **Thiết kế Hệ thống Mức cao (HLD v2.0)**: Kiến trúc Clean Architecture, ranh giới tin cậy (Trust Boundaries), luồng Cổng Phương tiện (3 nhóm xe), Cổng Nhân viên Đi bộ (4 yếu tố), Thống kê & AI Assistant nội bộ (SSE + Grounding), Cấu hình Thiết bị (`Desired vs. Applied`), Auth JWT v2 / RBAC, WebSocket Delta Resync và Ma trận Chế độ Lỗi (`Fail-Closed`). | Backend Agent, Frontend Agent, Solution Architect |
| [**`data-model-erd.md`**](data-model-erd.md) | **Mô hình Dữ liệu MongoDB & ERD Logic (v2.0)**: Sơ đồ ERD tổng thể tách biệt danh tính vật lý (`Driver/EmployeeRegistry`) và tài khoản vận hành (`User`), chi tiết **13 Collections Baseline v1** và **Các Collections Mở rộng v2** (`BE-01..BE-07`) kèm Indexes, Giao dịch (`MongoUnitOfWork`) và Cấp độ Bảo mật từng bảng. | Backend Agent, Database/Security Engineer |
| [**`requirements-traceability.md`**](requirements-traceability.md) | **Ma trận Truy vết Yêu cầu (AI-Ready RTM v2.0)**: Liên kết từ `Business Goal` $\rightarrow$ `Requirement ID` $\rightarrow$ `BA Control Lock` $\rightarrow$ `Code Backend / Frontend` $\rightarrow$ `Test Case ID` (`TC-NEG-*`, `FE-NEG-*`, `DOD-FE-AI-*`) $\rightarrow$ `Metric nghiệm thu` & `Trạng thái Milestone Gate (MG0–MG6)`. | BA, QA/Tester, Tech Lead |
| [**`frontend-architecture.md`**](frontend-architecture.md) | **Báo cáo Khám phá & Thiết kế Kiến trúc React Frontend (v1.4)**: Thiết kế chi tiết SPA React + TypeScript strict + Vite, Redux Toolkit, TanStack Query, Axios, Design System, AppShell, RBAC UX, Dashboard, AI Assistant và kế hoạch migration. | Frontend Agent, Backend Agent |
| [**`frontend-progress.md`**](frontend-progress.md) | **Báo cáo Tiến độ Thực thi Frontend (`MG2 Đạt`)**: Tổng hợp các phân hệ UI, Hooks, Zod Schemas, `122` Unit/Component Tests và `33` Playwright Browser Tests đã hoàn thành tại `frontend/`. | Frontend Agent, Project Manager |
| [**`clean-architecture-fastapi-smart-gate-prompt.md`**](clean-architecture-fastapi-smart-gate-prompt.md) | **Prompt Chuẩn & Checklist Giao việc cho Backend Agent & Frontend Agent**: Bản chỉ thị dùng ngay để giao cho các AI Coding Agents tiếp tục hoàn thiện Backend (`BE-01..BE-07`) và tích hợp E2E trên Frontend. | Người điều phối (User), Backend Agent, Frontend Agent |
| [**`project-structure.md`**](project-structure.md) | Cấu trúc thư mục của cả `src/smart_gate/` (Backend Clean Architecture) và `frontend/` (React Feature-Sliced Composition) cùng quy tắc phụ thuộc (`Dependency Rules`). | Backend Agent, Frontend Agent |
| [**`development.md`**](development.md) | Hướng dẫn cài đặt môi trường, chạy Docker Compose, chạy native, tải mô hình AI và các lệnh kiểm tra cổng chất lượng (`Quality Gates`) cho cả Backend và Frontend. | Developer, DevOps, QA |
| [**`diagrams.md`**](diagrams.md) | Sơ đồ Mermaid và liên kết tới các sơ đồ tương tác Archify HTML (`docs/diagrams/`). | Tất cả |

---

## 2. Tài liệu Hợp đồng API & Phối hợp Liên Đội (`docs/contracts/`)

| Tài liệu | Vai trò trong quy trình Contract-First |
| :--- | :--- |
| [**`contracts/migration-v1.md`**](contracts/migration-v1.md) | Đặc tả hợp đồng chi tiết đã chốt ở **MG0**: Versioning, Auth JWT v2 & Rotation (`G1`), Dynamic RBAC (`G2`), Identity/Capture/Verify (`G3`), Cursor Pagination, Error Envelope, WebSocket `AlertDelta`, Analytics (`G4`) và AI Assistant Lifecycle (`G5/G6`). |
| [**`contracts/frontend-api-gaps.md`**](contracts/frontend-api-gaps.md) | Danh mục các API Frontend đang sử dụng (`v1`) và **8 nhóm khoảng trống API (`FE-G01` đến `FE-G08`)** cần Team Backend bàn giao để gỡ cờ `unavailable` và chạy E2E thật. |
| [**`contracts/backend-handoff.md`**](contracts/backend-handoff.md) | Bảng phân rã **7 gói công việc Backend (`BE-01` đến `BE-07`)** kèm thứ tự triển khai và điều kiện nghiệm thu cho từng Milestone Gate (`MG1–MG6`). |
| [**`contracts/migration.openapi.json`**](contracts/migration.openapi.json) | Đặc tả OpenAPI mục tiêu (49 HTTP operations + WS v2) dùng để đối chiếu contract và sinh DTO. |
| [**`contracts/permission-seed.json`**](contracts/permission-seed.json) | Danh mục quyền (`Permission Catalog`) chuẩn và ánh xạ quyền baseline cho `ADMIN`, `WAREHOUSE`, `SECURITY`. |
| [**`contracts/test-environment.md`**](contracts/test-environment.md) | Hướng dẫn chạy môi trường kiểm thử contract/integration cô lập (`MongoDB Replica Set + MinIO + FastAPI thật`). |
| [**`openapi.json`**](openapi.json) | Snapshot OpenAPI runtime hiện tại của ứng dụng FastAPI (44 HTTP operations). |

> **Lưu ý**: Các sơ đồ HTML tương tác trong `docs/diagrams/*.html` là artifacts được quản lý riêng, không tự động ghi đè.
