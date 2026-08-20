# Hướng dẫn phát triển

## Yêu cầu

- Python 3.11; Docker Desktop/Engine và Docker Compose.
- Không dùng Python 3.9 vì `StrEnum` và type syntax của dự án yêu cầu 3.11.
- Khi chạy native, cài ZBar (`brew install zbar` trên macOS hoặc `apt install libzbar0` trên Debian/Ubuntu) để PyZbar đọc QR JWS ổn định.

## Chạy Docker

```bash
docker compose up --build
docker compose --profile edge up --build
```

Public ports: UI + API `8000`, MongoDB `27017`, MinIO `9000/9001`, barrier simulator `18080`, camera simulator `18081`.

Sau khi các container khỏe, mở `http://localhost:8000` và đăng nhập bằng credential local trong `.env.example`. Route `/` là SPA điều hành; route `/docs` vẫn là Swagger dành cho phát triển.

Khi thay đổi file trong `src/smart_gate/presentation/static`, cần rebuild service API vì source không được bind mount trong cấu hình Docker mặc định:

```bash
docker compose up -d --build api
```

## Chạy native

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install --group dev .
cp .env.example .env
uvicorn smart_gate.main:app --reload
```

Tạo secret mới bằng `python scripts/generate_secrets.py`. `.env.example` chỉ dùng local.

## Mô hình AI

```bash
python models/download_models.py
```

Đổi `ALPR_PROVIDER`, `FACE_PROVIDER`, `CARGO_PROVIDER` khỏi `simulated` sau khi model đã sẵn sàng. Real-model smoke test phải chạy riêng vì tải model lớn và phụ thuộc CPU/GPU.

## Cổng chất lượng

```bash
ruff check .
ruff format --check .
mypy src
pytest --cov=smart_gate --cov-report=term-missing
python scripts/export_openapi.py
docker compose config --quiet
node --check src/smart_gate/presentation/static/assets/app.js
```

Node.js chỉ được dùng để kiểm tra cú pháp JavaScript trong quá trình phát triển, không phải dependency runtime của hệ thống.

Ở chế độ AI `simulated`, embedding khuôn mặt được tạo ổn định theo byte ảnh. Nút **Ảnh mẫu** trên UI giúp tái sử dụng đúng dữ liệu cho enrollment và các lượt cổng; ảnh khác nhau được xem là các danh tính mô phỏng khác nhau.

## Quy tắc thay đổi

- Use case mới đi kèm unit test.
- Không thêm business logic vào router hoặc adapter AI.
- Chỉ catch `Exception` tại biên adapter/use case để ghi log và fail-closed; tuyệt đối không biến lỗi thành kết quả `PASSED`.
- Khi thay threshold/model, tăng `threshold_version`/model version để Gate Log truy vết được.
- Không commit fixture có khuôn mặt thật, private key hoặc object dump từ production.
