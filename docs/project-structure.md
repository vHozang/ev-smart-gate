# Smart Gate & Vehicle Security — Project Structure & Architecture

Tài liệu mô tả cấu trúc backend theo **Clean Architecture + DDD**, tập trung cho domain Smart Gate, AI Vision, Camera, IoT, Access Control và Vehicle Security.

> **Ràng buộc kiến trúc bắt buộc từ BRD §9 (Out of Scope):**
> Camera, Server và thiết bị IoT **do khách hàng tự đầu tư**, chưa biết vendor và model cụ thể.
> Do đó `CameraGateway` và `GateControllerGateway` **không phải** là lựa chọn thiết kế "cho đẹp"
> mà là yêu cầu bắt buộc — xem `ADR-006`. Mọi code chạm trực tiếp vendor SDK ngoài
> `infrastructure/` đều là vi phạm scope hợp đồng.

> Trạng thái yêu cầu (`CONFIRMED` / `PROPOSED` / `DESIGN-ADDED`) của từng use case:
> xem `requirements-traceability.md`. **Chỉ ưu tiên implement các use case `CONFIRMED`.**

---

## High-Level Architecture

```text
Presentation Layer
       │
       ▼
Application Layer
       │
       ▼
Domain Layer
       ▲
       │
Infrastructure Layer
```

### Dependency Rules

1. `domain/` không import FastAPI, SQLAlchemy, Redis, OpenCV, ONNX, TensorRT, Pydantic `BaseModel` hoặc vendor SDK.
2. `application/` chỉ orchestrate use case và phụ thuộc Domain ports/entities/services.
3. `infrastructure/` implement repository/gateway Protocol.
4. `presentation/` chỉ validate → map → call use case → response.
5. `bootstrap/` là Composition Root.

---

## Directory Layout

```text
smart-gate/
├── app/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── user.py
│   │   │   ├── vehicle.py
│   │   │   ├── appointment.py
│   │   │   ├── access_event.py
│   │   │   ├── inspection_session.py
│   │   │   ├── security_alert.py
│   │   │   ├── asset.py
│   │   │   ├── evidence.py
│   │   │   └── export_voucher.py
│   │   ├── value_objects/
│   │   │   ├── license_plate.py
│   │   │   ├── confidence_score.py
│   │   │   ├── risk_score.py
│   │   │   ├── time_window.py
│   │   │   ├── access_decision.py
│   │   │   └── direction.py
│   │   ├── services/
│   │   │   ├── access_policy_service.py
│   │   │   ├── risk_assessment_service.py
│   │   │   ├── inspection_policy_service.py
│   │   │   └── export_voucher_matching_service.py
│   │   ├── repositories/
│   │   │   ├── appointment_repository.py
│   │   │   ├── vehicle_repository.py
│   │   │   ├── access_event_repository.py
│   │   │   ├── inspection_repository.py
│   │   │   ├── alert_repository.py
│   │   │   └── unit_of_work.py
│   │   ├── gateways/
│   │   │   ├── cache_gateway.py
│   │   │   ├── lpr_gateway.py
│   │   │   ├── face_verification_gateway.py
│   │   │   ├── object_detection_gateway.py
│   │   │   ├── camera_gateway.py
│   │   │   ├── gate_controller_gateway.py
│   │   │   ├── notification_gateway.py
│   │   │   ├── evidence_storage_gateway.py
│   │   │   ├── inventory_gateway.py
│   │   │   └── event_bus_gateway.py
│   │   └── exceptions/
│   │
│   ├── application/
│   │   ├── dto/
│   │   ├── use_cases/
│   │   │   ├── register_visitor.py            # FR01
│   │   │   ├── register_vehicle.py            # FR01
│   │   │   ├── approve_appointment.py         # DA-01
│   │   │   ├── process_entry_observation.py   # FR02 + FR03  [CONFIRMED]
│   │   │   ├── review_access_decision.py      # FR03         [CONFIRMED]
│   │   │   ├── notify_host.py                 # FR04
│   │   │   ├── process_exit_observation.py    # FR05
│   │   │   ├── start_exit_inspection.py       # FR05
│   │   │   ├── evaluate_inspection.py         # FR05
│   │   │   ├── review_security_alert.py       # FR05
│   │   │   ├── manual_gate_override.py        # DA-07
│   │   │   └── sync_export_voucher.py         # FR06  (Phase 2)
│   │   ├── interfaces/
│   │   └── mappers/
│   │
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── models/
│   │   │   ├── session.py
│   │   │   ├── unit_of_work.py
│   │   │   └── migrations/
│   │   ├── repositories/
│   │   ├── cache/
│   │   ├── vision/
│   │   │   ├── lpr/
│   │   │   ├── face/
│   │   │   ├── object_detection/
│   │   │   └── model_registry.py
│   │   ├── camera/
│   │   ├── iot/
│   │   ├── messaging/
│   │   ├── storage/
│   │   ├── notification/
│   │   └── external_api/
│   │       ├── inventory_client.py
│   │       └── hr_client.py
│   │
│   ├── presentation/
│   │   ├── api/
│   │   │   ├── schemas/
│   │   │   └── routers/
│   │   ├── realtime/
│   │   ├── middleware/
│   │   └── exception_handlers.py
│   │
│   ├── bootstrap/
│   │   ├── providers.py
│   │   ├── container.py
│   │   └── startup.py
│   │
│   ├── config/
│   └── shared/
│
├── edge_agent/
│   ├── pipeline/
│   ├── runtime/
│   ├── transport/
│   └── main.py
│
├── simulators/
│   ├── camera_event_simulator.py
│   ├── gate_controller_simulator.py
│   └── inventory_api_simulator.py
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── contract/
│
├── .env.example
├── alembic.ini
├── docker-compose.yml
├── justfile
├── pyproject.toml
└── README.md
```

