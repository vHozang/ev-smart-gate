from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from smart_gate.application.dto import (
    ChangeEmployeeCardStatusInput,
    IssueEmployeeCardInput,
    ReplaceEmployeeCardInput,
)
from smart_gate.bootstrap.container import Container
from smart_gate.domain.entities import EmployeeCard, User
from smart_gate.domain.enums import UserRole
from smart_gate.domain.services import mask_card_uid
from smart_gate.presentation.dependencies import get_container, require_roles
from smart_gate.presentation.schemas import (
    EmployeeCardIssueRequest,
    EmployeeCardReplaceRequest,
    EmployeeCardResponse,
    EmployeeCardStatusRequest,
)

router = APIRouter(prefix="/api/v1", tags=["Quản lý thẻ nhân viên"])


def _card_response(card: EmployeeCard) -> EmployeeCardResponse:
    return EmployeeCardResponse(
        id=card.id,
        card_uid_masked=mask_card_uid(card.card_uid),
        driver_id=card.driver_id,
        status=card.status,
        status_reason=card.status_reason,
        replaces_card_id=card.replaces_card_id,
        replaced_by_card_id=card.replaced_by_card_id,
        metadata=card.metadata,
        issued_at=card.issued_at,
        updated_at=card.updated_at,
    )


@router.post(
    "/employee-cards",
    response_model=EmployeeCardResponse,
    status_code=status.HTTP_201_CREATED,
)
async def issue_employee_card(
    payload: EmployeeCardIssueRequest,
    user: User = Depends(require_roles(UserRole.ADMIN, csrf=True)),
    container: Container = Depends(get_container),
) -> EmployeeCardResponse:
    card = await container.card_management.issue(
        IssueEmployeeCardInput(
            driver_id=payload.driver_id,
            card_uid=payload.card_uid,
            status_reason=payload.status_reason,
            metadata=payload.metadata,
        )
    )
    return _card_response(card)


@router.get(
    "/employee-cards",
    response_model=list[EmployeeCardResponse],
)
async def list_employee_cards(
    driver_id: UUID | None = Query(default=None),
    user: User = Depends(require_roles(UserRole.ADMIN)),
    container: Container = Depends(get_container),
) -> list[EmployeeCardResponse]:
    if driver_id is not None:
        cards = await container.card_management.list_for_driver(driver_id)
    else:
        cards = await container.card_management.list_all()
    return [_card_response(item) for item in cards]


@router.get(
    "/employee-cards/{card_id}",
    response_model=EmployeeCardResponse,
)
async def get_employee_card(
    card_id: UUID,
    user: User = Depends(require_roles(UserRole.ADMIN)),
    container: Container = Depends(get_container),
) -> EmployeeCardResponse:
    card = await container.card_management.get(card_id)
    return _card_response(card)


@router.post(
    "/employee-cards/{card_id}/block",
    response_model=EmployeeCardResponse,
)
async def block_employee_card(
    card_id: UUID,
    payload: EmployeeCardStatusRequest,
    user: User = Depends(require_roles(UserRole.ADMIN, csrf=True)),
    container: Container = Depends(get_container),
) -> EmployeeCardResponse:
    card = await container.card_management.block(
        card_id,
        ChangeEmployeeCardStatusInput(status_reason=payload.status_reason),
    )
    return _card_response(card)


@router.post(
    "/employee-cards/{card_id}/report-lost",
    response_model=EmployeeCardResponse,
)
async def report_lost_employee_card(
    card_id: UUID,
    payload: EmployeeCardStatusRequest,
    user: User = Depends(require_roles(UserRole.ADMIN, csrf=True)),
    container: Container = Depends(get_container),
) -> EmployeeCardResponse:
    card = await container.card_management.report_lost(
        card_id,
        ChangeEmployeeCardStatusInput(status_reason=payload.status_reason),
    )
    return _card_response(card)


@router.post(
    "/employee-cards/{card_id}/replace",
    response_model=EmployeeCardResponse,
    status_code=status.HTTP_201_CREATED,
)
async def replace_employee_card(
    card_id: UUID,
    payload: EmployeeCardReplaceRequest,
    user: User = Depends(require_roles(UserRole.ADMIN, csrf=True)),
    container: Container = Depends(get_container),
) -> EmployeeCardResponse:
    card = await container.card_management.replace(
        card_id,
        ReplaceEmployeeCardInput(
            card_uid=payload.card_uid,
            status_reason=payload.status_reason,
            metadata=payload.metadata,
        ),
    )
    return _card_response(card)
