from __future__ import annotations

import io
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import Response
from PIL import Image, ImageDraw

app = FastAPI(title="Camera Simulator")


def _placeholder(label: str) -> bytes:
    image = Image.new("RGB", (960, 540), "#e9e2d0")
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 80, 880, 460), outline="#173f35", width=8)
    draw.text((120, 230), label, fill="#173f35", stroke_width=1)
    stream = io.BytesIO()
    image.save(stream, format="JPEG", quality=92)
    return stream.getvalue()


@app.get("/{capture_type}.jpg")
async def capture(capture_type: str) -> Response:
    """Trả ảnh fixture nếu được mount, nếu không trả ảnh giả để kiểm tra đường truyền."""

    fixture = Path("/fixtures") / f"{capture_type}.jpg"
    if fixture.is_file():
        return Response(fixture.read_bytes(), media_type="image/jpeg")
    return Response(_placeholder(f"SMART GATE - {capture_type.upper()}"), media_type="image/jpeg")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
