# Thiết kế

## Layer và artifact

| Layer | Artifact |
|---|---|
| Domain | Entity, enum, `PlateMatchingService`, `FaceMatchingService`, `OrderStateService`, Protocol |
| Application | Registration, Auth, Warehouse, Gate In, Gate Out, Alert, Barrier orchestration |
| Infrastructure | Beanie repository, Mongo UoW, MinIO, AI adapters, JWS, barrier, realtime hub |
| Presentation | FastAPI router/schema/dependency, exception handler và WebSocket |
| Bootstrap | `Container`, lifecycle và `create_app` |

## Port và adapter

- `DriverRepository`, `VehicleRepository`, `OrderRepository` -> Beanie repositories.
- `EvidenceStorageGateway` -> `MinioEvidenceStorage`.
- `FaceGateway` -> SFace/DeepFace/simulator.
- `LicensePlateGateway` -> FastALPR/PaddleOCR/simulator.
- `CargoGateway` -> YOLOX/YOLOv8/simulator.
- `ExitSlipGateway` -> `Ed25519ExitSlipGateway`.
- `BarrierGateway` -> HTTP hoặc simulator.
- `UnitOfWork` -> `MongoUnitOfWork` dùng transaction replica set.

## Invariant an ninh

Không có đường gọi từ AI adapter tới barrier. Application chỉ gọi `BarrierService` sau khi đã ghi Gate Log `PASSED`; `WarehouseExitOrder` chỉ chuyển `COMPLETED` sau barrier ACK.
