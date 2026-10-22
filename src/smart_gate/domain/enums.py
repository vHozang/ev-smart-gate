from enum import StrEnum


class RecordStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class CardStatus(StrEnum):
    ACTIVE = "ACTIVE"
    BLOCKED = "BLOCKED"
    LOST = "LOST"
    REPLACED = "REPLACED"


class Direction(StrEnum):
    ENTRY = "ENTRY"
    EXIT = "EXIT"


class VerificationStatus(StrEnum):
    PASSED = "PASSED"
    FAILED = "FAILED"


class PlateMatchType(StrEnum):
    EXACT = "EXACT"
    FUZZY = "FUZZY"
    NONE = "NONE"


class BarrierStatus(StrEnum):
    NOT_REQUESTED = "NOT_REQUESTED"
    PENDING = "PENDING"
    OPENED = "OPENED"
    FAILED = "FAILED"


class OrderStatus(StrEnum):
    PENDING = "PENDING"
    LOADING = "LOADING"
    READY_FOR_EXIT = "READY_FOR_EXIT"
    SLIP_ISSUED = "SLIP_ISSUED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class CargoState(StrEnum):
    EMPTY = "EMPTY"
    LOADING = "LOADING"
    LOADED = "LOADED"
    ANOMALY = "ANOMALY"
    UNKNOWN = "UNKNOWN"


class DockStatus(StrEnum):
    ACTIVE = "ACTIVE"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    APPROVED = "APPROVED"
    CANCELLED = "CANCELLED"


class AlertSeverity(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AlertStatus(StrEnum):
    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"
    FALSE_POSITIVE = "FALSE_POSITIVE"


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    WAREHOUSE = "WAREHOUSE"
    SECURITY = "SECURITY"


class GateCommandStatus(StrEnum):
    PENDING = "PENDING"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    FAILED = "FAILED"
