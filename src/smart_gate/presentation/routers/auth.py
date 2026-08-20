from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response

from smart_gate.application.dto import LoginInput
from smart_gate.bootstrap.container import Container
from smart_gate.domain.entities import User
from smart_gate.presentation.dependencies import csrf_user, current_user, get_container
from smart_gate.presentation.schemas import (
    LoginRequest,
    LoginResponse,
    MessageResponse,
    UserResponse,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Xác thực"])


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    container: Container = Depends(get_container),
) -> LoginResponse:
    tokens = await container.auth.login(LoginInput(**payload.model_dump()))
    user = await container.auth.authenticate_session(tokens.session_token)
    response.set_cookie(
        container.settings.session_cookie_name,
        tokens.session_token,
        httponly=True,
        secure=container.settings.cookie_secure,
        samesite="strict",
        path="/",
        max_age=container.settings.session_ttl_seconds,
    )
    response.set_cookie(
        container.settings.csrf_cookie_name,
        tokens.csrf_token,
        httponly=False,
        secure=container.settings.cookie_secure,
        samesite="strict",
        path="/",
        max_age=container.settings.session_ttl_seconds,
    )
    return LoginResponse(
        user_id=user.id,
        username=user.username,
        role=user.role,
        csrf_token=tokens.csrf_token,
        expires_at=tokens.expires_at,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    response: Response,
    user: User = Depends(csrf_user),
    container: Container = Depends(get_container),
) -> MessageResponse:
    await container.auth.logout(request.cookies.get(container.settings.session_cookie_name))
    response.delete_cookie(container.settings.session_cookie_name, path="/")
    response.delete_cookie(container.settings.csrf_cookie_name, path="/")
    return MessageResponse(message="Đã đăng xuất")


@router.get("/me", response_model=UserResponse)
async def me(
    request: Request,
    user: User = Depends(current_user),
    container: Container = Depends(get_container),
) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        csrf_token=request.cookies.get(container.settings.csrf_cookie_name),
    )
