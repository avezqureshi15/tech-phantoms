import uuid
from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator

from festiveos.core.schemas import InputModel
from festiveos.expenses.kinds import SplitType

MAX_MINOR = 1_000_000_000_000  # 10,000,000,000 rupees: far beyond any real expense


class ExpenseCategory(StrEnum):
    FOOD = "food"
    GROCERIES = "groceries"
    VENUE = "venue"
    DECOR = "decor"
    GIFTS = "gifts"
    TRAVEL = "travel"
    SHOPPING = "shopping"
    UTILITIES = "utilities"
    RENT = "rent"
    ENTERTAINMENT = "entertainment"
    OTHER = "other"


class SplitEntry(InputModel):
    user_id: uuid.UUID
    value: int | None = Field(default=None, ge=0, le=MAX_MINOR)  # meaning depends on split type


class SplitInput(InputModel):
    type: SplitType
    entries: list[SplitEntry] = Field(min_length=1, max_length=100)


class ExpenseCreate(InputModel):
    description: str = Field(min_length=1, max_length=120)
    amount_minor: int = Field(gt=0, le=MAX_MINOR, description="In minor units: paise for INR")
    paid_by: uuid.UUID
    split: SplitInput
    category: ExpenseCategory = ExpenseCategory.OTHER
    spent_on: date
    festival_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=500)


class ExpenseUpdate(InputModel):
    description: str | None = Field(default=None, min_length=1, max_length=120)
    category: ExpenseCategory | None = None
    spent_on: date | None = None
    paid_by: uuid.UUID | None = None
    festival_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=500)
    amount_minor: int | None = Field(default=None, gt=0, le=MAX_MINOR)
    split: SplitInput | None = None

    @model_validator(mode="after")
    def money_changes_together(self) -> "ExpenseUpdate":
        if (self.amount_minor is None) != (self.split is None):
            raise ValueError("amount_minor and split must be changed together")
        return self


class ShareRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID | None
    amount_minor: int


class ExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    household_id: uuid.UUID
    festival_id: uuid.UUID | None
    description: str
    category: str
    amount_minor: int
    currency: str = ""
    paid_by: uuid.UUID | None
    spent_on: date
    split_type: str
    notes: str | None
    created_by: uuid.UUID | None
    created_at: datetime
    shares: list[ShareRead]


class SettlementCreate(InputModel):
    payer: uuid.UUID
    payee: uuid.UUID
    amount_minor: int = Field(gt=0, le=MAX_MINOR)
    settled_on: date

    @model_validator(mode="after")
    def different_people(self) -> "SettlementCreate":
        if self.payer == self.payee:
            raise ValueError("payer and payee must be different people")
        return self


class SettlementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    household_id: uuid.UUID
    payer: uuid.UUID | None
    payee: uuid.UUID | None
    amount_minor: int
    settled_on: date
    created_by: uuid.UUID | None


class MemberBalance(BaseModel):
    user_id: uuid.UUID | None  # None: people who have left the group
    paid_minor: int
    owed_minor: int
    net_minor: int  # positive: the group owes them


class TransferRead(BaseModel):
    payer: uuid.UUID | None
    payee: uuid.UUID | None
    amount_minor: int


class BalancesRead(BaseModel):
    currency: str
    members: list[MemberBalance]
    transfers: list[TransferRead]
    settled_up: bool


class SummaryRead(BaseModel):
    currency: str
    total_minor: int
    count: int
    by_category: dict[str, int]
    by_payer: dict[str, int]


class ReceiptItem(BaseModel):
    name: str
    amount_minor: int


class ReceiptDraft(BaseModel):
    """What was read off a receipt. A draft for the person to check, never saved by itself."""

    merchant: str | None
    spent_on: date | None
    total_minor: int | None
    currency: str = "INR"
    items: list[ReceiptItem]
    warnings: list[str]
