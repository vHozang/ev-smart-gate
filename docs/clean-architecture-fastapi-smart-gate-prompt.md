# Production Backend Generation Prompt — Smart Gate & Vehicle Security

You are a Senior Python Software Architect with expertise in Enterprise Architecture, Clean Architecture, DDD, FastAPI, Computer Vision Backend, Edge AI Integration, Event-Driven Architecture, IoT Gate Control, and Security Systems.

Your task is to generate a production-ready backend codebase for:

> **AI-Powered Vehicle Gate Control and Inventory Management System — Tổng Công ty Điện lực**

---

# Requirement Status — READ FIRST

This project's BRD is still `DRAFT / PROPOSED`. Only **2 of 6 business modules are CONFIRMED**
by the client. Generate code accordingly:

| Area | BRD FR | Status | Generation guidance |
|---|---|---|---|
| License Plate Recognition + Face Verification | FR02 | **`CONFIRMED`** | Full implementation |
| Access Decision + Gate Control + Guard Review | FR03 | **`CONFIRMED`** | Full implementation |
| Visitor / Vehicle / Appointment Registration | FR01 | `PROPOSED` | Full implementation, but keep the domain model conservative — schema may change |
| Host Notification | FR04 | `PROPOSED` | Implement behind `NotificationGateway` only |
| Exit Inspection + Object Detection | FR05 | `PROPOSED` | Implement orchestration and ports; do **not** hard-code accuracy thresholds |
| Export Voucher Matching | FR06 | `PROPOSED`, Phase 2 | Ports + Protocols only. No concrete `InventoryGateway` implementation — the client has not provided an API contract |
| Vehicle Tracking in parking area | FR07 | `NEEDS CONFIRMATION` | **Do not generate.** Not yet scoped |

Hardware (cameras, servers, IoT gate controllers) is **Out of Scope** — supplied by the client,
vendor unknown. Therefore every device interaction MUST go through a Gateway Protocol with at
least one simulator implementation. Never assume a specific camera SDK or barrier protocol.

Full traceability: `docs/requirements-traceability.md`.

---

# Tech Stack

- Python 3.14+
- FastAPI
- Pydantic v2
- SQLAlchemy 2.0 async
- Alembic
- PostgreSQL
- Redis (`redis.asyncio`)
- Dishka
- uv
- just
- pytest
- Ruff
- mypy
- structlog
- httpx
- Object Storage compatible with S3
- Message Broker abstraction
- OpenTelemetry
- Optional ONNX Runtime / TensorRT adapters in Infrastructure only

---

# Architecture

Use Clean Architecture.

```text
Presentation
    ↓
Application
    ↓
Domain
    ↑
Infrastructure
```

The Domain layer MUST NOT import:

- FastAPI
- SQLAlchemy
- Redis
- Pydantic BaseModel
- OpenCV
- ONNX Runtime
- TensorRT
- Camera SDK
- MQTT library
- PostgreSQL driver
- HTTP client
- Object Storage SDK
- Any vendor-specific library

Business logic must not depend on frameworks.

---

# Core Domain

The system contains the following business areas:

1. Visitor / Appointment Management
2. Vehicle Management
3. Access Control
4. AI Observation Processing
5. Risk Assessment
6. Gate Control
7. Exit Vehicle Inspection
8. Security Alert Review
9. Evidence Management
10. Export Voucher Matching
11. Audit
12. Multi-site Device Configuration

---

# Entities

Use pure Python dataclasses.

Suggested entities:

```text
User
Vehicle
Appointment
AppointmentApproval
AccessEvent
AccessDecisionRecord
InspectionSession
DetectedObject
SecurityAlert
GuardReview
Asset
ExportVoucher
ExportVoucherItem
Evidence
GateCommand
Site
Gate
Lane
CameraDevice
```

---

# Value Objects

Suggested:

```text
LicensePlate
ConfidenceScore
FaceSimilarity
RiskScore
TimeWindow
Direction
AccessDecision
AppointmentStatus
InspectionStatus
GateStatus
DeviceId
SiteId
GateId
```

Value Objects must validate invariants without depending on Pydantic.

---

# Domain Services

Business rules belong here.

```text
AccessPolicyService
RiskAssessmentService
InspectionPolicyService
ExportVoucherMatchingService
AppointmentValidityService
```

Example responsibility:

`RiskAssessmentService` receives business facts and returns:

```text
RiskScore
RiskLevel
RiskReasons
```

It must not call database, Redis or AI models.

---

# Important Rule: AI Result != Access Decision

AI gateways only return observations.

Example:

```json
{
  "plate": "51A12345",
  "plate_confidence": 0.97,
  "face_candidate_id": "person_001",
  "face_similarity": 0.94
}
```

AI MUST NOT return:

```json
{
  "open_gate": true
}
```

Access Decision is produced by Domain/Application rules.

---

# Human-in-the-loop

