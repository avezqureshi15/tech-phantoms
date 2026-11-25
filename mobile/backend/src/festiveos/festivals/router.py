import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from festiveos.auth.dependencies import CurrentUser
from festiveos.core import limits
from festiveos.core.pagination import Limit, Offset
from festiveos.festivals.dependencies import FestivalServiceDep
from festiveos.festivals.schemas import (
    EventCreate,
    EventRead,
    FestivalCreate,
    FestivalDetail,
    FestivalRead,
    FestivalStatus,
    FestivalUpdate,
)

router = APIRouter(tags=["festivals"])


@router.post(
    "/households/{household_id}/festivals",
    response_model=FestivalRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limits.write)],
)
def create_festival(
    household_id: uuid.UUID,
    payload: FestivalCreate,
    user: CurrentUser,
    service: FestivalServiceDep,
):
    return service.create(user, household_id, payload)


@router.get(
    "/households/{household_id}/festivals",
    response_model=list[FestivalRead],
    dependencies=[Depends(limits.read)],
)
def list_festivals(
    household_id: uuid.UUID,
    user: CurrentUser,
    service: FestivalServiceDep,
    festival_status: Annotated[FestivalStatus | None, Query(alias="status")] = None,
    limit: Limit = 50,
    offset: Offset = 0,
):
    return service.list_for_household(user, household_id, festival_status, limit, offset)


@router.get(
    "/festivals/{festival_id}", response_model=FestivalDetail, dependencies=[Depends(limits.read)]
)
def get_festival(festival_id: uuid.UUID, user: CurrentUser, service: FestivalServiceDep):
    return service.get_detail(user, festival_id)


@router.patch(
    "/festivals/{festival_id}", response_model=FestivalRead, dependencies=[Depends(limits.write)]
)
def update_festival(
    festival_id: uuid.UUID,
    payload: FestivalUpdate,
    user: CurrentUser,
    service: FestivalServiceDep,
):
    return service.update(user, festival_id, payload)


@router.post(
    "/festivals/{festival_id}/events",
    response_model=EventRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limits.write)],
)
def add_event(
    festival_id: uuid.UUID,
    payload: EventCreate,
    user: CurrentUser,
    service: FestivalServiceDep,
):
    return service.add_event(user, festival_id, payload)
