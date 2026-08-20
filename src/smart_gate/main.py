from __future__ import annotations

import logging
import secrets
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from smart_gate.bootstrap.lifecycle import build_lifespan
from smart_gate.config import Settings, get_settings
from smart_gate.presentation.exceptions import register_exception_handlers
from smart_gate.presentation.routers import (
    auth,
    gate_logs,
    gates,
    health,
    master_data,
    security,
    warehouse,
)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Dựng FastAPI app; mọi adapter cụ thể được khởi tạo trong lifespan."""

    resolved = settings or get_settings()
    logging.basicConfig(
        level=resolved.log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    app = FastAPI(
        title=resolved.app_name,
        version="0.1.0",
        description="API xác minh Smart Gate và quy trình xuất kho có QR Ed25519.",
        docs_url="/docs" if resolved.docs_enabled else None,
        redoc_url="/redoc" if resolved.docs_enabled else None,
        lifespan=build_lifespan(resolved),
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token", "X-Device-Key", "X-Request-ID"],
    )

    static_root = Path(__file__).resolve().parent / "presentation" / "static"
    app.mount("/assets", StaticFiles(directory=static_root / "assets"), name="web-assets")

    @app.get("/", include_in_schema=False, response_class=FileResponse)
    async def operator_console() -> FileResponse:
        """Phục vụ SPA cùng origin để cookie và CSRF hoạt động an toàn."""

        return FileResponse(
            static_root / "index.html",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or secrets.token_hex(12)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=()"
        return response

    register_exception_handlers(app)
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(master_data.router)
    app.include_router(warehouse.router)
    app.include_router(gates.router)
    app.include_router(gate_logs.router)
    app.include_router(security.router)
    app.include_router(security.ws_router)
    return app


app = create_app()
