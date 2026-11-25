"""The jugaad catalogue: resourceful, safe, cheap ways to close a hosting gap.

Jugaad here means clever improvisation, never an unsafe shortcut. Every option says who it is
suitable for, and options unsuitable for elders are never used to cover them. Selection is
deterministic code, so the same shortfall always yields the same plan; the model only words it.
"""

from dataclasses import dataclass
from enum import StrEnum


class For(StrEnum):
    ELDERS = "elders"  # fine for someone who cannot sit on the floor or on a low seat
    ANYONE = "anyone"
    YOUNG = "young"  # children and adults comfortable on the floor / low seats


@dataclass(frozen=True)
class Jugaad:
    id: str
    title: str
    how: str
    cost: str  # "free" or "low": we do not quote prices, they vary by city
    suitable_for: For
    max_seats: int | None  # None means no practical limit
    safety: str = ""


@dataclass(frozen=True)
class Pick:
    jugaad: Jugaad
    seats: int


@dataclass(frozen=True)
class SeatingPlan:
    picks: tuple[Pick, ...]
    uncovered: int  # seats still missing after every suitable option


SEATING: tuple[Jugaad, ...] = (
    Jugaad(
        "borrow_neighbours",
        "Borrow chairs from neighbours or the society clubhouse",
        "Ask two days ahead. Put a strip of masking tape with the owner's flat number on each "
        "chair so they go home to the right place.",
        "free",
        For.ELDERS,
        8,
    ),
    Jugaad(
        "community_hall",
        "Borrow folding chairs from the nearby mandir, gurudwara or community hall",
        "Most keep stacks for functions and lend them to families for a festival. Ask the "
        "committee a few days early.",
        "free",
        For.ELDERS,
        12,
    ),
    Jugaad(
        "tent_house",
        "Hire chairs from the local tent house",
        "Call the tent-wala the day before, ask for delivery and pickup. Rental is usually a "
        "small per-chair amount; check your own city's rate.",
        "low",
        For.ELDERS,
        None,
    ),
    Jugaad(
        "stools_and_mudhas",
        "Use stools, mudhas, the puja chowki and the dressing-table stool",
        "Gather every sturdy low seat in the house. Cover with a folded dupatta or bedsheet.",
        "free",
        For.YOUNG,
        4,
        "Only for people who are comfortable getting up from a low seat.",
    ),
    Jugaad(
        "bed_and_diwan",
        "Turn the bed or diwan into a bench",
        "Push a bed or diwan against the wall, add bolsters (takiyas) for back support.",
        "free",
        For.ANYONE,
        4,
    ),
    Jugaad(
        "dari_and_bolsters",
        "Floor seating: dari or chatai with bolsters",
        "Spread a dari or clean bedsheets over a chatai, line the wall with bolsters. Children "
        "and young guests usually prefer it; it is how many a festival lunch is eaten.",
        "free",
        For.YOUNG,
        12,  # what a living room realistically holds
        "Keep elders and anyone with knee or back trouble on chairs.",
    ),
    Jugaad(
        "crates_and_blanket",
        "Sturdy plastic crates or stacked cartons under a folded blanket, for children only",
        "Use only crates that do not flex when you press on them.",
        "free",
        For.YOUNG,
        3,
        "Test with an adult's weight first; never for elders.",
    ),
)

FOOD_SERVICE: tuple[Jugaad, ...] = (
    Jugaad(
        "two_pangats",
        "Serve in two sittings (pangat)",
        "Feed the elders and children first, then the rest. Halves the seats and plates you "
        "need at one time, and the host keeps the hot rotis coming.",
        "free",
        For.ANYONE,
        None,
    ),
    Jugaad(
        "pattal_and_banana_leaf",
        "Use pattal, dona or banana leaf instead of plates",
        "Cheap, festive, and no washing up. Buy extra, they run out faster than you expect.",
        "low",
        For.ANYONE,
        None,
    ),
    Jugaad(
        "borrow_thalis",
        "Borrow steel thalis and katoris from a neighbour or relative",
        "Same trick as chairs: label them with tape before they mix with yours.",
        "free",
        For.ANYONE,
        None,
    ),
)


def plan_seating(shortfall: int, elders_without_chair: int, children: int) -> SeatingPlan:
    """Cover ``shortfall`` missing seats.

    Order: (1) real chairs for elders, free sources before paid; (2) free low or floor seating for
    the rest; (3) more chairs, paid if need be, for whatever is left. Options meant for children
    are capped by ``children``. Each option appears at most once.
    """
    used: dict[str, int] = {}
    remaining = max(0, shortfall)

    def room(option: Jugaad) -> int:
        cap = option.max_seats if option.max_seats is not None else remaining
        if option.id == "crates_and_blanket":
            cap = min(cap, max(children, 0))
        return cap - used.get(option.id, 0)

    def take(option: Jugaad, wanted: int) -> int:
        nonlocal remaining
        seats = max(0, min(wanted, room(option)))
        if seats:
            used[option.id] = used.get(option.id, 0) + seats
            remaining = max(0, remaining - seats)
        return seats

    chairs = sorted(
        (o for o in SEATING if o.suitable_for is For.ELDERS), key=lambda o: o.cost != "free"
    )
    low = [o for o in SEATING if o.suitable_for is not For.ELDERS]

    elder_gap = max(0, elders_without_chair)
    for option in chairs:
        if elder_gap <= 0:
            break
        elder_gap -= take(option, elder_gap)
    for option in low:
        take(option, remaining)
    for option in chairs:
        take(option, remaining)

    by_id = {o.id: o for o in SEATING}
    picks = tuple(Pick(by_id[i], seats) for i, seats in used.items())
    return SeatingPlan(picks, uncovered=remaining)
