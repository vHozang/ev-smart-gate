from __future__ import annotations

import base64
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cấu hình tập trung; secret thật được truyền qua biến môi trường hoặc secret file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    app_env: str = Field("local", alias="APP_ENV")
    app_name: str = Field("EV Smart Gate", alias="APP_NAME")
    app_public_origin: str = Field("http://localhost:8000", alias="APP_PUBLIC_ORIGIN")
    app_timezone: str = Field("Asia/Ho_Chi_Minh", alias="APP_TIMEZONE")
    log_level: str = Field("INFO", alias="LOG_LEVEL")
    cors_origins: str = Field("http://localhost:3000", alias="CORS_ORIGINS")
    docs_enabled: bool = Field(True, alias="DOCS_ENABLED")

    mongodb_uri: str = Field("mongodb://mongodb:27017/?replicaSet=rs0", alias="MONGODB_URI")
    mongodb_database: str = Field("ev_smart_gate", alias="MONGODB_DATABASE")

    minio_endpoint: str = Field("minio:9000", alias="MINIO_ENDPOINT")
    minio_access_key: str = Field("minioadmin", alias="MINIO_ACCESS_KEY")
    minio_secret_key: str = Field("minioadmin", alias="MINIO_SECRET_KEY")
    minio_bucket: str = Field("smart-gate-evidence", alias="MINIO_BUCKET")
    minio_secure: bool = Field(False, alias="MINIO_SECURE")

    admin_username: str = Field("admin", alias="ADMIN_USERNAME")
    admin_password: str = Field("change-this-admin-password", alias="ADMIN_PASSWORD")
    session_secret: str = Field("change-this-session-secret-32-bytes", alias="SESSION_SECRET")
    session_ttl_seconds: int = Field(28_800, alias="SESSION_TTL_SECONDS", ge=300)
    session_cookie_name: str = Field("smart_gate_session", alias="SESSION_COOKIE_NAME")
    csrf_cookie_name: str = Field("smart_gate_csrf", alias="CSRF_COOKIE_NAME")
    device_api_key: str = Field("change-this-device-key", alias="DEVICE_API_KEY")

    embedding_encryption_key: str = Field("", alias="EMBEDDING_ENCRYPTION_KEY")
    evidence_encryption_key: str = Field("", alias="EVIDENCE_ENCRYPTION_KEY")
    qr_private_key: str = Field("", alias="QR_PRIVATE_KEY")
    qr_public_key: str = Field("", alias="QR_PUBLIC_KEY")
    qr_key_id: str = Field("gate-ed25519-v1", alias="QR_KEY_ID")
    slip_max_valid_hours: int = Field(8, alias="SLIP_MAX_VALID_HOURS", ge=1, le=48)

    face_similarity_threshold: float = Field(0.75, alias="FACE_SIMILARITY_THRESHOLD", ge=0, le=1)
    face_detector_threshold: float = Field(0.8, alias="FACE_DETECTOR_THRESHOLD", ge=0, le=1)
    liveness_threshold: float = Field(0.5, alias="LIVENESS_THRESHOLD", ge=0, le=1)
    require_liveness: bool = Field(True, alias="REQUIRE_LIVENESS")
    plate_fuzzy_threshold: float = Field(90.0, alias="PLATE_FUZZY_THRESHOLD", ge=0, le=100)
    plate_confidence_threshold: float = Field(0.6, alias="PLATE_CONFIDENCE_THRESHOLD", ge=0, le=1)
    threshold_version: str = Field("v1", alias="THRESHOLD_VERSION")

    alpr_provider: str = Field("fastalpr", alias="ALPR_PROVIDER")
    alpr_detector_model: str = Field(
        "yolo-v9-t-384-license-plate-end2end", alias="ALPR_DETECTOR_MODEL"
    )
    alpr_ocr_model: str = Field("cct-xs-v2-global-model", alias="ALPR_OCR_MODEL")
    face_provider: str = Field("sface", alias="FACE_PROVIDER")
    face_model_dir: str = Field("/models/face", alias="FACE_MODEL_DIR")
    model_manifest_path: str = Field("/models/manifest.json", alias="MODEL_MANIFEST_PATH")
    cargo_provider: str = Field("yolox", alias="CARGO_PROVIDER")
    cargo_model_path: str = Field("/models/object/yolox-tiny.onnx", alias="CARGO_MODEL_PATH")
    cargo_input_size: int = Field(640, alias="CARGO_INPUT_SIZE", ge=320, le=1280)
    cargo_confidence_threshold: float = Field(0.5, alias="CARGO_CONFIDENCE_THRESHOLD", ge=0, le=1)
    vision_max_concurrency: int = Field(2, alias="VISION_MAX_CONCURRENCY", ge=1, le=16)
    simulator_plate_number: str = Field("30A12345", alias="SIMULATOR_PLATE_NUMBER")

    barrier_mode: str = Field("simulator", alias="BARRIER_MODE")
    barrier_http_url: str = Field("", alias="BARRIER_HTTP_URL")
    barrier_http_token: str = Field("", alias="BARRIER_HTTP_TOKEN")
    barrier_timeout_seconds: float = Field(3.0, alias="BARRIER_TIMEOUT_SECONDS", ge=0.1, le=30)

    upload_max_bytes: int = Field(10_485_760, alias="UPLOAD_MAX_BYTES", ge=65_536)
    websocket_queue_size: int = Field(200, alias="WEBSOCKET_QUEUE_SIZE", ge=10, le=5000)

    @property
    def cors_origin_list(self) -> list[str]:
        return [value.strip() for value in self.cors_origins.split(",") if value.strip()]

    @property
    def cookie_secure(self) -> bool:
        return self.app_public_origin.lower().startswith("https://")

    def validate_runtime_secrets(self) -> None:
        if self.app_env == "test":
            return
        required_text = {
            "ADMIN_PASSWORD": self.admin_password,
            "SESSION_SECRET": self.session_secret,
            "DEVICE_API_KEY": self.device_api_key,
            "MINIO_SECRET_KEY": self.minio_secret_key,
        }
        for name, value in required_text.items():
            if "change-this" in value.lower() or len(value) < 16:
                raise ValueError(f"{name} chưa được cấu hình an toàn")
        for name, value in {
            "EMBEDDING_ENCRYPTION_KEY": self.embedding_encryption_key,
            "EVIDENCE_ENCRYPTION_KEY": self.evidence_encryption_key,
        }.items():
            try:
                decoded = base64.urlsafe_b64decode(value.encode("ascii"))
            except (ValueError, UnicodeEncodeError) as exc:
                raise ValueError(f"{name} không phải khóa base64url hợp lệ") from exc
            if len(decoded) != 32:
                raise ValueError(f"{name} phải giải mã thành đúng 32 byte")
        if not self.qr_private_key or not self.qr_public_key:
            raise ValueError("QR_PRIVATE_KEY và QR_PUBLIC_KEY là bắt buộc")


@lru_cache
def get_settings() -> Settings:
    return Settings()
