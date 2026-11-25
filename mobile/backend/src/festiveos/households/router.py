import uuid

from fastapi import APIRouter, Depends, Response, status

from festiveos.auth.dependencies import CurrentUser
from festiveos.core import limits
from festiveos.households.dependencies import HouseholdServiceDep
from festiveos.households.schemas import (
    HouseholdCreate,
    HouseholdDetail,
    HouseholdRead,
    HouseholdUpdate,
    MemberCreate,
    MemberRead,
    MemberUpdate,
)

router = APIRouter(prefix="/households", tags=["households"])


@router.post(
    "",
    response_model=HouseholdRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limits.create_household)],
)
def create_household(payload: HouseholdCreate, user: CurrentUser, service: HouseholdServiceDep):
    return service.create(user, payload)


@router.get("", response_model=list[HouseholdRead], dependencies=[Depends(limits.read)])
def list_my_households(user: CurrentUser, service: HouseholdServiceDep):
    return service.list_mine(user)


@router.get("/{household_id}", response_model=HouseholdDetail, dependencies=[Depends(limits.read)])
def get_household(household_id: uuid.UUID, user: CurrentUser, service: HouseholdServiceDep):
    return service.get_detail(user, household_id)


@router.patch("/{household_id}", response_model=HouseholdRead, dependencies=[Depends(limits.write)])
def update_household(
    household_id: uuid.UUID,
    payload: HouseholdUpdate,
    user: CurrentUser,
    service: HouseholdServiceDep,
):
    return service.update(user, household_id, payload)


@router.delete(
    "/{household_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(limits.destructive)],
)
def delete_household(
    household_id: uuid.UUID, user: CurrentUser, service: HouseholdServiceDep
) -> Response:
    service.delete(user, household_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{household_id}/members",
    response_model=MemberRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limits.invite_member)],
)
def add_member(
    household_id: uuid.UUID,
    payload: MemberCreate,
    user: CurrentUser,
    service: HouseholdServiceDep,
):
    return service.add_member(user, household_id, payload)


@router.patch(
    "/{household_id}/members/{user_id}",
    response_model=MemberRead,
    dependencies=[Depends(limits.write)],
)
def update_member(
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: MemberUpdate,
    user: CurrentUser,
    service: HouseholdServiceDep,
):
    return service.update_member(user, household_id, user_id, payload)


@router.delete(
    "/{household_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(limits.destructive)],
)
def remove_member(
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    user: CurrentUser,
    service: HouseholdServiceDep,
) -> Response:
    service.remove_member(user, household_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
