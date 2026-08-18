# Smart Gate Architecture Documentation

Bộ tài liệu cho dự án **AI-Powered Vehicle Gate Control and Inventory Management System**
— Tổng Công ty Điện lực.

> ⚠️ **Trạng thái dự án: `DRAFT / PROPOSED`.**
> Chưa có Official Requirement bằng văn bản từ khách hàng (`OQ-01`).
> Chỉ **2/6 module** đã được khách xác nhận: *Nhận diện AI (FR02)* và *Điều khiển Cổng (FR03)*.
> Bộ tài liệu này **chưa đủ điều kiện làm cơ sở estimate hợp đồng**.

## Documents

| # | Tài liệu | Nội dung | Đối tượng |
|---|---|---|---|
| 0 | *BRD (bên ngoài repo)* | Nguồn yêu cầu gốc từ khách hàng | Tất cả |
| 1 | `requirements-traceability.md` | **RTM** — BR/FR → Use Case → Component, trạng thái từng hạng mục, Open Questions, Assumptions, Risks | BA, PM, Client |
| 2 | `smart-gate-system-design.md` | Business System + High-Level Design + AI/IoT Architecture + ADR + Milestones | BA, Architect, Tech Lead |
| 3 | `diagrams.md` | Use Case (UML), AS-IS/TO-BE, Component, State Machine, Sequence, Class Diagram | Tất cả |
| 4 | `data-model-erd.md` | **ERD** — bảng, kiểu dữ liệu, PK/FK, index, constraint, phân loại PII & retention | Backend Dev, DBA |
| 5 | `project-structure.md` | Clean Architecture + DDD project structure, Implementation Priority | Backend Dev |
| 6 | `development.md` | Development workflow, simulator, testing, observability | Backend Dev, DevOps |
| 7 | `clean-architecture-fastapi-smart-gate-prompt.md` | Prompt/spec để generate backend codebase | Backend Dev |
| 8 | `frontend-architecture.md` | Monorepo, 3 app (Portal/Guard Dashboard/Admin Portal), Composition Pattern, WebSocket reliability, Auth/RBAC, ADR-007..013 | Frontend Dev, Tech Lead |

> **Class Diagram (`diagrams.md §15`) ≠ ERD (`data-model-erd.md`).**
> Cái đầu là domain model có behavior (dùng cho Domain layer);
> cái sau là physical schema có kiểu dữ liệu và ràng buộc (dùng cho Infrastructure layer).

## Xem sơ đồ

Sơ đồ viết bằng Mermaid và PlantUML — VSCode **không render sẵn**, cần extension:

```bash
code --install-extension bierner.markdown-mermaid   # Mermaid  → Ctrl+Shift+V
code --install-extension jebbs.plantuml             # PlantUML → Alt+D
```

Các sơ đồ UML thuần (Use Case, Class Diagram) đều có **cả bản Mermaid lẫn PlantUML**.

## Recommended Reading Order

```text
BRD  (nguồn yêu cầu của khách hàng)
        ↓
requirements-traceability.md      ← BẮT BUỘC đọc trước tài liệu kỹ thuật
        ↓
smart-gate-system-design.md
        ↓
diagrams.md
        ↓
data-model-erd.md
        ↓
project-structure.md
        ↓
frontend-architecture.md
        ↓
development.md
        ↓
clean-architecture-fastapi-smart-gate-prompt.md
```

## Change Control

Mọi thay đổi scope phải đi theo đúng thứ tự dưới đây. Sửa tài liệu kỹ thuật trước
khi cập nhật RTM sẽ làm mất khả năng truy vết hạng mục nào đã được khách duyệt.

```text
BRD (khách ký) → RTM → System Design → Diagrams → ERD → Project Structure / Prompt
```

## Ký hiệu dùng chung

| Ký hiệu | Ý nghĩa |
|---|---|
| `FR01`–`FR07` | Functional Requirement (BRD §5) |
| `BR-01`–`BR-06` | Business Requirement / Module (BRD §4) |
| `DA-01`–`DA-08` | `DESIGN-ADDED` — team bổ sung, **chưa có trong BRD** |
| `OQ-01`–`OQ-08` | Open Question — chờ khách trả lời |
| `A-01`–`A-05` | Assumption |
| `R-01`–`R-08` | Risk |
| `M0`–`M6` | Delivery Milestone (mốc kỹ thuật, khác Phase thương mại) |
| Phase 1 / Phase 2 | Phase **thương mại** theo BRD |
