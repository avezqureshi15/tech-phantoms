"""Writes Utsav may propose. The model never executes one: it proposes, the server renders a
confirmation card from the *validated parameters* (not from anything the model wrote), and the
action runs only after the person approves, as that person, through the normal services, so
every permission check a human would face applies to Utsav too.
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from festiveos.ai.cards import Detail
from festiveos.expenses.schemas import (
    ExpenseCategory,
    ExpenseCreate,
    SplitEntry,
    SplitInput,
    SplitType,
)
from festiveos.expenses.service import ExpenseService
from festiveos.festivals.schemas import FestivalCreate, FestivalType
from festiveos.festivals.service import FestivalService
from festiveos.households.service import HouseholdService
from festiveos.inventory.schemas import InventoryItemCreate
from festiveos.inventory.service import InventoryService
from festiveos.users.models import User


@dataclass(frozen=True)
class ActionServices:
    festivals: FestivalService
    inventory: InventoryService
    expenses: ExpenseService
    households: HouseholdService


class ExpenseProposal(BaseModel):
    """What the model supplies for an expense. It names no people and no ids: the person paying is
    always the one who approves, and the split is always equal between everyone in the group.
    Anything more specific is something the person does themselves on the expense screen."""

    model_config = ConfigDict(extra="forbid")

    description: str = Field(min_length=1, max_length=120)
    amount: Decimal = Field(gt=0, le=Decimal(10000000), decimal_places=2, description="In rupees")
    category: ExpenseCategory = ExpenseCategory.OTHER
    spent_on: date | None = Field(default=None, description="Defaults to today")


@dataclass(frozen=True)
class ActionSpec[P: BaseModel]:
    title: str
    params: type[P]
    summary: Callable[[P], str]
    details: Callable[[P], list[Detail]]
    execute: Callable[[ActionServices, User, uuid.UUID, P], dict[str, object]]


def _add_inventory(
    services: ActionServices, actor: User, household_id: uuid.UUID, params: InventoryItemCreate
) -> dict[str, object]:
    item = services.inventory.create(actor, household_id, params)
    return {"id": str(item.id), "name": item.name, "quantity": item.quantity}


def _create_festival(
    services: ActionServices, actor: User, household_id: uuid.UUID, params: FestivalCreate
) -> dict[str, object]:
    festival = services.festivals.create(actor, household_id, params)
    return {"id": str(festival.id), "name": festival.name}


def _add_expense(
    services: ActionServices, actor: User, household_id: uuid.UUID, params: ExpenseProposal
) -> dict[str, object]:
    members = services.households.get_detail(actor, household_id).members
    expense = services.expenses.create(
        actor,
        household_id,
        ExpenseCreate(
            description=params.description.strip(),
            amount_minor=int((params.amount * 100).to_integral_value()),
            paid_by=actor.id,
            split=SplitInput(
                type=SplitType.EQUAL, entries=[SplitEntry(user_id=m.user.id) for m in members]
            ),
            category=params.category,
            spent_on=params.spent_on or date.today(),
        ),
    )
    return {
        "id": str(expense.id),
        "description": expense.description,
        "split_between": len(members),
    }


def _rupees(value: Decimal) -> str:
    whole = value == value.to_integral_value()
    return f"\u20b9{value:,.0f}" if whole else f"\u20b9{value:,.2f}"


def _day(value: date) -> str:
    return value.strftime("%d %b %Y")


ACTIONS: dict[str, ActionSpec[Any]] = {
    "add_expense": ActionSpec(
        title="Add an expense",
        params=ExpenseProposal,
        summary=lambda p: (
            f"Add {_rupees(p.amount)} for {p.description.strip()}, paid by you and split equally."
        ),
        details=lambda p: [
            Detail(label="What", value=p.description.strip()),
            Detail(label="Amount", value=_rupees(p.amount)),
            Detail(label="Category", value=p.category.value),
            Detail(label="Date", value=_day(p.spent_on) if p.spent_on else "Today"),
            Detail(label="Paid by", value="You"),
            Detail(label="Split", value="Equally between everyone in the group"),
        ],
        execute=_add_expense,
    ),
    "add_inventory_item": ActionSpec(
        title="Add to your household inventory",
        params=InventoryItemCreate,
        summary=lambda p: f"Add {p.quantity} x {p.name} to the household inventory.",
        details=lambda p: [
            Detail(label="Item", value=p.name),
            Detail(label="Category", value=p.category.value),
            Detail(label="Quantity", value=str(p.quantity)),
        ],
        execute=_add_inventory,
    ),
    "create_festival": ActionSpec(
        title="Create a festival",
        params=FestivalCreate,
        summary=lambda p: f"Create the festival '{p.name}' ({_day(p.start_date)}).",
        details=lambda p: [
            Detail(label="Name", value=p.name),
            Detail(label="Type", value=FestivalType(p.type).value),
            Detail(label="From", value=_day(p.start_date)),
            Detail(label="To", value=_day(p.end_date)),
        ],
        execute=_create_festival,
    ),
}
