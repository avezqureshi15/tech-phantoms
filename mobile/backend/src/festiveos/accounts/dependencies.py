from typing import Annotated

from fastapi import Depends

from festiveos.accounts.service import AccountService
from festiveos.db.dependencies import SessionDep


def get_account_service(session: SessionDep) -> AccountService:
    return AccountService(session)


AccountServiceDep = Annotated[AccountService, Depends(get_account_service)]
