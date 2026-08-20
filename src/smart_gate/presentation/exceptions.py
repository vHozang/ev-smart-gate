from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from smart_gate.domain.exceptions import SmartGateError

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """Ánh xạ lỗi ổn định và không làm lộ stack trace cho client."""

    @app.exception_handler(SmartGateError)
    async def smart_gate_error_handler(request: Request, exc: SmartGateError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "REQUEST_VALIDATION_FAILED",
                    "message": "Dữ liệu yêu cầu không hợp lệ",
                    "details": {"errors": exc.errors()},
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Lỗi ngoài dự kiến khi xử lý %s", request.url.path, exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "Hệ thống gặp lỗi ngoài dự kiến",
                    "details": {},
                }
            },
        )
