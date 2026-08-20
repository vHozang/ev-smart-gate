# Cấu trúc dự án

```text
ev-smart-gate/
├── src/
│   ├── smart_gate/
│   │   ├── domain/              # Entity, enum, service, exception, Protocol
│   │   ├── application/         # DTO và use case độc lập
│   │   ├── infrastructure/
│   │   │   ├── database/        # Beanie documents, repositories, UoW
│   │   │   ├── devices/         # Barrier HTTP/simulator
│   │   │   ├── realtime/        # Hub fan-out
│   │   │   ├── security/        # AES-GCM, Argon2, HMAC
│   │   │   ├── signing/         # JWS Ed25519, QR/HTML/PDF
│   │   │   ├── storage/         # MinIO private evidence
│   │   │   └── vision/          # ALPR, face, cargo, QR
│   │   ├── presentation/        # FastAPI router/schema/dependency/error
│   │   │   └── static/          # SPA điều hành, CSS và JavaScript module
│   │   ├── bootstrap/           # Composition root và lifespan
│   │   └── main.py
│   └── edge_agent/              # Snapshot/RTSP và API client retry
├── simulators/                  # Camera và barrier
├── models/                      # Manifest, checksum, license, downloader
├── tests/                       # Unit, contract, integration, E2E
├── docs/                        # BRD/HLD/ERD/RTM/contract
├── openspec/                    # Change và scenario
├── Dockerfile
└── docker-compose.yml
```

## Dependency rule

- Domain không import FastAPI, Pydantic BaseModel, Beanie, MinIO hoặc OpenCV.
- Application chỉ dùng Domain entity/Protocol và DTO Pydantic.
- Infrastructure hiện thực Protocol; không quyết định mở cổng.
- Presentation chuyển transport thành DTO và gọi use case; không chứa business rule.
- SPA gọi API cùng origin; không chứa device key hoặc quyết định mở barrier.
- Bootstrap là nơi duy nhất chọn adapter cụ thể.
