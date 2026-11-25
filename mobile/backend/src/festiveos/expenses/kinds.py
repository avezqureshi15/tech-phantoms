"""Small shared definitions, kept apart so the schemas and the pure maths can both use them."""

import uuid
from enum import StrEnum

# A member who has left or deleted their account keeps their ledger rows under ``None``.
UserKey = uuid.UUID | None


class SplitType(StrEnum):
    EQUAL = "equal"  # everyone listed pays the same
    EXACT = "exact"  # values are amounts in minor units and must add up to the total
    PERCENT = "percent"  # values are basis points (100 = 1%) and must add up to 10000
    SHARES = "shares"  # values are weights, for example 2 adults and 1 child as 2, 2, 1
