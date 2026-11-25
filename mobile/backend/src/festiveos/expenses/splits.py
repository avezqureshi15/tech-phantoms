"""How an expense is divided. Pure integer maths on minor units (paise): no floats anywhere, and
the shares always add up to the total exactly, whatever the rounding.
"""

import uuid

from festiveos.expenses.kinds import SplitType


class SplitError(ValueError):
    pass


BASIS_POINTS = 10_000


def allocate(total: int, weights: dict[uuid.UUID, int]) -> dict[uuid.UUID, int]:
    """Divide ``total`` in proportion to ``weights`` so the parts sum to exactly ``total``.

    Largest-remainder method: everyone gets the floor of their share, then the leftover units go
    one each to the largest fractional remainders, ties broken by id so the result is repeatable.
    """
    weight_sum = sum(weights.values())
    if weight_sum <= 0:
        raise SplitError("Shares must add up to more than zero")
    parts = {user: total * weight // weight_sum for user, weight in weights.items()}
    remainders = {user: total * weight % weight_sum for user, weight in weights.items()}
    leftover = total - sum(parts.values())
    for user in sorted(weights, key=lambda u: (-remainders[u], str(u)))[:leftover]:
        parts[user] += 1
    return parts


def split(
    total: int, kind: SplitType, entries: list[tuple[uuid.UUID, int | None]]
) -> dict[uuid.UUID, int]:
    """The amount each person owes, from the split type and each person's value."""
    if not entries:
        raise SplitError("Choose at least one person to split with")
    if len({user for user, _ in entries}) != len(entries):
        raise SplitError("Each person can appear only once")

    if kind is SplitType.EQUAL:
        return allocate(total, {user: 1 for user, _ in entries})

    values = dict(entries)
    if any(value is None or value < 0 for value in values.values()):
        raise SplitError("Every person needs a value of zero or more")
    numbers = {user: int(value) for user, value in values.items() if value is not None}

    if kind is SplitType.EXACT:
        if sum(numbers.values()) != total:
            raise SplitError("The amounts must add up to the total")
        return numbers
    if kind is SplitType.PERCENT:
        if sum(numbers.values()) != BASIS_POINTS:
            raise SplitError("The percentages must add up to 100")
        return allocate(total, numbers)
    return allocate(total, numbers)  # SHARES
