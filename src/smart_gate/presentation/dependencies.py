from __future__ import annotations

from fastapi import Depends, Request

from smart_gate.bootstrap.container import Container
from smart_gate.domain.entities import DeviceCredential, User
from smart_gate.domain.enums import UserRole
from smart_gate.domain.exceptions import (
    AuthenticationError,
    AuthorizationError,
    InfrastructureError,
)
from smart_gate.domain.operator_identity import OperatorPrincipal
from smart_gate.domain.permission_catalog import HTTP_PERMISSIONS

OperatorActor = User | OperatorPrincipal


def get_container(request: Request) -> Container:
    return request.app.state.container


async def current_user(
    request: Request, container: Container = Depends(get_container)
) -> OperatorActor:
    authorization = request.headers.get("Authorization")
    if authorization:
        if not container.settings.operator_auth_enabled or request.url.path.startswith(
            "/api/v1/auth/"
        ):
            raise AuthenticationError("AUTH_VERSION_UNSUPPORTED", "Bearer auth yêu cầu API auth v2")
        scheme, separator, token = authorization.partition(" ")
        if not separator or scheme.lower() != "bearer" or not token or " " in token:
            raise AuthenticationError("ACCESS_TOKEN_INVALID", "Bearer header không hợp lệ")
        if container.operator_auth is None:
            raise InfrastructureError("AUTH_NOT_READY", "Operator auth chưa sẵn sàng")
        return await container.operator_auth.authenticate(token)
    return await container.auth.authenticate_session(
        request.cookies.get(container.settings.session_cookie_name)
    )


async def csrf_user(
    request: Request,
    user: OperatorActor = Depends(current_user),
    container: Container = Depends(get_container),
) -> OperatorActor:
    if not isinstance(user, OperatorPrincipal):
        await container.auth.validate_csrf(
            request.cookies.get(container.settings.session_cookie_name),
            request.headers.get("X-CSRF-Token"),
        )
    return user


def _authorize_operation(
    user: OperatorActor, roles: tuple[UserRole, ...], request: Request
) -> None:
    if user.permissions is None:
        # Chỉ dùng enum cho dữ liệu chưa migrate; sau migration phải luôn dùng catalog.
        if not isinstance(user, User) or user.role not in roles:
            raise AuthorizationError("ROLE_DENIED", "Vai trò hiện tại không được phép thao tác")
        return
    if user.must_change_password:
        raise AuthorizationError("PASSWORD_CHANGE_REQUIRED", "Cần đổi mật khẩu trước khi tiếp tục")
    route = request.scope.get("route")
    permission = HTTP_PERMISSIONS.get((request.method, getattr(route, "path", "")))
    if permission is None or permission not in user.permissions:
        raise AuthorizationError("PERMISSION_DENIED", "Không có quyền thực hiện thao tác")


def require_roles(*roles: UserRole, csrf: bool = False):
    dependency = csrf_user if csrf else current_user

    async def authorize(
        request: Request, user: OperatorActor = Depends(dependency)
    ) -> OperatorActor:
        _authorize_operation(user, roles, request)
        return user

    return authorize


def require_device_scope(scope: str):
    async def authorize_device(
        request: Request, container: Container = Depends(get_container)
    ) -> DeviceCredential:
        return await container.auth.authorize_device(request.headers.get("X-Device-Key"), scope)

    return authorize_device


def require_device_or_roles(scope: str, *roles: UserRole):
    async def authorize(
        request: Request, container: Container = Depends(get_container)
    ) -> DeviceCredential | OperatorActor:
        api_key = request.headers.get("X-Device-Key")
        if api_key:
            return await container.auth.authorize_device(api_key, scope)
        user = await current_user(request, container)
        if not isinstance(user, OperatorPrincipal):
            await container.auth.validate_csrf(
                request.cookies.get(container.settings.session_cookie_name),
                request.headers.get("X-CSRF-Token"),
            )
        _authorize_operation(user, roles, request)
        return user

    return authorize
