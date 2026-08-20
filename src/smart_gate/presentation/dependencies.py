from __future__ import annotations

from fastapi import Depends, Request

from smart_gate.bootstrap.container import Container
from smart_gate.domain.entities import DeviceCredential, User
from smart_gate.domain.enums import UserRole
from smart_gate.domain.exceptions import AuthorizationError


def get_container(request: Request) -> Container:
    return request.app.state.container


async def current_user(
    request: Request,
    container: Container = Depends(get_container),
) -> User:
    return await container.auth.authenticate_session(
        request.cookies.get(container.settings.session_cookie_name)
    )


async def csrf_user(
    request: Request,
    user: User = Depends(current_user),
    container: Container = Depends(get_container),
) -> User:
    await container.auth.validate_csrf(
        request.cookies.get(container.settings.session_cookie_name),
        request.headers.get("X-CSRF-Token"),
    )
    return user


def require_roles(*roles: UserRole, csrf: bool = False):
    dependency = csrf_user if csrf else current_user

    async def authorize(user: User = Depends(dependency)) -> User:
        if user.role not in roles:
            raise AuthorizationError("ROLE_DENIED", "Vai trò hiện tại không được phép thao tác")
        return user

    return authorize


def require_device_scope(scope: str):
    async def authorize_device(
        request: Request,
        container: Container = Depends(get_container),
    ) -> DeviceCredential:
        return await container.auth.authorize_device(request.headers.get("X-Device-Key"), scope)

    return authorize_device


def require_device_or_roles(scope: str, *roles: UserRole):
    async def authorize(
        request: Request,
        container: Container = Depends(get_container),
    ) -> DeviceCredential | User:
        api_key = request.headers.get("X-Device-Key")
        if api_key:
            return await container.auth.authorize_device(api_key, scope)
        user = await container.auth.authenticate_session(
            request.cookies.get(container.settings.session_cookie_name)
        )
        await container.auth.validate_csrf(
            request.cookies.get(container.settings.session_cookie_name),
            request.headers.get("X-CSRF-Token"),
        )
        if user.role not in roles:
            raise AuthorizationError("ROLE_DENIED", "Vai trò hiện tại không được phép thao tác")
        return user

    return authorize
