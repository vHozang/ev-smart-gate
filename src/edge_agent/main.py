from __future__ import annotations

import asyncio
import logging
from uuid import uuid4

from edge_agent.capture import ImageSource
from edge_agent.client import SmartGateClient
from edge_agent.config import EdgeSettings

logger = logging.getLogger(__name__)


async def run() -> None:
    settings = EdgeSettings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    source = ImageSource(settings.request_timeout_seconds, settings.jpeg_quality)
    client = SmartGateClient(
        settings.api_url, settings.device_key, settings.request_timeout_seconds
    )
    try:
        while True:
            event_id = f"edge-{uuid4()}"
            try:
                plate_image, face_image = await asyncio.gather(
                    source.capture(settings.plate_source),
                    source.capture(settings.face_source),
                )
                slip_image = (
                    await source.capture(settings.slip_source)
                    if settings.workflow == "exit"
                    else None
                )
                result = await client.verify(
                    workflow=settings.workflow,
                    event_id=event_id,
                    gate_id=settings.gate_id,
                    plate_image=plate_image,
                    face_image=face_image,
                    slip_image=slip_image,
                )
                logger.info(
                    "Đã xử lý event %s: status=%s, permit=%s",
                    event_id,
                    result.get("verification_status"),
                    result.get("permit_granted"),
                )
            except Exception:
                logger.exception("Edge agent không xử lý được event %s", event_id)
            await asyncio.sleep(settings.interval_seconds)
    finally:
        await client.close()
        await source.close()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
