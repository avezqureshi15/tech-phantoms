from typing import Annotated

from fastapi import Depends

from festiveos.db.dependencies import SessionDep
from festiveos.expenses.service import ExpenseService


def get_expense_service(session: SessionDep) -> ExpenseService:
    return ExpenseService(session)


ExpenseServiceDep = Annotated[ExpenseService, Depends(get_expense_service)]
