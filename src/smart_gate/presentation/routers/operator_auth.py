from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request, Response, Security
from fastapi.security import APIKeyCookie, APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from smart_gate.application.operator_auth import (
    LEGACY_SESSION_ID,
    IssuedIdentity,
    OperatorAuthService,
)
from smart_gate.bootstrap.container import Container
from smart_gate.domain.exceptions import (
    AuthenticationError,
    AuthorizationError,
    InfrastructureError,
)
from smart_gate.domain.operator_identity import OperatorPrincipal
from smart_gate.domain.permission_catalog import (
    APPROVED_NEW_PERMISSIONS,
    BASELINE_ROLE_PERMISSIONS,
    system_role_id,
)
from smart_gate.presentation.contracts.migration import (
    AccessTokenResponse,
    ChangePasswordRequest,
    EffectivePrincipal,
    ErrorEnvelope,
    LoginRequest,
    Message,
    TicketRequest,
    TicketResponse,
)
from smart_gate.presentation.dependencies import get_container

router = APIRouter(
    prefix="/api/v2/auth",
    tags=["Operator JWT v2"],
    responses={
        code: {
            "model": ErrorEnvelope,
            "headers": {
                "X-Request-ID": {"schema": {"type": "string"}},
                "Cache-Control": {"schema": {"type": "string", "const": "no-store"}},
            },
        }
        for code in (400, 401, 403, 409, 422, 429, 500, 503)
    },
)
bearer = HTTPBearer(scheme_name="OperatorJWT", auto_error=False)
refresh_cookie = APIKeyCookie(name="evsg_refresh", scheme_name="RefreshCookie", auto_error=False)
csrf_header = APIKeyHeader(name="X-CSRF-Token", scheme_name="AuthCsrf", auto_error=False)


def get_operator_auth(container: Container = Depends(get_container)) -> OperatorAuthService:
    if container.operator_auth is None:
        raise InfrastructureError("AUTH_NOT_READY", "Operator auth chưa sẵn sàng")
    return container.operator_auth


def require_origin(
    request: Request,
    origin: str = Header(alias="Origin"),
    container: Container = Depends(get_container),
) -> None:
    expected = container.settings.app_public_origin.rstrip("/")
    if container.settings.app_env == "local":
        allowed = {expected, *(item.rstrip("/") for item in container.settings.cors_origin_list)}
        if origin.rstrip("/") not in allowed:
            raise AuthorizationError("ORIGIN_DENIED", "Origin không được phép")
        return
    if origin != expected:
        raise AuthorizationError("ORIGIN_DENIED", "Origin không được phép")


async def operator_principal(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer),
    service: OperatorAuthService = Depends(get_operator_auth),
) -> OperatorPrincipal:
    if credentials is None:
        raise AuthenticationError("ACCESS_TOKEN_REQUIRED", "Cần Bearer access token")
    return await service.authenticate(credentials.credentials)


async def operator_or_session_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(bearer),
    container: Container = Depends(get_container),
) -> OperatorPrincipal:
    """Hỗ trợ Bearer JWT v2 và tương thích ngược session cookie v1 trên các API vận hành/quản trị."""

    if credentials is not None:
        if container.operator_auth is None:
            raise InfrastructureError("AUTH_NOT_READY", "Operator auth chưa sẵn sàng")
        return await container.operator_auth.authenticate(credentials.credentials)
    cookie = request.cookies.get(container.settings.session_cookie_name)
    if cookie and container.settings.auth_legacy_enabled:
        user = await container.auth.authenticate_session(cookie)
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            await container.auth.validate_csrf(cookie, request.headers.get("X-CSRF-Token"))
        if container.operator_auth is not None:
            op_user = await container.operator_auth.users.get(user.id)
            if op_user is not None:
                if not op_user.is_active:
                    raise AuthenticationError("USER_INACTIVE", "Tài khoản không còn hoạt động")
                op_role = await container.operator_auth.roles.get(op_user.role_id)
                if op_role is not None and op_role.is_active:
                    perms = frozenset() if op_user.must_change_password else op_role.permissions
                    return OperatorPrincipal(
                        id=op_user.id,
                        username=op_user.username,
                        role_id=op_role.id,
                        role_code=op_role.code,
                        permissions=perms,
                        authz_version=op_user.authz_version,
                        must_change_password=op_user.must_change_password,
                        session_id=LEGACY_SESSION_ID,
                        session_version=op_user.session_version,
                        role_version=op_role.version,
                    )
        code = user.role.value
        role_id = user.role_id or system_role_id(code)
        base_perms = BASELINE_ROLE_PERMISSIONS.get(code, frozenset()) | APPROVED_NEW_PERMISSIONS.get(
            code, frozenset()
        )
        perms = frozenset() if user.must_change_password else (user.permissions or base_perms)
        return OperatorPrincipal(
            id=user.id,
            username=user.username,
            role_id=role_id,
            role_code=code,
            permissions=perms,
            authz_version=user.authz_version,
            must_change_password=user.must_change_password,
            session_id=LEGACY_SESSION_ID,
            session_version=user.session_version,
            role_version=1,
        )
    raise AuthenticationError("ACCESS_TOKEN_REQUIRED", "Cần Bearer access token")


def principal_response(principal: OperatorPrincipal) -> EffectivePrincipal:
    return EffectivePrincipal(
        id=principal.id,
        username=principal.username,
        role_id=principal.role_id,
        role_code=principal.role_code,
        permissions=sorted(principal.permissions),
        authz_version=principal.authz_version,
        must_change_password=principal.must_change_password,
    )