Supported decisions:

```text
ALLOW
REVIEW
BLOCK
```

Guard actions:

```text
APPROVE
REJECT
RESCAN
MANUAL_OVERRIDE
```

Any low-confidence AI result must be able to transition to `REVIEW`.

Manual Override must store:

```text
operator_id
reason
timestamp
previous_decision
final_decision
```

---

# Entities vs DTOs vs API Schemas vs ORM

## Domain Entities

`app/domain/entities/`

- Pure dataclasses.
- No Pydantic.
- No ORM.
- No serialization concerns.

## Application DTOs

`app/application/dto/`

- Pydantic v2.
- Input/output of UseCases.

## Presentation Schemas

`app/presentation/api/schemas/`

- FastAPI request/response models.
- Must not be reused as domain entities.

## ORM Models

`app/infrastructure/database/models/`

- SQLAlchemy only.
- Must not leak into Application or Domain.

---

# Folder Structure

```text
app/
├── domain/
│   ├── entities/
│   ├── value_objects/
│   ├── services/
│   ├── repositories/
│   ├── gateways/
│   └── exceptions/
│
├── application/
│   ├── dto/
│   ├── use_cases/
│   ├── interfaces/
│   └── mappers/
│
├── infrastructure/
│   ├── database/
│   │   ├── models/
│   │   ├── session.py
│   │   └── unit_of_work.py
│   ├── repositories/
│   ├── cache/
│   ├── vision/
│   │   ├── lpr/
│   │   ├── face/
│   │   └── object_detection/
│   ├── camera/
│   ├── iot/
│   ├── messaging/
│   ├── storage/
│   ├── notification/
│   └── external_api/
│
├── presentation/
│   ├── api/
│   │   ├── schemas/
│   │   └── routers/
│   ├── realtime/
│   └── middleware/
│
├── bootstrap/
├── config/
└── shared/

edge_agent/
├── pipeline/
├── runtime/
├── transport/
└── main.py

simulators/
├── camera_event_simulator.py
├── gate_controller_simulator.py
└── inventory_api_simulator.py

tests/
├── unit/
├── integration/
└── contract/
```

---

# Repository Pattern

Domain repository Protocols:

```text
AppointmentRepository
VehicleRepository
AccessEventRepository
InspectionRepository
AlertRepository
ExportVoucherRepository
UnitOfWork
```

Application UseCases must depend on UnitOfWork and Protocols, never directly on `AsyncSession`.

---

# Gateway Ports

Define Protocols:

```text
CacheGateway
LicensePlateRecognitionGateway
FaceVerificationGateway
ObjectDetectionGateway
CameraGateway
GateControllerGateway
NotificationGateway
EvidenceStorageGateway
InventoryGateway
EventBusGateway
```

Implementations live in Infrastructure.

---

# Device Adapter Rule

Application must not know Modbus/MQTT/vendor-specific protocol.

Correct:

```python
class OpenGateUseCase:
    def __init__(self, gate: GateControllerGateway):
        self._gate = gate
```

Wrong:

```python
mqtt.publish("plc/gate/open", ...)
```

inside Application.

---

# Edge AI Rule

Edge Agent is responsible for:

```text
RTSP ingest
Frame sampling
Vehicle detection
LPR
Face verification
Object detection
Evidence capture
AI event publishing
Heartbeat
```

Edge Agent must not:

```text
Validate Appointment
Calculate Risk
Check Blacklist
Decide Access
Open Gate directly
```

---

# Event Contract

AI events must include:

```text
event_id
event_type
site_id
gate_id
lane_id
camera_id
occurred_at
observations
confidence
evidence_refs
model_versions
```

Use idempotency to prevent duplicate processing.

---

# Access Event

`AccessEvent` is the core aggregate for gate movement.

It records:

```text
vehicle
person
appointment
entry/exit direction
AI observations
risk score
decision
decision reasons
guard action
gate command
evidence
timestamps
```

---

# Risk Engine

Implement deterministic rules.

Example policy:

```text
Appointment Valid         -20
Plate Match               -20
Face Match                -20
Unknown Vehicle           +30
Face Low Confidence       +25
Appointment Expired       +40
Blacklist                 +100
Suspicious Object         +40
No Export Voucher         +30
Voucher Mismatch          +60
```

Thresholds are configuration, not hard-coded business constants.

These numbers are **initial proposals only** and must be calibrated during PoC.
The risk engine exists because the BRD only says *"đánh cờ và gửi cảnh báo"* — without a
quantified score the guard gets spammed with false alarms and stops trusting the system.
Every score contribution must be returned as a named reason so a guard can see *why*
a vehicle was flagged.

---

# Entry Use Case

Expected flow:

