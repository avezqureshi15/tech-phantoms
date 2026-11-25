import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from festiveos.core.schemas import InputModel

MAX_QUANTITY = 10_000


class InventoryCategory(StrEnum):
    SEATING = "seating"  # chairs, stools, folding chairs, benches
    FLOOR_SEATING = "floor_seating"  # dari, chatai, mats, bolsters, cushions
    TABLES = "tables"
    SERVING = "serving"  # plates, bowls, glasses, serving spoons
    COOKWARE = "cookware"
    DECOR = "decor"
    OTHER = "other"


class InventoryItemCreate(InputModel):
    name: str = Field(min_length=1, max_length=120)
    category: InventoryCategory
    quantity: int = Field(ge=0, le=MAX_QUANTITY)
    notes: str | None = Field(default=None, max_length=500)


class InventoryItemUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: InventoryCategory | None = None
    quantity: int | None = Field(default=None, ge=0, le=MAX_QUANTITY)
    notes: str | None = Field(default=None, max_length=500)


class InventoryItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    household_id: uuid.UUID
    name: str
    category: InventoryCategory
    quantity: int
    notes: str | None
    created_at: datetime
    updated_at: datetime
