from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class EdgeSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    api_url: str = Field("http://api:8000", alias="EDGE_API_URL")
    device_key: str = Field("change-this-device-key", alias="EDGE_DEVICE_KEY")
    workflow: str = Field("entry", alias="EDGE_WORKFLOW")
    gate_id: str = Field("gate-01", alias="EDGE_GATE_ID")
    plate_source: str = Field("http://camera-simulator:8081/plate.jpg", alias="EDGE_PLATE_SOURCE")
    face_source: str = Field("http://camera-simulator:8081/face.jpg", alias="EDGE_FACE_SOURCE")
    slip_source: str = Field("http://camera-simulator:8081/slip.jpg", alias="EDGE_SLIP_SOURCE")
    interval_seconds: float = Field(5.0, alias="EDGE_INTERVAL_SECONDS", ge=0.2)
    request_timeout_seconds: float = Field(20.0, alias="EDGE_REQUEST_TIMEOUT_SECONDS", ge=1)
    jpeg_quality: int = Field(90, alias="EDGE_JPEG_QUALITY", ge=50, le=100)
