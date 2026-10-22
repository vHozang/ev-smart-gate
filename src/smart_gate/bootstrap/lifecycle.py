from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from smart_gate.bootstrap.container import Container
from smart_gate.config import Settings, get_settings


def build_lifespan(settings: Settings | None = None):
    """Tạo lifespan để khởi động và đóng hạ tầng theo đúng thứ tự."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        container = Container(settings or get_settings())
        try:
            await container.start()
            app.state.container = container
            yield
        finally:
            await container.close()

    return lifespan