---

## Implementation Priority

Thứ tự implement bám theo **trạng thái yêu cầu**, không bám theo độ dễ kỹ thuật.
Lý do: 4/6 module trong BRD vẫn là `PROPOSED` (`R-04`) — code viết cho phần chưa chốt
có nguy cơ bị vứt bỏ.

| Ưu tiên | Use case | FR | Vì sao |
|---|---|---|---|
| **P0** | `process_entry_observation` | FR02 + FR03 | Module duy nhất khách đã `CONFIRMED` |
| **P0** | `review_access_decision` | FR03 | Đi kèm FR03, khách đã `CONFIRMED` |
| P1 | `register_visitor`, `register_vehicle`, `approve_appointment` | FR01 | High priority nhưng `PROPOSED` |
| P1 | `notify_host` | FR04 | Medium priority |
| P2 | `start_exit_inspection`, `evaluate_inspection`, `review_security_alert` | FR05 | High priority nhưng rủi ro kỹ thuật `R-01` cao nhất — chờ M3 Dataset Benchmark |
| P3 | `sync_export_voucher` | FR06 | Low priority, Phase 2, chưa có API contract |
| — | Vehicle Tracking | FR07 | **Không implement** — chờ `OQ-05` |

> Không tạo file rỗng/stub cho FR07. Việc để sẵn thư mục cho một yêu cầu chưa được
> xác nhận sẽ tạo ảo giác là hạng mục đó đã nằm trong scope.

---

## Entities vs DTOs vs Schemas vs ORM Models

### Domain Entity

```python
@dataclass
class Appointment:
    id: AppointmentId
    visitor_id: UserId
    vehicle_id: VehicleId
    host_id: UserId
    time_window: TimeWindow
    status: AppointmentStatus
```

### Application DTO

```python
class ProcessEntryDTO(BaseModel):
    event_id: str
    site_id: str
    gate_id: str
    plate: str
    plate_confidence: float
    face_candidate_id: str | None
    face_similarity: float | None
```

### API Schema

```python
class EdgeVehicleObservationRequest(BaseModel):
    event_id: UUID
    observed_at: datetime
    vehicle: VehicleObservationSchema
    person: PersonObservationSchema | None = None
```

### ORM Model

ORM models chỉ tồn tại trong `infrastructure/database/models/`.

---

## Aggregate Boundaries

Đề xuất:

- `Appointment`
- `AccessEvent`
- `InspectionSession`
- `SecurityAlert`
- `ExportVoucher`

Không dùng một aggregate khổng lồ cho toàn bộ hệ thống.

---

## Dependency Injection

### Scope.APP

- Settings.
- Logger.
- Redis Pool.
- HTTP Client.
- Object Storage Client.
- Event Bus.
- AI Model Registry.
- Camera/Gate Client Factory.

### Scope.REQUEST

- AsyncSession.
- UnitOfWork.
- Repository implementations.
- UseCases.

---

## Protocol vs ABC

Dùng `typing.Protocol` cho:

- Repositories.
- UnitOfWork.
- LPRGateway.
- FaceVerificationGateway.
- ObjectDetectionGateway.
- CameraGateway.
- GateControllerGateway.
- InventoryGateway.
- EvidenceStorageGateway.

Dùng `ABC` khi có shared behavior thực sự, ví dụ:

- `BaseVisionGateway`.
- `BaseDeviceAdapter`.
- `BaseEventConsumer`.

---

## Repository + Unit of Work

```python
class ProcessEntryObservationUseCase:
    def __init__(
        self,
        uow: UnitOfWork,
        access_policy: AccessPolicyService,
        risk_service: RiskAssessmentService,
        gate: GateControllerGateway,
    ) -> None:
        ...
```

UseCase không nhận `AsyncSession`.

---

## AI Vision as Ports

```text
LPRGateway
    ▲
    │
    ├── LocalONNXLPR
    ├── VendorCameraLPR
    └── ExternalLPRService
```

Domain không biết OpenCV/ONNX/TensorRT.

---

## Gate Adapter Pattern

```text
GateControllerGateway
        ▲
   ┌────┼─────┐
   │    │     │
 HTTP MQTT  Modbus
```

---

## Event-driven Boundary

Edge gửi:

```text
Observation Event
```

Backend tạo:

```text
Access Decision
Security Alert
Gate Command
Audit Event
```

Edge không truy cập database trung tâm.

---

## Idempotency

Unique identifiers:

```text
event_id
gate_command_id
inspection_id
```

Camera reconnect không được làm mở cổng nhiều lần.

---

## Auditability

Audit log phải lưu:

```text
actor_type
actor_id
action
resource_type
resource_id
reason
before
after
occurred_at
correlation_id
```

AI decision phải lưu `model_version` và `threshold_version`.

---

## Test Strategy

### Unit

- AccessPolicyService.
- RiskAssessmentService.
- Voucher Matching.
- Access UseCases.
- Inspection UseCases.

### Integration

- PostgreSQL.
- Redis.
- Object Storage.
- API.
- Message Broker.

### Contract

- Edge Event JSON.
- Gate Command.
- Inventory API.
- Evidence Metadata.

### Hardware-in-the-loop

- RTSP camera.
- Day/Night.
- Motion Blur.
- Occlusion.
- Barrier command.
- Network interruption.