```text
Receive Edge Observation
    ↓
Idempotency Check
    ↓
Resolve Vehicle
    ↓
Resolve Person
    ↓
Resolve Appointment
    ↓
Validate Time Window
    ↓
Check Blacklist
    ↓
Risk Assessment
    ↓
ALLOW / REVIEW / BLOCK
    ↓
Persist AccessEvent
    ↓
Publish Gate Command or Guard Review Event
```

---

# Exit Inspection Use Case

Expected flow:

```text
Resolve Vehicle
    ↓
Resolve Open Access Event
    ↓
Create Inspection Session
    ↓
Capture Evidence
    ↓
Object Detection
    ↓
Optional Export Voucher
    ↓
Asset Matching
    ↓
Risk Assessment
    ↓
Approve / Review / Block
```

---

# Evidence

Evidence binary must be stored in Object Storage.

Database stores only metadata/reference:

```text
evidence_id
object_key
hash
camera_id
captured_at
retention_class
access_classification
```

---

# Security

Required:

- TLS.
- RBAC.
- Least Privilege.
- Audit Log.
- Secret Management.
- Signed Evidence URLs.
- Device credential isolation.
- Network segmentation.
- Rate limiting.
- Idempotency.
- Data retention.
- Encryption at rest.
- Manual override auditing.

Never log:

- Raw CCCD.
- Face embedding.
- Password.
- Camera credential.
- API Secret.

---

# Dependency Injection

Use Dishka.

`Scope.APP`:

```text
Settings
Logger
Redis Pool
HTTP Client
Object Storage Client
Event Bus
Vision SDK Clients
Model Registry
```

`Scope.REQUEST`:

```text
AsyncSession
UnitOfWork
Repositories
UseCases
```

Long-running workers use their own explicit lifecycle.

---

# Testing

## Unit

No external dependencies.

Use:

```text
FakeUnitOfWork
FakeRepositories
FakeGateController
FakeEventBus
FakeInventoryGateway
FakeVisionGateway
```

## Integration

Use real:

```text
PostgreSQL
Redis
Object Storage
FastAPI
```

via Testcontainers or Docker services.

## Contract

Required contracts:

```text
Edge AI Event
Gate Controller Command
Inventory Export Voucher
Evidence Metadata
```

## Hardware-in-the-loop

Separate PoC suite:

```text
RTSP camera
Night/Day
Motion Blur
Face Occlusion
Barrier Timeout
Network Disconnect
Reconnect
```

---

# Observability

Use structured logging and OpenTelemetry.

Required correlation fields:

```text
correlation_id
event_id
access_event_id
inspection_id
gate_command_id
site_id
gate_id
```

Metrics:

```text
access_decision_latency
decision_total
manual_review_total
gate_command_failure_total
camera_health
edge_heartbeat
lpr_confidence
face_similarity
inspection_duration
object_detection_total
```

---

# Configuration

Use Pydantic Settings in `config/settings.py`.

Suggested groups:

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

`.env.example` must match Settings exactly.

---

# Local Infrastructure

`docker-compose.yml` should include:

```text
postgres
redis
minio
message-broker
otel-collector
prometheus
grafana
jaeger/tempo
application
worker
gate-simulator
inventory-simulator
```

Camera simulator may run as a local process or service.

---

# Justfile

Required recipes:

```text
setup
install
uninstall

start-infra
stop-infra
start-simulators
stop-simulators
start-services
stop-services
docker-nuke

run-server MODE="prod"
run-edge MODE="simulator"

lint TARGET="all"
test TYPE="all"
coverage TYPE="all"

upgrade-db
upgrade-db-offline
db-migrate-create message
db-migrate-rollback

seed-demo
clean
repomix
list
```

Optional simulation helpers:

```text
simulate-entry SCENARIO="registered"
simulate-exit SCENARIO="asset-detected-no-voucher"
simulate-gate SCENARIO="timeout"
```

---

# Generation Order

Generate incrementally:

1. `config/` + `shared/`
2. `domain/entities/`
3. `domain/value_objects/`
4. `domain/services/`
5. `domain/repositories/` + `domain/gateways/`
6. `application/dto/`
7. `application/use_cases/`
8. `infrastructure/database/`
9. `infrastructure/repositories/`
10. `infrastructure/cache/`
11. `infrastructure/vision/`
12. `infrastructure/camera/`
13. `infrastructure/iot/`
14. `infrastructure/storage/`
15. `infrastructure/external_api/`
16. `bootstrap/`
17. `presentation/`
18. `edge_agent/`
19. `simulators/`
20. `main.py`
21. Docker / Alembic / Env / Justfile
22. Unit Tests
23. Integration Tests
24. Contract Tests

---

# Output Requirements

For each generated file:

1. Explain why it exists.
2. Show full file path.
3. Generate complete implementation.
4. Explain dependencies.
5. No placeholder/TODO stubs.
6. Type hints everywhere.
7. Async I/O where appropriate.
8. Domain must stay framework-independent.
9. AI must never directly make Gate Access decisions.
10. Security-sensitive failures must fail-safe.
