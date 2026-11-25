from typing import Annotated

from fastapi import Depends

from festiveos.db.dependencies import SessionDep
from festiveos.households.service import HouseholdService


def get_household_service(session: SessionDep) -> HouseholdService:
    return HouseholdService(session)


HouseholdServiceDep = Annotated[HouseholdService, Depends(get_household_service)]
