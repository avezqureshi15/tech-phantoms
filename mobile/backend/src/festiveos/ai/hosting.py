"""Hosting arithmetic for an Indian household: how much to cook, how many seats.

Pure functions, no I/O. The model never does this maths itself: it calls a tool that runs this
code, so the numbers are repeatable and testable. The quantities are rules of thumb for a
home-cooked North/South Indian spread, not nutrition advice; they are named constants so a
household or region can be tuned without touching the logic.
"""

import math
from dataclasses import dataclass
from enum import StrEnum

CHILD_PORTION = 0.5
# Indian hospitality: someone always brings a friend. Plan for ~15% more mouths, at least one.
DROP_IN_SHARE = 0.15
# Share of guests who eat non-veg at a MIXED table.
MIXED_NON_VEG_SHARE = 0.6
RICE_COOKED_TO_RAW = 2.5  # 1 kg raw rice -> ~2.5 kg cooked
ATTA_PER_ROTI_G = 30
ATTA_PER_PURI_G = 25
MAX_GUESTS = 500


class Meal(StrEnum):
    TEA_SNACKS = "tea_snacks"
    LUNCH = "lunch"
    DINNER = "dinner"
    FESTIVE_THALI = "festive_thali"


class Diet(StrEnum):
    VEG = "veg"
    JAIN = "jain"  # veg, no onion/garlic/root vegetables: changes what you buy, not how much
    NON_VEG = "non_veg"
    MIXED = "mixed"


@dataclass(frozen=True)
class FoodLine:
    item: str
    quantity: float
    unit: str  # "kg", "litre" or "pieces"
    note: str = ""


@dataclass(frozen=True)
class SeatingCheck:
    needed: int
    chairs: int
    floor_seats: int
    elders: int
    shortfall: int  # seats missing after counting chairs and floor seating
    elders_without_chair: int  # elders should never be put on the floor by default

    @property
    def enough(self) -> bool:
        return self.shortfall == 0 and self.elders_without_chair == 0


@dataclass(frozen=True)
class HostingPlan:
    adults: int
    children: int
    drop_ins: int
    meal: Meal
    diet: Diet
    food: tuple[FoodLine, ...]
    seating: SeatingCheck | None  # None when we do not know how many chairs there are
    plates_needed: int
    plates_short: int | None  # None when the plate count is unknown


# Per adult: (item, quantity, unit-of-quantity, scale-to-kg-or-litre). Grams/ml are divided by
# 1000 at the end; pieces stay pieces.
_MEAL_VEG: dict[Meal, tuple[tuple[str, float, str, str], ...]] = {
    Meal.TEA_SNACKS: (
        ("Chai (milk + water)", 180, "ml", "two cups each, the second one is always asked for"),
        ("Fried snacks (samosa, pakora, kachori)", 3, "pieces", ""),
        ("Biscuits / namkeen", 40, "g", ""),
        ("Mithai", 1, "pieces", ""),
    ),
    Meal.LUNCH: (
        ("Cooked rice", 160, "g", ""),
        ("Roti / phulka", 3, "pieces", ""),
        ("Dal (cooked)", 150, "g", ""),
        ("Sabzi (all dishes together)", 200, "g", "plan two dishes, one dry and one gravy"),
        ("Curd / raita", 100, "g", ""),
        ("Salad", 60, "g", ""),
        ("Mithai / kheer", 1, "pieces", ""),
        ("Papad", 1, "pieces", ""),
    ),
    Meal.DINNER: (
        ("Cooked rice", 140, "g", ""),
        ("Roti / phulka", 3, "pieces", ""),
        ("Dal (cooked)", 150, "g", ""),
        ("Sabzi (all dishes together)", 200, "g", "plan two dishes, one dry and one gravy"),
        ("Curd / raita", 100, "g", ""),
        ("Mithai / kheer", 1, "pieces", ""),
    ),
    Meal.FESTIVE_THALI: (
        ("Cooked rice / pulao", 150, "g", ""),
        ("Puri", 4, "pieces", "fried fresh, in batches"),
        ("Dal (cooked)", 120, "g", ""),
        ("Sabzi (all dishes together)", 250, "g", "three dishes feel festive"),
        ("Curd / raita", 100, "g", ""),
        ("Kheer / payasam", 120, "g", ""),
        ("Mithai", 2, "pieces", ""),
        ("Papad", 1, "pieces", ""),
    ),
}
_NON_VEG_G_PER_EATER = 250  # bone-in curry meat


