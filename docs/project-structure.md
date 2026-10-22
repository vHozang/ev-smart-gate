# Cấu trúc Dự án & Quy tắc Phụ thuộc (Clean Architecture + React SPA)

| Thuộc tính | Giá trị |
| --- | --- |
| **Mã tài liệu** | `EVSG-STRUCT-2026-V2` |
| **Phiên bản** | `2.0` — Bao phủ cả Backend (`src/smart_gate/`) và React Frontend (`frontend/`) |
| **Tài liệu liên kết** | [BRD chuẩn AI](BRD.md) · [Thiết kế hệ thống](smart-gate-system-design.md) · [Kiến trúc Frontend](frontend-architecture.md) · [Hướng dẫn phát triển](development.md) |

---

## 1. Sơ đồ Cây Thư mục Tổng thể

```text
ev-smart-gate/
├── src/
│   ├── smart_gate/                  # Backend FastAPI theo Clean Architecture
│   │   ├── domain/                  # Entities, Value Objects, Enums, Domain Services, Exceptions, Protocol Ports
│   │   ├── application/             # Use Cases, Policy Orchestration, Grounding Validators, Application DTOs
│   │   ├── infrastructure/          # Adapters hiện thực Protocol Ports của Domain
│   │   │   ├── database/            # Beanie Documents, MongoDB Repositories, MongoUnitOfWork, Migrations
│   │   │   ├── devices/             # Barrier HTTP Adapter / Simulator, Capture Gateway Validator
│   │   │   ├── realtime/            # WebSocket Hub fan-out, Sequence Counter & AlertDelta Outbox
│   │   │   ├── security/            # AES-256-GCM (Evidence/Embedding), Argon2 (Password), HMAC-SHA256
│   │   │   ├── signing/             # Compact JWS Ed25519 (Exit Slip & Operator Auth Keys), QR/HTML/PDF
│   │   │   ├── storage/             # MinIO Private Bucket Adapter
│   │   │   └── vision/              # YuNet/SFace (Face 1:1), FastALPR/PaddleOCR (Plate), YOLOX (Cargo), PyZbar
│   │   ├── presentation/            # FastAPI Routers, Pydantic v2 Schemas, Auth/RBAC Dependencies, Error Handlers
│   │   │   ├── contracts/           # Target Migration DTO Contracts (M0)
│   │   │   └── static/              # Legacy Vanilla JS SPA (Giữ phục vụ rollback có thời hạn trong cửa sổ chuyển đổi)
│   │   ├── bootstrap/               # Composition Root (Dependency Injection) & FastAPI Lifespan
│   │   └── main.py                  # FastAPI App Entrypoint
│   └── edge_agent/                  # Edge Snapshot/RTSP Collector, RFID Reader Integration & Retry Client
├── frontend/                        # React 19 + TypeScript Strict + Vite SPA (Độc lập với package gốc)
│   ├── src/
│   │   ├── app/                     # App Providers, Redux Store, QueryClient, Router, Stylesheet Entry
│   │   ├── layouts/                 # AppShell, AuthLayout, ListPageLayout, DetailPageLayout, WorkspaceLayout
│   │   ├── pages/                   # 13 Route Pages (Lazy-loaded qua named exports & routeRegistry)
│   │   ├── widgets/                 # Khối giao diện ghép nối lớn (Sidebar, Topbar, AlertsPanel, VerificationCard...)
│   │   ├── features/                # Nghiệp vụ theo từng miền (auth, users, roles, audit, drivers, vehicles, gate, pedestrian, analytics, assistant, device-settings)
│   │   └── shared/                  # Design System Primitives, DataTable, EvidenceViewer, ModalHost, ToastHost, Axios Transport, Generated API Types & Zod Schemas
│   ├── scripts/                     # Kiểm tra ranh giới kiến trúc (check-boundaries.mjs) & đồng bộ OpenAPI
│   └── tests/                       # Unit/Component Tests (Vitest) & Responsive/A11Y Browser Tests (Playwright)
├── simulators/                      # Camera Simulator & Barrier Simulator phục vụ phát triển/kiểm thử cô lập
├── models/                          # Model Manifest, SHA-256 Checksum, License & Downloader
├── tests/                           # Backend Unit, Contract, Integration & E2E Tests (Pytest)
├── docs/                            # Bộ tài liệu chuẩn BA Thời AI (BRD, HLD, ERD, RTM, Contracts, Diagrams)
├── openspec/                        # Quản lý đặc tả và thay đổi theo Schema intent-driven
├── Dockerfile
└── docker-compose.yml
```

