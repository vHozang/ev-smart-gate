# Môi trường kiểm thử contract thật

MinIO test được build từ release chính chủ `RELEASE.2025-10-15T17-29-55Z` bằng Go 1.24.8, không dùng image bên thứ ba hoặc tag `latest`. Docker Hub và Quay không còn manifest ở tag cũ khi kiểm tra ngày 2026-10-20. Cách build source theo [hướng dẫn release MinIO](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z); Go checksum database kiểm dependency mặc định. Thay đổi này chỉ ở `Dockerfile.contract-minio`/compose test, không đổi runtime production. Lần build đầu tải dependencies và biên dịch có thể lâu.

Stack riêng `ev-smart-gate-react-contract-test` dùng MongoDB replica set, MinIO private và FastAPI thật, không publish host ports. Network nội bộ/volumes/database tách stack production và compose gốc. Người dùng đã chọn bật Docker Desktop/Linux engine để chạy kiểm chứng; chưa có kết quả integration thì MG0 vẫn chưa đạt.

```powershell
.venv\Scripts\python.exe -m scripts.run_contract_checks prepare
.venv\Scripts\python.exe -m scripts.run_contract_checks config
.venv\Scripts\python.exe -m scripts.run_contract_checks run
```

`prepare` sinh secrets ngẫu nhiên tại `.tmp/contract-test.env` đã bỏ qua Git, không in giá trị. `config` chỉ kiểm Compose và không in config có secrets. `run` kiểm engine, build test image, đợi API healthy, chạy contract + integration thật, rồi dừng riêng test project; giữ volumes để xem evidence. Không chạy down/reset/drop của compose production. Có thể dừng riêng stack bằng `stop`.

Image test dùng dependencies từ pyproject.toml. API test dùng vision/barrier simulators để cô lập kiểm thử auth/contracts/DB/storage; **không dùng kết quả này nghiệm thu face/camera bốn mode, actual crossing hoặc model Assistant**. UI vận hành không có mock mode. Các ca Mongo/MinIO kiểm encryption/indexes/transaction và HTTP baseline kiểm roles/session/CSRF qua network thật.

HTTP baseline seed users synthetic ADMIN/WAREHOUSE/SECURITY chỉ khi APP_ENV=test và database có prefix `evsg_contract_test_`; password lấy env, không log/response. Chỉ xóa các user IDs do chính test tạo, không ghi vào DB production hoặc seed nhân viên/biometric thật. Các integration tests hiện có dùng database UUID riêng và cleanup của chúng.

Khi Docker chưa chạy, test integration được skip hoặc runner báo lỗi; đó không là bằng chứng đạt. MG0 cần kết quả thực thi và review contract/policy từ người phụ trách theo proposal. Hardware/calibration G3, benchmark G5 và retention production G6 tiếp tục có gate riêng.
