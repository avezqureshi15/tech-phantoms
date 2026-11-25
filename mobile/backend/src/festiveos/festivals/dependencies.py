from typing import Annotated

from fastapi import Depends

from festiveos.db.dependencies import SessionDep
from festiveos.festivals.service import FestivalService


def get_festival_service(session: SessionDep) -> FestivalService:
    return FestivalService(session)


FestivalServiceDep = Annotated[FestivalService, Depends(get_festival_service)]
