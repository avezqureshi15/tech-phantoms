import uuid

from fastapi import APIRouter, Depends, Response, status

from festiveos.auth.dependencies import CurrentUser
from festiveos.core import limits
from festiveos.core.pagination import Limit, Offset
from festiveos.inventory.dependencies import InventoryServiceDep
from festiveos.inventory.schemas import (
    InventoryCategory,
    InventoryItemCreate,
    InventoryItemRead,
    InventoryItemUpdate,
)

router = APIRouter(tags=["inventory"])


@router.post(
    "/households/{household_id}/inventory",
    response_model=InventoryItemRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limits.write)],
)
def create_item(
    household_id: uuid.UUID,
    payload: InventoryItemCreate,
    user: CurrentUser,
    service: InventoryServiceDep,
):
    return service.create(user, household_id, payload)


@router.get(
    "/households/{household_id}/inventory",
    response_model=list[InventoryItemRead],
    dependencies=[Depends(limits.read)],
)
def list_items(
    household_id: uuid.UUID,
    user: CurrentUser,
    service: InventoryServiceDep,
    category: InventoryCategory | None = None,
    limit: Limit = 50,
    offset: Offset = 0,
):
    return service.list_for_household(
        user, household_id, category.value if category else None, limit, offset
    )


@router.patch(
    "/inventory/{item_id}", response_model=InventoryItemRead, dependencies=[Depends(limits.write)]
)
def update_item(
    item_id: uuid.UUID,
    payload: InventoryItemUpdate,
    user: CurrentUser,
    service: InventoryServiceDep,
):
    return service.update(user, item_id, payload)


@router.delete(
    "/inventory/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(limits.write)],
)
def delete_item(item_id: uuid.UUID, user: CurrentUser, service: InventoryServiceDep):
    service.delete(user, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
