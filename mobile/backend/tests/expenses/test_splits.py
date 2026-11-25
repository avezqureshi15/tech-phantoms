import random
import uuid

import pytest

from festiveos.expenses.balances import Transfer, net_balances, simplify
from festiveos.expenses.kinds import SplitType
from festiveos.expenses.splits import SplitError, allocate, split

A, B, C, D = (uuid.UUID(int=i) for i in (1, 2, 3, 4))


def test_equal_split_gives_leftover_paise_to_a_stable_few() -> None:
    parts = split(100, SplitType.EQUAL, [(A, None), (B, None), (C, None)])

    assert sorted(parts.values()) == [33, 33, 34]
    assert sum(parts.values()) == 100
    assert split(100, SplitType.EQUAL, [(C, None), (A, None), (B, None)]) == parts  # order-free


def test_exact_split_must_add_up() -> None:
    assert split(1000, SplitType.EXACT, [(A, 400), (B, 600)]) == {A: 400, B: 600}
    with pytest.raises(SplitError, match="add up"):
        split(1000, SplitType.EXACT, [(A, 400), (B, 500)])


def test_percent_split_uses_basis_points() -> None:
    parts = split(1001, SplitType.PERCENT, [(A, 3333), (B, 3333), (C, 3334)])

    assert sum(parts.values()) == 1001
    with pytest.raises(SplitError, match="100"):
        split(1000, SplitType.PERCENT, [(A, 5000), (B, 4000)])


def test_shares_split_for_two_adults_and_a_child() -> None:
    assert split(500, SplitType.SHARES, [(A, 2), (B, 2), (C, 1)]) == {A: 200, B: 200, C: 100}


@pytest.mark.parametrize(
    "entries",
    [
        [],
        [(A, None), (A, None)],  # the same person twice
    ],
)
def test_bad_people_lists_are_rejected(entries) -> None:
    with pytest.raises(SplitError):
        split(100, SplitType.EQUAL, entries)


def test_missing_negative_and_zero_total_shares_are_rejected() -> None:
    with pytest.raises(SplitError):
        split(100, SplitType.EXACT, [(A, None), (B, 100)])
    with pytest.raises(SplitError):
        split(100, SplitType.SHARES, [(A, -1), (B, 2)])
    with pytest.raises(SplitError, match="more than zero"):
        split(100, SplitType.SHARES, [(A, 0), (B, 0)])


def test_the_parts_always_sum_to_the_total() -> None:
    """Every total and every weighting: the money is neither created nor lost."""
    rng = random.Random(11)  # noqa: S311  (reproducible, not security)
    people = [uuid.UUID(int=i) for i in range(1, 8)]
    for _ in range(2000):
        chosen = rng.sample(people, rng.randint(1, 7))
        weights = {p: rng.randint(1, 9) for p in chosen}
        total = rng.randint(1, 10_000_000)

        parts = allocate(total, weights)

        assert sum(parts.values()) == total
        assert all(v >= 0 for v in parts.values())


def test_net_balances_credit_the_payer_and_apply_settlements() -> None:
    # A paid 300 for A, B, C (100 each). Then B paid A 100 to settle.
    net = net_balances(
        paid={A: 300}, owed={A: 100, B: 100, C: 100}, sent={B: 100}, received={A: 100}
    )

    assert net == {A: 100, B: 0, C: -100}
    assert sum(net.values()) == 0


def test_simplify_settles_everyone_with_few_payments() -> None:
    net = {A: 500, B: -200, C: -300, D: 0}

    transfers = simplify(net)

    assert sorted((t.payer, t.payee, t.amount_minor) for t in transfers) == [
        (B, A, 200),
        (C, A, 300),
    ]


def test_simplify_never_needs_more_than_people_minus_one_payments_and_zeroes_everyone() -> None:
    rng = random.Random(3)  # noqa: S311
    people = [uuid.UUID(int=i) for i in range(1, 9)]
    for _ in range(500):
        raw = [rng.randint(-5000, 5000) for _ in people[:-1]]
        net = dict(zip(people, [*raw, -sum(raw)], strict=True))  # a closed ledger sums to zero

        transfers = simplify(net)

        assert len(transfers) <= len(people) - 1
        settled = dict(net)
        for t in transfers:
            settled[t.payer] += t.amount_minor
            settled[t.payee] -= t.amount_minor
        assert all(v == 0 for v in settled.values())


def test_a_left_member_stays_in_the_ledger_under_none() -> None:
    transfers = simplify({A: 100, None: -100})

    assert transfers == [Transfer(None, A, 100)]


def test_simplify_is_deterministic() -> None:
    net = {A: 100, B: 100, C: -100, D: -100}

    assert simplify(net) == simplify(dict(reversed(list(net.items()))))
