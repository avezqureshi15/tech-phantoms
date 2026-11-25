from typing import Annotated

from fastapi import Depends

from festiveos.db.dependencies import SessionDep
from festiveos.inventory.service import InventoryService


def get_inventory_service(session: SessionDep) -> InventoryService:
    return InventoryService(session)


InventoryServiceDep = Annotated[InventoryService, Depends(get_inventory_service)]
