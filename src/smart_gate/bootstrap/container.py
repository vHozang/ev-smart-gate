from __future__ import annotations

from smart_gate.application.alerts import AlertService
from smart_gate.application.auth import AuthService
from smart_gate.application.barrier import BarrierService
from smart_gate.application.gate_entry import VerifyEntryUseCase
from smart_gate.application.gate_exit import VerifyExitUseCase
from smart_gate.application.gate_logs import GateLogQueryService
from smart_gate.application.registration import RegistrationService
from smart_gate.application.warehouse import WarehouseService
from smart_gate.config import Settings
from smart_gate.domain.services import FaceMatchingService, OrderStateService, PlateMatchingService
from smart_gate.infrastructure.database.client import MongoDatabase
from smart_gate.infrastructure.database.repositories import (
    BeanieAlertRepository,
    BeanieAuthorizationRepository,
    BeanieAuthSessionRepository,
    BeanieDeviceCredentialRepository,
    BeanieDockRepository,
    BeanieDriverRepository,
    BeanieGateCommandRepository,
    BeanieGateLogRepository,
    BeanieOrderRepository,
    BeanieUserRepository,
    BeanieVehicleRepository,
    MongoSequenceRepository,
)
from smart_gate.infrastructure.database.unit_of_work import MongoUnitOfWork
from smart_gate.infrastructure.devices.barrier import HttpBarrierGateway, SimulatorBarrierGateway
from smart_gate.infrastructure.realtime.hub import RealtimeHub
from smart_gate.infrastructure.security.crypto import EmbeddingCipher, PasswordService, SecretHasher
from smart_gate.infrastructure.signing.ed25519_slip import Ed25519ExitSlipGateway
from smart_gate.infrastructure.storage.minio_storage import MinioEvidenceStorage
from smart_gate.infrastructure.vision.alpr import FastAlprGateway, PaddleOcrPlateGateway
from smart_gate.infrastructure.vision.cargo import YoloV8CargoGateway, YoloXCargoGateway
from smart_gate.infrastructure.vision.common import BoundedExecutor
from smart_gate.infrastructure.vision.face import DeepFaceGateway, SFaceGateway
from smart_gate.infrastructure.vision.qr import QrCodeReader
from smart_gate.infrastructure.vision.simulated import (
    SimulatedCargoGateway,
    SimulatedFaceGateway,
    SimulatedPlateGateway,
)


class Container:
    """Giữ các dependency đã được dựng tại composition root, không chứa nghiệp vụ."""

    def __init__(self, settings: Settings) -> None:
        settings.validate_runtime_secrets()
        self.settings = settings
        self.database = MongoDatabase(settings)
        self.unit_of_work = MongoUnitOfWork(self.database)
        self.executor = BoundedExecutor(settings.vision_max_concurrency)
        self.realtime = RealtimeHub(settings.websocket_queue_size)

        cipher = EmbeddingCipher(settings.embedding_encryption_key)
        self.secret_hasher = SecretHasher(settings.session_secret)
        self.password_hasher = PasswordService()
        self.evidence = MinioEvidenceStorage(settings)
        self.slips = Ed25519ExitSlipGateway(settings)

        self.drivers = BeanieDriverRepository(cipher)
        self.vehicles = BeanieVehicleRepository()
        self.authorizations = BeanieAuthorizationRepository()
        self.gate_logs = BeanieGateLogRepository()
        self.orders = BeanieOrderRepository()
        self.docks = BeanieDockRepository()
        self.alerts_repository = BeanieAlertRepository()
        self.sequences = MongoSequenceRepository()
        self.commands = BeanieGateCommandRepository()
        self.users = BeanieUserRepository()
        self.sessions = BeanieAuthSessionRepository()
        self.devices = BeanieDeviceCredentialRepository()

        self.lpr = self._build_lpr()
        self.face = self._build_face()
        self.cargo = self._build_cargo()
        self.qr_reader = QrCodeReader(settings, self.executor)
        self.barrier_gateway = self._build_barrier()

        plate_matcher = PlateMatchingService(settings.plate_fuzzy_threshold)
        face_matcher = FaceMatchingService(settings.face_similarity_threshold)
        alert_service = AlertService(self.alerts_repository, self.sequences, self.realtime)
        barrier_service = BarrierService(
            self.barrier_gateway, self.commands, self.gate_logs, alert_service
        )
        self.auth = AuthService(
            settings,
            self.users,
            self.sessions,
            self.devices,
            self.password_hasher,
            self.secret_hasher,
        )
        self.registration = RegistrationService(
            settings, self.drivers, self.vehicles, self.authorizations, self.face
        )
        self.gate_log_queries = GateLogQueryService(self.gate_logs, self.evidence)
        self.warehouse = WarehouseService(
            settings,
            self.orders,
            self.docks,
            self.drivers,
            self.vehicles,
            self.authorizations,
            self.gate_logs,
            self.evidence,
            self.cargo,
            self.slips,
            self.secret_hasher,
            OrderStateService(),
            self.unit_of_work,
        )
        self.verify_entry = VerifyEntryUseCase(
            settings,
            self.drivers,
            self.vehicles,
            self.authorizations,
            self.gate_logs,
            self.evidence,
            self.lpr,
            self.face,
            plate_matcher,
            face_matcher,
            alert_service,
            barrier_service,
        )
        self.verify_exit = VerifyExitUseCase(
            settings,
            self.drivers,
            self.vehicles,
            self.orders,
            self.gate_logs,
            self.evidence,
            self.lpr,
            self.face,
            self.qr_reader,
            self.slips,
            self.secret_hasher,
            plate_matcher,
            face_matcher,
            alert_service,
            barrier_service,
            self.unit_of_work,
        )

    async def start(self) -> None:
        await self.database.connect()
        await self.evidence.initialize()
        await self.auth.seed_defaults()

    async def close(self) -> None:
        close = getattr(self.barrier_gateway, "close", None)
        if close is not None:
            await close()
        self.executor.close()
        await self.database.close()

    def _build_lpr(self):
        if self.settings.alpr_provider.lower() == "simulated":
            return SimulatedPlateGateway(self.settings.simulator_plate_number)
        if self.settings.alpr_provider.lower() == "paddleocr":
            return PaddleOcrPlateGateway(self.settings, self.executor)
        return FastAlprGateway(self.settings, self.executor)

    def _build_face(self):
        if self.settings.face_provider.lower() == "simulated":
            return SimulatedFaceGateway()
        if self.settings.face_provider.lower() == "deepface":
            return DeepFaceGateway(self.settings, self.executor)
        return SFaceGateway(self.settings, self.executor)

    def _build_cargo(self):
        if self.settings.cargo_provider.lower() == "simulated":
            return SimulatedCargoGateway()
        if self.settings.cargo_provider.lower() == "yolov8":
            return YoloV8CargoGateway(self.settings, self.executor)
        return YoloXCargoGateway(self.settings, self.executor)

    def _build_barrier(self):
        if self.settings.barrier_mode.lower() == "http":
            return HttpBarrierGateway(self.settings)
        return SimulatorBarrierGateway()
