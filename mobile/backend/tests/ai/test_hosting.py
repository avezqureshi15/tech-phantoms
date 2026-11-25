import pytest

from festiveos.ai.hosting import Diet, Meal, plan_hosting
from festiveos.ai.jugaad import plan_seating


def plan(**overrides):
    args = {
        "adults": 3,
        "children": 0,
        "elders": 0,
        "meal": Meal.DINNER,
        "diet": Diet.VEG,
        "chairs": None,
        "plates": None,
    }
    return plan_hosting(**{**args, **overrides})


def quantity(result, item: str) -> float:
    return next(line.quantity for line in result.food if line.item.startswith(item))


def test_hosting_three_adults_plans_for_a_drop_in_guest() -> None:
    result = plan()

    assert result.drop_ins == 1
    assert result.plates_needed == 4
    # 4 adult portions: 3 rotis each, 140 g rice, 150 g dal
    assert quantity(result, "Roti") == 12
    assert quantity(result, "Cooked rice") == 0.56
    assert quantity(result, "Dal") == 0.6


def test_children_eat_half_and_raw_ingredients_are_derived() -> None:
    result = plan(adults=2, children=2)  # 2 + 1 + 1 drop-in = 4 portions

    assert quantity(result, "Roti") == 12
    assert quantity(result, "Rice (raw)") == pytest.approx(0.22)
    assert quantity(result, "Atta") == pytest.approx(0.36)


def test_non_veg_adds_meat_and_mixed_scales_it_down() -> None:
    veg = plan(diet=Diet.VEG)
    non_veg = plan(diet=Diet.NON_VEG)
    mixed = plan(diet=Diet.MIXED)

    assert not any("curry" in line.item for line in veg.food)
    assert quantity(non_veg, "Chicken") == 1.0
    assert quantity(mixed, "Chicken") == 0.6


def test_tea_and_snacks_never_adds_meat() -> None:
    result = plan(meal=Meal.TEA_SNACKS, diet=Diet.NON_VEG)

    assert not any("curry" in line.item for line in result.food)


def test_seating_is_unknown_until_chairs_are_known() -> None:
    assert plan().seating is None
    assert plan(chairs=0).seating is not None


def test_seating_shortfall_counts_chairs_and_floor_seats() -> None:
    result = plan(adults=6, children=2, chairs=4, floor_seats=2)  # 8 people + 2 drop-ins

    assert result.seating.needed == 10
    assert result.seating.shortfall == 4
    assert not result.seating.enough


def test_elders_are_flagged_even_when_total_seats_suffice() -> None:
    result = plan(adults=3, elders=2, chairs=1, floor_seats=10)

    assert result.seating.shortfall == 0
    assert result.seating.elders_without_chair == 1
    assert not result.seating.enough


def test_plates_shortfall() -> None:
    assert plan(plates=3).plates_short == 1
    assert plan(plates=10).plates_short == 0


@pytest.mark.parametrize(
    "kwargs",
    [
        {"adults": 0},
        {"children": -1},
        {"elders": 5},
        {"adults": 400, "children": 200},
    ],
)
def test_impossible_guest_numbers_are_rejected(kwargs) -> None:
    with pytest.raises(ValueError):
        plan(**kwargs)


def test_jugaad_covers_a_small_gap_with_free_options_only() -> None:
    seating = plan_seating(shortfall=3, elders_without_chair=0, children=0)

    assert seating.uncovered == 0
    assert all(pick.jugaad.cost == "free" for pick in seating.picks)
    assert sum(p.seats for p in seating.picks) == 3


def test_elders_are_only_covered_by_real_chairs() -> None:
    seating = plan_seating(shortfall=2, elders_without_chair=2, children=0)

    assert {p.jugaad.suitable_for.value for p in seating.picks} == {"elders"}
    assert seating.uncovered == 0


def test_children_only_options_are_capped_by_the_number_of_children() -> None:
    seating = plan_seating(shortfall=30, elders_without_chair=0, children=1)

    crates = [p for p in seating.picks if p.jugaad.id == "crates_and_blanket"]
    assert sum(p.seats for p in crates) <= 1


def test_a_big_gap_falls_back_to_hiring_chairs() -> None:
    seating = plan_seating(shortfall=60, elders_without_chair=5, children=4)

    assert seating.uncovered == 0
    assert any(p.jugaad.id == "tent_house" for p in seating.picks)
    assert sum(p.seats for p in seating.picks) == 60


def test_no_shortfall_means_no_picks() -> None:
    assert plan_seating(0, 0, 0).picks == ()