def _scaled(per_head: float, unit: str, portions: float) -> tuple[float, str]:
    total = per_head * portions
    if unit == "g":
        return round(total / 1000, 2), "kg"
    if unit == "ml":
        return round(total / 1000, 2), "litre"
    return float(math.ceil(total)), "pieces"


def food_for(portions: float, meal: Meal, diet: Diet) -> tuple[FoodLine, ...]:
    """What to make for ``portions`` adult-equivalents."""
    lines = [
        FoodLine(item, *_scaled(per_head, unit, portions), note)
        for item, per_head, unit, note in _MEAL_VEG[meal]
    ]
    if meal is not Meal.TEA_SNACKS and diet in (Diet.NON_VEG, Diet.MIXED):
        eaters = portions * (MIXED_NON_VEG_SHARE if diet is Diet.MIXED else 1)
        lines.insert(
            3,
            FoodLine(
                "Chicken / mutton curry (bone-in)", *_scaled(_NON_VEG_G_PER_EATER, "g", eaters)
            ),
        )
    return tuple(lines)


def raw_ingredients(food: tuple[FoodLine, ...]) -> tuple[FoodLine, ...]:
    """The shopping list behind the cooked quantities: raw rice and atta."""
    raw: list[FoodLine] = []
    for line in food:
        if line.item.startswith("Cooked rice"):
            raw.append(FoodLine("Rice (raw)", round(line.quantity / RICE_COOKED_TO_RAW, 2), "kg"))
        elif line.item.startswith("Roti"):
            raw.append(FoodLine("Atta", round(line.quantity * ATTA_PER_ROTI_G / 1000, 2), "kg"))
        elif line.item == "Puri":
            raw.append(
                FoodLine("Atta for puri", round(line.quantity * ATTA_PER_PURI_G / 1000, 2), "kg")
            )
    return tuple(raw)


def check_seating(people: int, elders: int, chairs: int, floor_seats: int) -> SeatingCheck:
    shortfall = max(0, people - chairs - floor_seats)
    return SeatingCheck(
        needed=people,
        chairs=chairs,
        floor_seats=floor_seats,
        elders=elders,
        shortfall=shortfall,
        elders_without_chair=max(0, elders - chairs),
    )


def plan_hosting(
    *,
    adults: int,
    children: int,
    elders: int,
    meal: Meal,
    diet: Diet,
    chairs: int | None,
    floor_seats: int = 0,
    plates: int | None = None,
) -> HostingPlan:
    """``adults`` includes ``elders`` and the hosts themselves."""
    if adults < 1 or children < 0 or elders < 0 or elders > adults:
        raise ValueError("adults must be at least 1 and elders cannot exceed adults")
    if adults + children > MAX_GUESTS:
        raise ValueError(f"this planner handles up to {MAX_GUESTS} people")

    people = adults + children
    drop_ins = max(1, math.ceil(people * DROP_IN_SHARE))
    portions = adults + CHILD_PORTION * children + drop_ins
    food = food_for(portions, meal, diet)
    plates_needed = people + drop_ins
    return HostingPlan(
        adults=adults,
        children=children,
        drop_ins=drop_ins,
        meal=meal,
        diet=diet,
        food=food + raw_ingredients(food),
        seating=None
        if chairs is None
        else check_seating(plates_needed, elders, chairs, floor_seats),
        plates_needed=plates_needed,
        plates_short=None if plates is None else max(0, plates_needed - plates),
    )
