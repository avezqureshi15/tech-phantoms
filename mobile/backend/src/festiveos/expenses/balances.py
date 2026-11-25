"""Who is owed what, and the fewest payments that settle it."""

from dataclasses import dataclass

from festiveos.expenses.kinds import UserKey


@dataclass(frozen=True)
class Transfer:
    payer: UserKey  # who should pay
    payee: UserKey  # who should receive
    amount_minor: int


def net_balances(
    paid: dict[UserKey, int],
    owed: dict[UserKey, int],
    sent: dict[UserKey, int],
    received: dict[UserKey, int],
) -> dict[UserKey, int]:
    """Positive: the group owes this person. Negative: this person owes the group.

    A payment from A to B settles debt, so it raises A's balance and lowers B's.
    """
    people = set(paid) | set(owed) | set(sent) | set(received)
    return {
        person: paid.get(person, 0)
        - owed.get(person, 0)
        + sent.get(person, 0)
        - received.get(person, 0)
        for person in people
    }


def _order(person: UserKey) -> str:
    return "" if person is None else str(person)


def simplify(net: dict[UserKey, int]) -> list[Transfer]:
    """Settle everyone with few payments: repeatedly match the biggest debtor to the biggest
    creditor. Not always the theoretical minimum, but never more than (people - 1) payments."""
    creditors = sorted(
        ((p, n) for p, n in net.items() if n > 0), key=lambda x: (-x[1], _order(x[0]))
    )
    debtors = sorted(
        ((p, -n) for p, n in net.items() if n < 0), key=lambda x: (-x[1], _order(x[0]))
    )
    transfers: list[Transfer] = []
    c = d = 0
    credit = [n for _, n in creditors]
    debt = [n for _, n in debtors]
    while c < len(creditors) and d < len(debtors):
        amount = min(credit[c], debt[d])
        transfers.append(Transfer(debtors[d][0], creditors[c][0], amount))
        credit[c] -= amount
        debt[d] -= amount
        if credit[c] == 0:
            c += 1
        if debt[d] == 0:
            d += 1
    return transfers
