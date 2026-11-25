import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status

from festiveos.auth.dependencies import CurrentUser, require_feature
from festiveos.config import get_settings
from festiveos.core import limits
from festiveos.core.pagination import Limit, Offset
from festiveos.core.uploads import read_limited
from festiveos.expenses.dependencies import ExpenseServiceDep
from festiveos.expenses.schemas import (
    BalancesRead,
    ExpenseCreate,
    ExpenseRead,
    ExpenseUpdate,
    ReceiptDraft,
    SettlementCreate,
    SettlementRead,
    SummaryRead,
)
from festiveos.integrations.sarvam import SarvamClient, get_sarvam

router = APIRouter(tags=["expenses"])

SarvamDep = Annotated[SarvamClient | None, Depends(get_sarvam)]


@router.post(
    "/households/{household_id}/expenses/scan",
    response_model=ReceiptDraft,
    dependencies=[
        Depends(require_feature("receipt_scan")),
        Depends(limits.scan),
        Depends(limits.scan_daily),
    ],
)
def scan_receipt(
    household_id: uuid.UUID,
    user: CurrentUser,
    service: ExpenseServiceDep,
    reader: SarvamDep,
    file: Annotated[UploadFile, File()],
):
    """Read a receipt (photo or PDF) into a draft expense. Nothing is saved."""
    data = read_limited(file.file, get_settings().max_upload_bytes)
    return service.scan_receipt(user, household_id, data, file.filename or "receipt", reader)


@router.post(
    "/households/{household_id}/expenses",
    response_model=ExpenseRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limits.write)],
)
def create_expense(
    household_id: uuid.UUID, payload: ExpenseCreate, user: CurrentUser, service: ExpenseServiceDep
):
    return service.create(user, household_id, payload)


@router.get(
    "/households/{household_id}/expenses",
    response_model=list[ExpenseRead],
    dependencies=[Depends(limits.read)],
)
def list_expenses(
    household_id: uuid.UUID,
    user: CurrentUser,
    service: ExpenseServiceDep,
    festival_id: uuid.UUID | None = None,
    limit: Limit = 50,
    offset: Offset = 0,
):
    return service.list_for_household(user, household_id, festival_id, limit, offset)


@router.get(
    "/households/{household_id}/expenses/summary",
    response_model=SummaryRead,
    dependencies=[Depends(limits.read)],
)
def expense_summary(
    household_id: uuid.UUID,
    user: CurrentUser,
    service: ExpenseServiceDep,
    festival_id: uuid.UUID | None = None,
):
    return service.summary(user, household_id, festival_id)


@router.get(
    "/households/{household_id}/balances",
    response_model=BalancesRead,
    dependencies=[Depends(limits.read)],
)
def balances(
    household_id: uuid.UUID,
    user: CurrentUser,
    service: ExpenseServiceDep,
    festival_id: uuid.UUID | None = None,
):
    return service.balances(user, household_id, festival_id)


@router.get(
    "/expenses/{expense_id}", response_model=ExpenseRead, dependencies=[Depends(limits.read)]
)
def get_expense(expense_id: uuid.UUID, user: CurrentUser, service: ExpenseServiceDep):
    return service.get(user, expense_id)


@router.patch(
    "/expenses/{expense_id}", response_model=ExpenseRead, dependencies=[Depends(limits.write)]
)
def update_expense(
    expense_id: uuid.UUID, payload: ExpenseUpdate, user: CurrentUser, service: ExpenseServiceDep
):
    return service.update(user, expense_id, payload)


@router.delete(
    "/expenses/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(limits.write)],
)
def delete_expense(expense_id: uuid.UUID, user: CurrentUser, service: ExpenseServiceDep):
    service.delete(user, expense_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/households/{household_id}/settlements",
    response_model=SettlementRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limits.write)],
)
def record_settlement(
    household_id: uuid.UUID,
    payload: SettlementCreate,
    user: CurrentUser,
    service: ExpenseServiceDep,
):
    return service.settle(user, household_id, payload)


@router.get(
    "/households/{household_id}/settlements",
    response_model=list[SettlementRead],
    dependencies=[Depends(limits.read)],
)
def list_settlements(
    household_id: uuid.UUID,
    user: CurrentUser,
    service: ExpenseServiceDep,
    limit: Limit = 50,
    offset: Offset = 0,
):
    return service.list_settlements(user, household_id, limit, offset)


@router.delete(
    "/settlements/{settlement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(limits.write)],
)
def delete_settlement(settlement_id: uuid.UUID, user: CurrentUser, service: ExpenseServiceDep):
    service.delete_settlement(user, settlement_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
