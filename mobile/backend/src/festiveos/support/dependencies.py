from typing import Annotated

from fastapi import Depends

from festiveos.db.dependencies import SessionDep
from festiveos.integrations.diya import DiyaClient, get_diya
from festiveos.support.service import SupportService


def get_support_service(
    session: SessionDep, diya: Annotated[DiyaClient | None, Depends(get_diya)]
) -> SupportService:
    return SupportService(session, diya)


SupportServiceDep = Annotated[SupportService, Depends(get_support_service)]
