# Development Guide — Smart Gate & Vehicle Security

Tài liệu mô tả workflow phát triển backend, Edge AI integration và IoT integration.

> **Simulator-first là bắt buộc, không phải tiện nghi.**
> BRD §9 xác định phần cứng (Camera, Server, IoT) là **Out of Scope** — khách hàng tự đầu tư,
> và tại thời điểm này team **chưa biết vendor/model camera cũng như giao thức barrier**
> (`OQ-03`). Vì vậy toàn bộ development phải chạy được end-to-end trên simulator, và
> hardware chỉ là một adapter thay thế. Xem `ADR-006`.

---

## Getting Started

```bash
cp .env.example .env
just setup
```

Kiểm tra:

```bash
uv --version
just --version
docker --version
```

---

## Development Workflows

### 1. Hybrid Local Development — Recommended

Infrastructure chạy Docker, FastAPI chạy local, Camera/Gate dùng simulator.

```bash
just start-infra
just start-simulators
just run-server MODE="dev"
```

Endpoints:

```text
http://localhost:8000
http://localhost:8000/docs
http://localhost:8000/health
```

Phù hợp cho:

- Appointment.
- Access Policy.
- Decision Engine.
- Risk Engine.
- Guard Dashboard API.
- Audit.
- Inventory Matching.

---

### 2. Full Docker Development

```bash
just start-services
```

Dùng để verify:

- Docker networking.
- Worker.
- Event Bus.
- Observability.
- Production-like packaging.

---

### 3. Hardware-in-the-loop Development

```bash
just start-infra
just run-server MODE="dev"
just run-edge MODE="hardware"
```

Environment sẽ trỏ tới:

- RTSP Camera.
- Test Gate Controller.
- Local AI Runtime.
- Test Site Network.

Không dùng production credential ở môi trường developer nếu chưa được cho phép.

---

## Configuration

Settings groups:

```text
AppSettings
DatabaseSettings
RedisSettings
StorageSettings
EventBusSettings
VisionSettings
CameraSettings
GateSettings
InventorySettings
SecuritySettings
TelemetrySettings
RetentionSettings
```

Environment:

```text
APP_ENV=development
APP_ENV=staging
APP_ENV=production
```

Sensitive data không commit:

- Database password.
- Camera credential.
- Gate controller secret.
- Inventory token.
- S3 secret.
- Signing key.

---

## Container Ecosystem

Core:

- PostgreSQL.
- Redis.
- MinIO.
- Message Broker.
- FastAPI Application.
- Event Worker.

Simulation:

- Camera Simulator.
- Gate Simulator.
- Inventory Simulator.
- Notification Simulator.

Observability:

- OpenTelemetry Collector.
- Prometheus.
- Loki.
- Tempo/Jaeger.
- Grafana.

---

## Simulator Scenarios

### Registered Vehicle

```bash
just simulate-entry SCENARIO="registered"
```

Expected:

```text
Plate Match
Face Match
Appointment Valid
LOW Risk
ALLOW
Gate Open
Host Notification
Audit Saved
```

### Unknown Vehicle

```bash
just simulate-entry SCENARIO="unknown-vehicle"
```

Expected: `REVIEW`.

### Face Mismatch

```bash
just simulate-entry SCENARIO="face-mismatch"
```

Expected: `REVIEW` or `BLOCK`.

### Blacklist

```bash
just simulate-entry SCENARIO="blacklist"
```

Expected: `BLOCK + HIGH ALERT`.

### Unregistered Vehicle — BRD §8

```bash
just simulate-entry SCENARIO="unregistered"
```

Expected:

```text
No Appointment
AccessEvent created with appointment_id = NULL
REVIEW_REQUIRED
Guard Alert
```

> BRD §8 yêu cầu cảnh báo bảo vệ khi có phương tiện chưa đăng ký.
> Scenario này verify rằng `appointment_id` nullable — xem `diagrams.md §15`.

### Host Notification — FR04

```bash
just simulate-entry SCENARIO="registered"
```

Expected (ngoài các assertion của scenario `registered`):

```text
Host Notification sent exactly once
Notification NOT sent when decision = BLOCK
```

### Exit Asset Detection

