from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import secrets
from contextlib import suppress
from datetime import UTC, datetime

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from minio import Minio
from minio.error import S3Error

from smart_gate.config import Settings
from smart_gate.domain.exceptions import InfrastructureError
from smart_gate.infrastructure.database.documents import EvidenceDocument


class MinioEvidenceStorage:
    """Lưu payload đã mã hóa ứng dụng vào bucket private của MinIO."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        key = base64.urlsafe_b64decode(settings.evidence_encryption_key.encode("ascii"))
        if len(key) != 32:
            raise ValueError("EVIDENCE_ENCRYPTION_KEY phải có đúng 32 byte")
        self._cipher = AESGCM(key)
        self._client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )

    async def initialize(self) -> None:
        try:
            exists = await asyncio.to_thread(self._client.bucket_exists, self.settings.minio_bucket)
            if not exists:
                await asyncio.to_thread(self._client.make_bucket, self.settings.minio_bucket)
        except S3Error as exc:
            raise InfrastructureError(
                "MINIO_INITIALIZATION_FAILED", "Không thể khởi tạo bucket lưu bằng chứng"
            ) from exc

    async def store(
        self,
        payload: bytes,
        *,
        category: str,
        correlation_id: str,
        content_type: str,
        extension: str,
    ) -> str:
        timestamp = datetime.now(UTC)
        digest = hashlib.sha256(payload).hexdigest()
        object_key = (
            f"{category}/{timestamp:%Y/%m/%d}/{correlation_id}/"
            f"{secrets.token_hex(8)}.{extension.lstrip('.')}"
        )
        nonce = secrets.token_bytes(12)
        encrypted = nonce + self._cipher.encrypt(nonce, payload, object_key.encode("utf-8"))
        stream = io.BytesIO(encrypted)
        uploaded = False
        try:
            await asyncio.to_thread(
                self._client.put_object,
                self.settings.minio_bucket,
                object_key,
                stream,
                len(encrypted),
                content_type="application/octet-stream",
                metadata={"original-content-type": content_type, "sha256": digest},
            )
            uploaded = True
            await EvidenceDocument(
                object_key=object_key,
                category=category,
                correlation_id=correlation_id,
                content_type=content_type,
                content_sha256=digest,
                size_bytes=len(payload),
            ).insert()
        except Exception as exc:
            if uploaded:
                with suppress(Exception):
                    await asyncio.to_thread(
                        self._client.remove_object,
                        self.settings.minio_bucket,
                        object_key,
                    )
            raise InfrastructureError(
                "EVIDENCE_STORE_FAILED", "Không thể lưu bằng chứng vào Object Storage"
            ) from exc
        return object_key

    async def read(self, object_key: str) -> bytes:
        response = None
        try:
            response = await asyncio.to_thread(
                self._client.get_object, self.settings.minio_bucket, object_key
            )
            encrypted = await asyncio.to_thread(response.read)
            return self._cipher.decrypt(encrypted[:12], encrypted[12:], object_key.encode("utf-8"))
        except Exception as exc:
            raise InfrastructureError(
                "EVIDENCE_READ_FAILED", "Không thể đọc hoặc giải mã bằng chứng"
            ) from exc
        finally:
            if response is not None:
                response.close()
                response.release_conn()
