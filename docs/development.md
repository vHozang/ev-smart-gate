# Hướng dẫn Phát triển, Vận hành & Cổng Chất lượng (`Quality Gates`) — EV Smart Gate

| Thuộc tính | Giá trị |
| --- | --- |
| **Mã tài liệu** | `EVSG-DEV-2026-V2` |
| **Phiên bản** | `2.0` — Hướng dẫn đầy đủ cho cả **Backend FastAPI (`src/`)** và **React Console (`frontend/`)** |
| **Tài liệu liên kết** | [BRD chuẩn AI](BRD.md) · [Cấu trúc dự án](project-structure.md) · [Môi trường test](contracts/test-environment.md) · [Bàn giao Backend](contracts/backend-handoff.md) |

---

## 1. Yêu cầu Môi trường

- **Backend**: Python `>= 3.11, < 3.14` (không dùng Python 3.9/3.10 vì dự án sử dụng `StrEnum` và cú pháp kiểu của Python 3.11+); Docker Desktop / Docker Engine và Docker Compose.
- **Thư viện hệ thống cho QR**: Khi chạy native, cài đặt `ZBar` (`brew install zbar` trên macOS hoặc `apt install libzbar0` trên Debian/Ubuntu) để `PyZbar` giải mã phiếu xuất kho `JWS Ed25519` ổn định.
- **Frontend (`frontend/`)**: Node.js `>= 20 LTS` và `npm` (sử dụng lockfile riêng tại `frontend/package-lock.json`).

---

## 2. Khởi chạy Hệ thống bằng Docker Compose

```powershell
docker compose up --build
docker compose --profile edge up --build
```

- **Các cổng dịch vụ mặc định**:
  - API + Giao diện điều hành: `http://localhost:8000` (Swagger UI cho phát triển tại `http://localhost:8000/docs`)
  - MongoDB Replica Set: `27017`
  - MinIO Storage / Console: `9000` / `9001`
  - Barrier Simulator: `18080`
  - Camera Simulator: `18081`

---

## 3. Phát triển Cục bộ (Native Development)

### 3.1. Chạy Backend (`src/smart_gate/`)
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --group dev .
Copy-Item .env.example .env
python scripts/generate_secrets.py
uvicorn smart_gate.main:app --reload
```

### 3.2. Tải Mô hình AI Thị giác
```powershell
python models/download_models.py
```
- Sau khi tải và kiểm tra checksum mô hình thành công, chuyển `ALPR_PROVIDER`, `FACE_PROVIDER`, `CARGO_PROVIDER` trong `.env` khỏi giá trị `simulated`.
- Ở chế độ `simulated` (dùng cho kiểm thử luồng cô lập), vector khuôn mặt được sinh tất định theo byte ảnh; không dùng kết quả `simulated` để nghiệm thu độ chính xác AI thực địa (`Gate G3` / `MG3`).

### 3.3. Chạy React Frontend (`frontend/`)
```powershell
cd frontend
npm ci
npm run dev
```

---

## 4. Cổng Chất lượng Bắt buộc (`Mandatory Quality Gates`)

Trước khi đánh dấu hoàn thành bất kỳ task nào hoặc bàn giao giữa các Agents, bắt buộc phải chạy và đạt `100%` các lệnh kiểm tra tương ứng dưới đây:

### 4.1. Cổng Chất lượng Backend (`pyproject.toml`)
```powershell
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy src
.\.venv\Scripts\python.exe -m pytest --cov=smart_gate --cov-report=term-missing
.\.venv\Scripts\python.exe scripts/export_openapi.py --check
.\.venv\Scripts\python.exe scripts/export_api_inventory.py --check
.\.venv\Scripts\python.exe scripts/export_migration_contracts.py --check
docker compose config --quiet
```

### 4.2. Cổng Chất lượng Contract & Integration Thật (Cô lập với Production)
Xem chi tiết tại [`docs/contracts/test-environment.md`](file:///e:/ev-smart-gate/docs/contracts/test-environment.md):
```powershell
.\.venv\Scripts\python.exe -m scripts.run_contract_checks prepare
.\.venv\Scripts\python.exe -m scripts.run_contract_checks config
.\.venv\Scripts\python.exe -m scripts.run_contract_checks run
```

### 4.3. Cổng Chất lượng React Frontend (`frontend/package.json`)
```powershell
cd frontend
npm run typecheck
npm run lint
node scripts/check-boundaries.mjs
npm run api:check
npm run format:check
npm test
npm run build
npx playwright test
```

---

## 5. Quy tắc Bắt buộc khi Thay đổi Code & Tài liệu (`BA & Engineering Discipline`)

1. **Mỗi Use Case mới phải đi kèm Unit Test** và các kịch bản kiểm thử phủ định (`Negative Test Cases`: `TC-NEG-01..08`, `FE-NEG-01..08`).
2. **Không đưa quy tắc nghiệp vụ vào Router hoặc Adapter AI**: AI chỉ tạo `observation` / `GroundedReportResult` nháp; mọi quyết định mở cổng hoặc công bố báo cáo phải đi qua `Application Use Case` và `Policy/Grounding Validator`.
3. **Luôn Fail-Closed**: Chỉ bắt ngoại lệ tại biên Adapter/Use Case để ghi log và trả về trạng thái từ chối an toàn; **tuyệt đối không** biến lỗi thành `PASSED` hoặc tự động mở barrier.
4. **Truy vết Phiên bản (`Versioned Provenance`)**: Khi thay đổi ngưỡng nhận diện, mô hình hoặc công thức thống kê, bắt buộc tăng `threshold_version`, `model_version` hoặc `metric_definition_version`.
5. **Bảo mật Kho mã nguồn**: Tuyệt đối không commit ảnh khuôn mặt thật, dữ liệu sinh trắc học thật, khóa bí mật (`private key`, `.env` thật) hoặc bản dump dữ liệu từ môi trường production vào Git.