```bash
just simulate-exit SCENARIO="asset-detected-no-voucher"
```

Expected: `REVIEW_REQUIRED`.

### Gate Timeout

```bash
just simulate-gate SCENARIO="timeout"
```

Expected:

- No infinite retry.
- Gate failure persisted.
- Guard alerted.
- Manual fallback available.

---

## Database Management

Create migration:

```bash
just db-migrate-create "add inspection session"
```

Apply:

```bash
just upgrade-db
```

Rollback:

```bash
just db-migrate-rollback
```

Offline SQL:

```bash
just upgrade-db-offline
```

Rules:

- Không sửa migration đã apply ở shared environment.
- Unique constraint cho `event_id`.
- Unique constraint cho `gate_command_id`.
- Index `site_id`, `gate_id`, `occurred_at`, `plate_normalized`.
- Evidence binary không lưu trong transactional DB.

---

## Demo Data

```bash
just seed-demo
```

Seed:

- 1 Site.
- Entry Gate.
- Exit Gate.
- Camera Config.
- Gate Simulator.
- Employees.
- Guests.
- Vehicles.
- Approved Appointment.
- Expired Appointment.
- Rejected Appointment.
- Blacklist.
- Access Events.
- Inspection Samples.
- Export Vouchers.

Deterministic IDs:

```text
VEH-ALLOW-001
VEH-REVIEW-001
VEH-BLOCK-001
VEH-EXIT-001
VEH-EXIT-002
VEH-EXIT-003
```

---

## Code Quality

Install hooks:

```bash
pre-commit install
pre-commit install --hook-type commit-msg
```

Commit format:

```text
<type>(<scope>): <subject>
```

Examples:

```text
feat(access): add appointment validation
feat(inspection): add rescan workflow
fix(iot): make gate command idempotent
fix(vision): normalize license plate
test(access): cover low confidence review
docs(architecture): add edge diagram
```

Recommended scopes:

```text
api
domain
appointment
access
inspection
risk
vision
camera
iot
inventory
storage
audit
observability
tests
docker
ci
docs
```

Run quality:

```bash
just lint
just lint TARGET="mypy"
just lint TARGET="pre-commit"
```

---

## Testing

Unit:

```bash
just test TYPE="unit"
```

Integration:

```bash
just test TYPE="integration"
```

Contract:

```bash
just test TYPE="contract"
```

Coverage:

```bash
just coverage TYPE="all"
```

---

## Edge AI Development

Simulator:

```bash
just run-edge MODE="simulator"
```

Hardware:

```bash
just run-edge MODE="hardware"
```

Fixtures:

```text
tests/fixtures/vision/
├── entry/
│   ├── clear-day/
│   ├── low-light/
│   ├── motion-blur/
│   └── occluded-face/
└── exit/
    ├── empty-cargo/
    ├── known-asset/
    ├── unknown-object/
    └── partial-occlusion/
```

Không đưa biometric data thật lên repository công khai.

---

## Debugging Access Decisions

Một decision cần truy vết theo:

```text
correlation_id
event_id
access_event_id
gate_command_id
```

Thông tin cần inspect:

```text
AI Event
Plate Normalized
Plate Confidence
Face Candidate
Face Similarity
Appointment
Policy Version
Risk Factors
Decision
Guard Action
Gate Command
Audit
```

---

## Observability

Local endpoints đề xuất:

```text
Swagger       http://localhost:8000/docs
Health        http://localhost:8000/health
Grafana       http://localhost:3000
MinIO Console http://localhost:9001
```

Structured logs:

```text
timestamp
level
service
correlation_id
site_id
gate_id
event_id
access_event_id
message
```

Không log:

- Raw CCCD.
- Face embedding.
- Secret.
- Camera password.
- Long-lived signed URL.

---

## Hardware Safety Rules

- Simulator là default.
- Hardware command chỉ enable khi cấu hình explicit.
- Production credentials không nằm trong `.env.example`.
- Physical emergency control phải luôn tồn tại.
- Auto-open test chỉ chạy ở lane đã được phép.
- Destructive hardware test chỉ chạy trong maintenance window.
- Mọi HIL test phải có test case và operator.
