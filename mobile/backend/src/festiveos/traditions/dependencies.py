from typing import Annotated

from fastapi import Depends

from festiveos.db.dependencies import SessionDep
from festiveos.traditions.service import TraditionService


def get_tradition_service(session: SessionDep) -> TraditionService:
    return TraditionService(session)


TraditionServiceDep = Annotated[TraditionService, Depends(get_tradition_service)]
