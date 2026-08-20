from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx


async def run() -> None:
    api_url = os.getenv("WORKFLOW_API_URL", "http://api:8000")
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD", "Local-SmartGate-Admin-2026")
    device_key = os.getenv("DEVICE_API_KEY", "local-edge-device-key-2026")
    async with httpx.AsyncClient(base_url=api_url, timeout=30) as client:
        login = await client.post(
            "/api/v1/auth/login",
            json={"username": admin_username, "password": admin_password},
        )
        login.raise_for_status()
        operator_headers = {"X-CSRF-Token": login.json()["csrf_token"]}
        device_headers = {"X-Device-Key": device_key}

        drivers = (await client.get("/api/v1/drivers")).json()
        driver = next(
            (item for item in drivers if item.get("employee_code") == "SIM-DRIVER"),
            None,
        )
        if driver is None:
            driver = next(
                (
                    item
                    for item in drivers
                    if item.get("status") == "ACTIVE"
                    and item.get("face_model") == "simulated-face-v2"
                ),
                None,
            )
        if driver is None:
            response = await client.post(
                "/api/v1/drivers",
                data={"full_name": "Tài xế mô phỏng", "employee_code": "SIM-DRIVER"},
                files={"face_image": ("face.jpg", b"simulated-face", "image/jpeg")},
                headers=operator_headers,
            )
            response.raise_for_status()
            driver = response.json()

        vehicles = (await client.get("/api/v1/vehicles")).json()
        vehicle = next(
            (item for item in vehicles if item["plate_normalized"] == "30A12345"),
            None,
        )
        if vehicle is None:
            response = await client.post(
                "/api/v1/vehicles",
                json={"plate_number": "30A12345", "vehicle_type": "truck"},
                headers=operator_headers,
            )
            response.raise_for_status()
            vehicle = response.json()

        now = datetime.now(UTC)
        authorizations = (await client.get("/api/v1/driver-vehicle-authorizations")).json()
        active_pair = any(
            item["driver_id"] == driver["id"]
            and item["vehicle_id"] == vehicle["id"]
            and item["status"] == "ACTIVE"
            and datetime.fromisoformat(item["valid_from"].replace("Z", "+00:00")) <= now
            and (
                item.get("valid_until") is None
                or datetime.fromisoformat(item["valid_until"].replace("Z", "+00:00")) > now
            )
            for item in authorizations
        )
        if not active_pair:
            response = await client.post(
                "/api/v1/driver-vehicle-authorizations",
                json={
                    "driver_id": driver["id"],
                    "vehicle_id": vehicle["id"],
                    "valid_from": (now - timedelta(minutes=5)).isoformat(),
                    "valid_until": (now + timedelta(hours=8)).isoformat(),
                },
                headers=operator_headers,
            )
            response.raise_for_status()

        entry = await client.post(
            "/api/v1/gates/entry/verifications",
            data={"event_id": f"sim-entry-{uuid4()}", "gate_id": "gate-in-sim"},
            files={
                "plate_image": ("plate.jpg", b"simulated-plate", "image/jpeg"),
                "face_image": ("face.jpg", b"simulated-face", "image/jpeg"),
            },
            headers=device_headers,
        )
        entry.raise_for_status()
        if not entry.json()["permit_granted"]:
            raise RuntimeError(f"Gate In bị từ chối: {entry.text}")
        resolved_driver_id = entry.json()["driver_id"]

        order_id = f"SIM-{uuid4().hex[:12].upper()}"
        order = await client.post(
            "/api/v1/warehouse/orders",
            json={
                "order_id": order_id,
                "assigned_driver_id": resolved_driver_id,
                "assigned_vehicle_id": vehicle["id"],
                "cargo_metadata": [{"sku": "PALLET-SIM", "quantity": 1}],
                "valid_from": (now - timedelta(minutes=5)).isoformat(),
                "valid_until": (now + timedelta(hours=4)).isoformat(),
            },
            headers=operator_headers,
        )
        order.raise_for_status()
        dock = await client.post(
            f"/api/v1/warehouse/orders/{order_id}/dock-sessions",
            headers=operator_headers,
        )
        dock.raise_for_status()
        inspection_id = dock.json()["id"]
        capture = await client.post(
            f"/api/v1/warehouse/dock-sessions/{inspection_id}/captures",
            files={"image": ("cargo.jpg", b"simulated-cargo", "image/jpeg")},
            headers=device_headers,
        )
        capture.raise_for_status()
        finalize = await client.post(
            f"/api/v1/warehouse/dock-sessions/{inspection_id}/finalize",
            json={
                "operator_note": "Đã xác nhận hàng hóa mô phỏng",
                "final_cargo_state": "LOADED",
            },
            headers=operator_headers,
        )
        finalize.raise_for_status()
        slip = await client.post(
            f"/api/v1/warehouse/orders/{order_id}/exit-slip",
            headers=operator_headers,
        )
        slip.raise_for_status()
        qr = await client.get(f"/api/v1/warehouse/orders/{order_id}/exit-slip/qr")
        qr.raise_for_status()
        checkout = await client.post(
            "/api/v1/gates/exit/verifications",
            data={"event_id": f"sim-exit-{uuid4()}", "gate_id": "gate-out-sim"},
            files={
                "plate_image": ("plate.jpg", b"simulated-plate", "image/jpeg"),
                "face_image": ("face.jpg", b"simulated-face", "image/jpeg"),
                "slip_image": ("slip.png", qr.content, "image/png"),
            },
            headers=device_headers,
        )
        checkout.raise_for_status()
        final_order = await client.get(f"/api/v1/warehouse/orders/{order_id}")
        final_order.raise_for_status()
        checkout_payload = checkout.json()
        final_order_payload = final_order.json()
        if (
            checkout_payload["verification_status"] != "PASSED"
            or not checkout_payload["permit_granted"]
            or final_order_payload["status"] != "COMPLETED"
        ):
            raise RuntimeError(
                "Gate Out không hoàn tất an toàn: "
                f"verification={checkout_payload}, order={final_order_payload}"
            )
        print(
            "Workflow hoàn tất:",
            {
                "entry": entry.json()["verification_status"],
                "exit": checkout_payload["verification_status"],
                "permit": checkout_payload["permit_granted"],
                "order_status": final_order_payload["status"],
            },
        )


if __name__ == "__main__":
    asyncio.run(run())