def _issued_response(
    issued: IssuedIdentity, response: Response, container: Container
) -> AccessTokenResponse:
    response.headers["Cache-Control"] = "no-store"
    service = container.operator_auth
    if service is None:
        raise InfrastructureError("AUTH_NOT_READY", "Operator auth chưa sẵn sàng")
    max_age = max(0, int((issued.family.expires_at - service.clock.now()).total_seconds()))
    response.set_cookie(
        "evsg_refresh",
        issued.refresh_token,
        httponly=True,
        secure=container.settings.cookie_secure,
        samesite="strict",
        path="/api/v2/auth",
        max_age=max_age,
    )
    response.set_cookie(
        "evsg_auth_csrf",
        issued.csrf_token,
        httponly=False,
        secure=container.settings.cookie_secure,
        samesite="strict",
        path="/",
        max_age=max_age,
    )
    response.headers["X-CSRF-Token"] = issued.csrf_token
    return AccessTokenResponse(
        access_token=issued.access_token,
        token_type="Bearer",
        expires_in=issued.expires_in,
        principal=principal_response(issued.principal),
    )


def _client_key(request: Request) -> str:
    # Không tin X-Forwarded-For tùy ý; proxy trust là cấu hình triển khai riêng.
    return request.client.host if request.client else "unknown-client"


@router.post(
    "/login",
    response_model=AccessTokenResponse,
    operation_id="loginV2",
    dependencies=[Depends(require_origin)],
)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    container: Container = Depends(get_container),
    service: OperatorAuthService = Depends(get_operator_auth),
) -> AccessTokenResponse:
    issued = await service.login(
        payload.username, payload.password.get_secret_value(), _client_key(request)
    )
    return _issued_response(issued, response, container)


@router.post(
    "/refresh",
    response_model=AccessTokenResponse,
    operation_id="refreshV2",
    dependencies=[Depends(require_origin)],
    openapi_extra={"security": [{"RefreshCookie": [], "AuthCsrf": []}]},
)
async def refresh(
    request: Request,
    response: Response,
    credential: str | None = Security(refresh_cookie),
    csrf: str | None = Security(csrf_header),
    container: Container = Depends(get_container),
    service: OperatorAuthService = Depends(get_operator_auth),
) -> AccessTokenResponse:
    issued = await service.refresh(
        credential, request.cookies.get("evsg_auth_csrf"), csrf, _client_key(request)
    )
    return _issued_response(issued, response, container)


@router.get("/me", response_model=EffectivePrincipal, operation_id="principalV2")
async def me(
    response: Response, principal: OperatorPrincipal = Depends(operator_principal)
) -> EffectivePrincipal:
    response.headers["Cache-Control"] = "no-store"
    return principal_response(principal)


@router.post(
    "/logout",
    response_model=Message,
    operation_id="logoutV2",
    dependencies=[Depends(require_origin)],
    openapi_extra={"security": [{"RefreshCookie": [], "AuthCsrf": []}, {"OperatorJWT": []}]},
)
async def logout(
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Security(bearer),
    credential: str | None = Security(refresh_cookie),
    csrf: str | None = Security(csrf_header),
    container: Container = Depends(get_container),
    service: OperatorAuthService = Depends(get_operator_auth),
) -> Message:
    principal = await service.authenticate(credentials.credentials) if credentials else None
    await service.logout(
        principal=principal,
        credential=credential,
        csrf_cookie=request.cookies.get("evsg_auth_csrf"),
        csrf_header=csrf,
    )
    response.delete_cookie(
        "evsg_refresh",
        path="/api/v2/auth",
        httponly=True,
        secure=container.settings.cookie_secure,
        samesite="strict",
    )
    response.delete_cookie(
        "evsg_auth_csrf", path="/", secure=container.settings.cookie_secure, samesite="strict"
    )
    response.headers["Cache-Control"] = "no-store"
    return Message(message="Đã đăng xuất")


@router.post(
    "/change-password",
    response_model=AccessTokenResponse,
    operation_id="changePasswordV2",
    dependencies=[Depends(require_origin)],
)
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    principal: OperatorPrincipal = Depends(operator_principal),
    container: Container = Depends(get_container),
    service: OperatorAuthService = Depends(get_operator_auth),
) -> AccessTokenResponse:
    issued = await service.change_password(
        principal,
        payload.current_password.get_secret_value(),
        payload.new_password.get_secret_value(),
        request.state.request_id,
    )
    return _issued_response(issued, response, container)


@router.post(
    "/ws-tickets",
    response_model=TicketResponse,
    status_code=201,
    operation_id="createWsTicket",
    dependencies=[Depends(require_origin)],
    openapi_extra={
        "security": [{"OperatorJWT": []}],
        "x-required-permissions-all": ["alerts:read"],
    },
)
async def create_ws_ticket(
    payload: TicketRequest,
    request: Request,
    response: Response,
    principal: OperatorPrincipal = Depends(operator_or_session_principal),
    service: OperatorAuthService = Depends(get_operator_auth),
) -> TicketResponse:
    response.headers["Cache-Control"] = "no-store"
    raw, ticket = await service.issue_ticket(principal, payload.channel)
    return TicketResponse(
        ticket=raw,
        expires_at=ticket.expires_at,
        websocket_path="/ws/v2/security/alerts",
    )
