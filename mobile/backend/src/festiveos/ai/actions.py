"""Writes Utsav may propose. The model never executes one: it proposes, the server renders a
confirmation card from the *validated parameters* (not from anything the model wrote), and the
action runs only after the person approves, as that person, through the normal services, so
every permission check a human would face applies to Utsav too.
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any

from pydantic import BaseModel

from festiveos.ai.cards import Detail
from festiveos.festivals.schemas import FestivalCreate, FestivalType
from festiveos.festivals.service import FestivalService
from festiveos.inventory.schemas import InventoryItemCreate
from festiveos.inventory.service import InventoryService
from festiveos.users.models import User


@dataclass(frozen=True)
class ActionServices:
    festivals: FestivalService
    inventory: InventoryService


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


def _day(value: date) -> str:
    return value.strftime("%d %b %Y")


ACTIONS: dict[str, ActionSpec[Any]] = {
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