---

## 2. Quy tắc Phụ thuộc Bắt buộc (`Dependency Rules`)

### 2.1. Backend (`src/smart_gate/` — Clean Architecture)
1. **Chiều phụ thuộc duy nhất**: `Presentation -> Application -> Domain <- Infrastructure`.
2. **`Domain` (`src/smart_gate/domain/`)**:
   - Thuần Python (`>= 3.11`); **tuyệt đối không** import FastAPI, Pydantic `BaseModel`, Beanie, PyMongo, MinIO, OpenCV hay bất kỳ thư viện I/O nào.
   - Định nghĩa các `Protocol` ports cho Repositories, `UnitOfWork`, `VisionAdapters`, `BarrierAdapter`, `SlipSigner`, `ModelGateway`, `TokenService`.
3. **`Application` (`src/smart_gate/application/`)**:
   - Chỉ phụ thuộc vào `Domain` và các DTO dữ liệu đầu vào/đầu ra.
   - Chứa toàn bộ luồng điều phối nghiệp vụ (`Use Cases`), `Policy Engine`, kiểm chứng số liệu (`Grounding Validator`) và quyết định `permit_granted`.
4. **`Infrastructure` (`src/smart_gate/infrastructure/`)**:
   - Hiện thực các `Protocol` ports của `Domain`.
   - **Adapters AI (`vision/`, `ModelGateway`) chỉ trả về kết quả quan sát (`Observation`) hoặc bản nháp văn bản**, tuyệt đối không tự gọi `BarrierAdapter` hoặc tự cập nhật trạng thái đơn hàng/quyền hạn trong DB.
5. **`Presentation` (`src/smart_gate/presentation/`)**:
   - Chuyển đổi HTTP/WebSocket/SSE transport thành Application DTO, kiểm tra xác thực/quyền truy cập (`Auth/RBAC Dependencies`) và gọi Use Case; không chứa quy tắc nghiệp vụ.
6. **`Bootstrap` (`src/smart_gate/bootstrap/`)**:
   - Là nơi duy nhất khởi tạo và tiêm (`inject`) các adapter cụ thể vào Use Case.

### 2.2. Frontend (`frontend/` — Feature-Sliced Composition)
1. **Chiều phụ thuộc bắt buộc** (được kiểm tra tự động bằng `node scripts/check-boundaries.mjs`):
   - `app -> layouts / pages -> widgets -> features -> shared`.
   - Tuyệt đối không có phụ thuộc vòng (`circular dependencies`) và không import ngược từ tầng dưới lên tầng trên (ví dụ: `shared` không được import từ `features`, `features` không được import từ `pages`).
2. **Phân tách Quyền sở hữu Trạng thái (`State Ownership`)**:
   - **`TanStack Query`**: Là bộ nhớ đệm trạng thái máy chủ (`Server State`) duy nhất, được phân vùng theo `principal` và `authz_version`.
   - **`Redux Toolkit`**: Chỉ lưu trạng thái giao diện tuần tự hóa được (`Client State`: đóng/mở sidebar, tùy chọn hiển thị không nhạy cảm, vòng đời xác thực); không lưu `Blob`, `AbortController`, callback, danh sách dữ liệu máy chủ hoặc secret/token dài hạn.
   - **RAM-Only Auth State**: `Access JWT` và `card_uid` vừa nhập chỉ giữ tạm thời trong bộ nhớ RAM, không bao giờ ghi xuống `localStorage` hay `sessionStorage`.
3. **Quy ước Import / Export & Styling**:
   - Mỗi thư mục component/layout/page có `index.ts` dùng `named exports` và `export type`; từng page được `lazy-import` trực tiếp trong `routeRegistry`.
   - Dùng một stylesheet entry với semantic CSS tokens dùng chung; Tailwind chỉ dùng để bố cục riêng trên cùng hệ thống biến tokens, không hardcode mã màu hex tùy tiện.
