class SmartGateError(Exception):
    """Lỗi nghiệp vụ có mã ổn định để Presentation ánh xạ sang HTTP."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 400,
        details: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class NotFoundError(SmartGateError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(code, message, status_code=404)


class ConflictError(SmartGateError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(code, message, status_code=409)


class AuthenticationError(SmartGateError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(code, message, status_code=401)


class AuthorizationError(SmartGateError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(code, message, status_code=403)


class InfrastructureError(SmartGateError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(code, message, status_code=503)
