from __future__ import annotations

from smart_gate.application.alerts import AlertService
from smart_gate.application.auth import AuthService
from smart_gate.application.barrier import BarrierService
from smart_gate.application.cards import EmployeeCardService
from smart_gate.application.gate_logs import GateLogQueryService
from smart_gate.application.migration_services import (
    AnalyticsService,
    AssistantReportService,
    CoreAccessService,
    DeviceSettingsService,
)
from smart_gate.application.operator_admin import OperatorAdminService
from smart_gate.application.operator_auth import OperatorAuthService
from smart_gate.application.parking_gate import VerifyParkingGateUseCase
from smart_gate.application.registration import RegistrationService
from smart_gate.application.warehouse import WarehouseService
from smart_gate.bootstrap.operator_identity import (
    build_operator_admin,
    build_operator_identity,
    validate_operator_settings,
)
from smart_gate.config import Settings
from smart_gate.domain.services import FaceMatchingService, OrderStateService, PlateMatchingService
from smart_gate.infrastructure.database.client import MongoDatabase
from smart_gate.infrastructure.database.migration_store import HybridMigrationStore
from smart_gate.infrastructure.database.operator_store import (
    MongoOperatorRoles,
    OperatorCollections,
)
from smart_gate.infrastructure.database.repositories import (
    BeanieAlertRepository,
    BeanieAuthorizationRepository,
    BeanieAuthSessionRepository,
    BeanieDeviceCredentialRepository,
    BeanieDockRepository,
    BeanieDriverRepository,
    BeanieEmployeeCardRepository,
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
        if settings.operator_auth_enabled:
            validate_operator_settings(settings)
        self.settings = settings
        self.operator_auth: OperatorAuthService | None = None
        self.operator_admin: OperatorAdminService | None = None
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
        self.employee_cards = BeanieEmployeeCardRepository()

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
        self.card_management = EmployeeCardService(
            self.drivers,
            self.employee_cards,
            self.unit_of_work,
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
        self.verify_parking_gate = VerifyParkingGateUseCase(
            settings,
            self.employee_cards,
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
        self.migration_store = HybridMigrationStore(self.database)
        self.core_access: CoreAccessService | None = CoreAccessService(
            self.migration_store,
            self.secret_hasher,
            self.barrier_gateway,
            self.drivers,
            self.vehicles,
            self.authorizations,
            self.employee_cards,
            self.face,
            face_matcher,
        )
        self.analytics: AnalyticsService | None = AnalyticsService(
            self.migration_store,
            self.gate_logs,
            self.alerts_repository,
            self.orders,
        )
        self.assistant: AssistantReportService | None = AssistantReportService(
            self.migration_store,
            self.analytics,
        )
        self.device_settings: DeviceSettingsService | None = DeviceSettingsService(
            self.migration_store,
        )

    async def start(self) -> None:
        await self.database.connect()
        collections = OperatorCollections(self.database)
        self.auth.operator_roles = MongoOperatorRoles(collections)
        marker = await collections.collection("operator_identity_migrations").find_one(
            {"_id": "operator-rbac-v1:baseline"}
        )
        self.auth.allow_default_seeding = marker is None
        await self.evidence.initialize()
        if self.settings.operator_auth_enabled:
            self.operator_auth = await build_operator_identity(
                self.settings, self.database, self.password_hasher
            )
            self.operator_admin = build_operator_admin(
                self.settings, self.operator_auth, self.password_hasher
            )
            await self.migration_store.initialize()
        else:
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
