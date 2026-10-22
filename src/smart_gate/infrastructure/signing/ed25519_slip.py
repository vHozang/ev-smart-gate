from __future__ import annotations

import asyncio
import base64
import html
import io
import json
import secrets
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import qrcode
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from smart_gate.config import Settings
from smart_gate.domain.entities import (
    Driver,
    ExitSlipArtifacts,
    ExitSlipClaims,
    Vehicle,
    WarehouseExitOrder,
)
from smart_gate.domain.exceptions import SmartGateError


def _encode_base64url(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")


def _decode_base64url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


class Ed25519ExitSlipGateway:
    """Tạo compact JWS EdDSA và ba định dạng slip dùng cùng một token."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._private_key = self._load_private_key(settings.qr_private_key)
        self._public_key = self._load_public_key(settings.qr_public_key)

    @staticmethod
    def _load_private_key(value: str) -> Ed25519PrivateKey:
        raw = value.encode("utf-8")
        if value.startswith("-----BEGIN"):
            key = serialization.load_pem_private_key(raw, password=None)
            if not isinstance(key, Ed25519PrivateKey):
                raise ValueError("QR_PRIVATE_KEY không phải Ed25519")
            return key
        decoded = _decode_base64url(value)
        return Ed25519PrivateKey.from_private_bytes(decoded)

    @staticmethod
    def _load_public_key(value: str) -> Ed25519PublicKey:
        raw = value.encode("utf-8")
        if value.startswith("-----BEGIN"):
            key = serialization.load_pem_public_key(raw)
            if not isinstance(key, Ed25519PublicKey):
                raise ValueError("QR_PUBLIC_KEY không phải Ed25519")
            return key
        decoded = _decode_base64url(value)
        return Ed25519PublicKey.from_public_bytes(decoded)

    async def issue(
        self,
        order: WarehouseExitOrder,
        driver: Driver,
        vehicle: Vehicle,
        expires_at: datetime,
    ) -> ExitSlipArtifacts:
        return await asyncio.to_thread(self._issue_sync, order, driver, vehicle, expires_at)

    def _issue_sync(
        self,
        order: WarehouseExitOrder,
        driver: Driver,
        vehicle: Vehicle,
        expires_at: datetime,
    ) -> ExitSlipArtifacts:
        now = datetime.now(UTC)
        claims = ExitSlipClaims(
            order_id=order.order_id,
            vehicle_id=vehicle.id,
            driver_id=driver.id,
            slip_version=order.slip_version + 1,
            jti=secrets.token_urlsafe(18),
            issued_at=now,
            expires_at=expires_at,
            kid=self.settings.qr_key_id,
        )
        header = {"alg": "EdDSA", "typ": "JWT", "kid": claims.kid}
        payload = {
            "iss": "ev-smart-gate",
            "aud": "warehouse-exit-gate",
            "order_id": claims.order_id,
            "vehicle_id": str(claims.vehicle_id),
            "driver_id": str(claims.driver_id),
            "slip_version": claims.slip_version,
            "jti": claims.jti,
            "iat": int(claims.issued_at.timestamp()),
            "exp": int(claims.expires_at.timestamp()),
        }
        encoded_header = _encode_base64url(
            json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        encoded_payload = _encode_base64url(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
        signature = _encode_base64url(self._private_key.sign(signing_input))
        token = f"{encoded_header}.{encoded_payload}.{signature}"
        qr_png = self._render_qr(token)
        html_payload = self._render_html(order, driver, vehicle, claims, qr_png)
        pdf_payload = self._render_pdf(order, driver, vehicle, claims, qr_png)
        return ExitSlipArtifacts(token, claims, qr_png, html_payload, pdf_payload)

    async def verify(self, token: str) -> ExitSlipClaims:
        return await asyncio.to_thread(self._verify_sync, token)

    def _verify_sync(self, token: str) -> ExitSlipClaims:
        try:
            encoded_header, encoded_payload, encoded_signature = token.split(".")
            header = json.loads(_decode_base64url(encoded_header))
            payload = json.loads(_decode_base64url(encoded_payload))
            if header.get("alg") != "EdDSA" or header.get("kid") != self.settings.qr_key_id:
                raise ValueError("Thuật toán hoặc kid không hợp lệ")
            signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
            self._public_key.verify(_decode_base64url(encoded_signature), signing_input)
            expires_at = datetime.fromtimestamp(int(payload["exp"]), UTC)
            if expires_at <= datetime.now(UTC):
                raise SmartGateError("SLIP_EXPIRED", "Phiếu xuất kho đã hết hạn")
            if payload.get("iss") != "ev-smart-gate" or payload.get("aud") != "warehouse-exit-gate":
                raise ValueError("Issuer hoặc audience không hợp lệ")
            return ExitSlipClaims(
                order_id=str(payload["order_id"]),
                vehicle_id=UUID(str(payload["vehicle_id"])),
                driver_id=UUID(str(payload["driver_id"])),
                slip_version=int(payload["slip_version"]),
                jti=str(payload["jti"]),
                issued_at=datetime.fromtimestamp(int(payload["iat"]), UTC),
                expires_at=expires_at,
                kid=str(header["kid"]),
            )
        except SmartGateError:
            raise
        except (ValueError, KeyError, TypeError, InvalidSignature, json.JSONDecodeError) as exc:
            raise SmartGateError(
                "SLIP_SIGNATURE_INVALID", "Chữ ký phiếu xuất kho không hợp lệ"
            ) from exc

    @staticmethod
    def _render_qr(token: str) -> bytes:
        image = qrcode.make(token)
        stream = io.BytesIO()
        image.save(stream, format="PNG")
        return stream.getvalue()

    @staticmethod
    def _render_html(
        order: WarehouseExitOrder,
        driver: Driver,
        vehicle: Vehicle,
        claims: ExitSlipClaims,
        qr_png: bytes,
    ) -> bytes:
        encoded_qr = base64.b64encode(qr_png).decode("ascii")
        cargo_rows = "".join(f"<li>{html.escape(str(item))}</li>" for item in order.cargo_metadata)
        content = f"""<!doctype html>
<html lang="vi"><meta charset="utf-8"><title>Phiếu xuất kho {html.escape(order.order_id)}</title>
<body><h1>PHIẾU XUẤT KHO ĐIỆN TỬ</h1>
<p>Mã lệnh: <strong>{html.escape(order.order_id)}</strong></p>
<p>Tài xế: {html.escape(driver.full_name)}</p>
<p>Biển số: {html.escape(vehicle.plate_number)}</p>
<p>Hiệu lực đến: {claims.expires_at.isoformat()}</p>
<ul>{cargo_rows}</ul><img alt="QR đã ký" src="data:image/png;base64,{encoded_qr}" width="280">
</body></html>"""
        return content.encode("utf-8")

    @staticmethod
    def _render_pdf(
        order: WarehouseExitOrder,
        driver: Driver,
        vehicle: Vehicle,
        claims: ExitSlipClaims,
        qr_png: bytes,
    ) -> bytes:
        stream = io.BytesIO()
        pdf = canvas.Canvas(stream, pagesize=(595, 842))
        font_name = "Helvetica"
        font_path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
        if font_path.is_file():
            pdfmetrics.registerFont(TTFont("DejaVuSans", str(font_path)))
            font_name = "DejaVuSans"
        pdf.setFont(font_name, 18)
        pdf.drawString(80, 790, "PHIẾU XUẤT KHO ĐIỆN TỬ")
        pdf.setFont(font_name, 11)
        lines = [
            f"Mã lệnh: {order.order_id}",
            f"Tài xế: {driver.full_name}",
            f"Biển số: {vehicle.plate_number}",
            f"Phiên bản phiếu: {claims.slip_version}",
            f"Hiệu lực đến: {claims.expires_at.isoformat()}",
        ]
        y = 750
        for line in lines:
            pdf.drawString(80, y, line)
            y -= 24
        pdf.drawImage(
            ImageReader(io.BytesIO(qr_png)),
            180,
            350,
            width=240,
            height=240,
            preserveAspectRatio=True,
            mask="auto",
        )
        pdf.setFont(font_name, 8)
        pdf.drawString(
            80, 320, "QR chứa chữ ký Ed25519; mọi chỉnh sửa dữ liệu sẽ làm xác minh thất bại."
        )
        pdf.save()
        return stream.getvalue()
