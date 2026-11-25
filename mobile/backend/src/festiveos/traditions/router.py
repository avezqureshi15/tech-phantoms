import uuid

from fastapi import APIRouter, Depends, status

from festiveos.auth.dependencies import CurrentUser
from festiveos.core import limits
from festiveos.core.pagination import Limit, Offset
from festiveos.traditions.dependencies import TraditionServiceDep
from festiveos.traditions.schemas import (
    ChecklistItem,
    OccurrenceCreate,
    OccurrenceRead,
    TraditionCreate,
    TraditionDetail,
    TraditionRead,
    TraditionUpdate,
)

router = APIRouter(tags=["traditions"])


@router.post(
    "/households/{household_id}/traditions",
    response_model=TraditionRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limits.write)],
)
def create_tradition(
    household_id: uuid.UUID,
    payload: TraditionCreate,
    user: CurrentUser,
    service: TraditionServiceDep,
):
    return service.create(user, household_id, payload)


@router.get(
    "/households/{household_id}/traditions",
    response_model=list[TraditionRead],
    dependencies=[Depends(limits.read)],
)
def list_traditions(
    household_id: uuid.UUID,
    user: CurrentUser,
    service: TraditionServiceDep,
    festival_type: str | None = None,
    active: bool | None = None,
    limit: Limit = 50,
    offset: Offset = 0,
):
    return service.list_for_household(user, household_id, festival_type, active, limit, offset)


@router.get(
    "/traditions/{tradition_id}",
    response_model=TraditionDetail,
    dependencies=[Depends(limits.read)],
)
def get_tradition(tradition_id: uuid.UUID, user: CurrentUser, service: TraditionServiceDep):
    return service.get_detail(user, tradition_id)


@router.patch(
    "/traditions/{tradition_id}", response_model=TraditionRead, dependencies=[Depends(limits.write)]
)
def update_tradition(
    tradition_id: uuid.UUID,
    payload: TraditionUpdate,
    user: CurrentUser,
    service: TraditionServiceDep,
):
    return service.update(user, tradition_id, payload)


@router.post(
    "/traditions/{tradition_id}/occurrences",
    response_model=OccurrenceRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limits.write)],
)
def record_occurrence(
    tradition_id: uuid.UUID,
    payload: OccurrenceCreate,
    user: CurrentUser,
    service: TraditionServiceDep,
):
    return service.record_occurrence(user, tradition_id, payload)


@router.get(
    "/festivals/{festival_id}/checklist",
    response_model=list[ChecklistItem],
    dependencies=[Depends(limits.read)],
)
def get_festival_checklist(festival_id: uuid.UUID, user: CurrentUser, service: TraditionServiceDep):
    return service.checklist(user, festival_id)
