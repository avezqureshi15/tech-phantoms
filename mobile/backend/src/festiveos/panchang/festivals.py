"""Festival dates from first principles.

Each Hindu-calendar festival is defined by a lunar month, a tithi and the *time of day* at which
that tithi must prevail (sunrise, midday, evening, midnight...). The day chosen is the one on
which the tithi covers most of that window; when no day covers it (a tithi lost between sunrises)
it falls back to the day on which the tithi prevails at sunrise.

Months are amanta names (the month that ends at the new moon); purnimanta names are shown only in
labels. Rules that depend on a sect or a region (for example Janmashtami's Smarta and Vaishnava
days, Karva Chauth's moonrise) are deliberately not here until they can be done properly.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum

from festiveos.panchang import astro, elements, lunar
from festiveos.panchang.astro import Place, Time
from festiveos.panchang.kinds import Faith


class Anchor(StrEnum):
    SUNRISE = "sunrise"
    PURVAHNA = "purvahna"  # forenoon: the first two fifths of the day
    MADHYAHNA = "madhyahna"  # midday: the third fifth
    APARAHNA = "aparahna"  # afternoon: the fourth fifth
    PRADOSH = "pradosh"  # evening: the first fifth of the night
    NISHITA = "nishita"  # midnight: the middle muhurta of the night
    EVENING_TO_MIDNIGHT = "evening_to_midnight"  # sunset until the middle of the night


@dataclass(frozen=True)
class LunarRule:
    code: str
    name: str
    faith: Faith
    month: int  # amanta month, 0 = Chaitra
    tithi: int  # 1..30 (16 = Krishna Pratipada, 30 = Amavasya)
    anchor: Anchor
    avoid_vishti: bool = False
    after: str | None = None  # observed this many days after another rule's date
    days_after: int = 0


@dataclass(frozen=True)
class SolarRule:
    code: str
    name: str
    faith: Faith
    sign: int  # sidereal sign entered, 0 = Mesha


@dataclass(frozen=True)
class Observance:
    code: str
    name: str
    faith: Faith
    date: date
    detail: str  # the tithi and month, or the sankranti


M = {name: i for i, name in enumerate(lunar.MASAS)}
LUNAR_RULES: tuple[LunarRule, ...] = (
    LunarRule("ugadi", "Ugadi / Gudi Padwa", Faith.HINDU, M["Chaitra"], 1, Anchor.SUNRISE),
    LunarRule("rama_navami", "Rama Navami", Faith.HINDU, M["Chaitra"], 9, Anchor.MADHYAHNA),
    LunarRule("hanuman_jayanti", "Hanuman Jayanti", Faith.HINDU, M["Chaitra"], 15, Anchor.SUNRISE),
    LunarRule("mahavir_jayanti", "Mahavir Jayanti", Faith.JAIN, M["Chaitra"], 13, Anchor.SUNRISE),
    LunarRule(
        "akshaya_tritiya", "Akshaya Tritiya", Faith.HINDU, M["Vaishakha"], 3, Anchor.PURVAHNA
    ),
    LunarRule(
        "buddha_purnima", "Buddha Purnima", Faith.BUDDHIST, M["Vaishakha"], 15, Anchor.SUNRISE
    ),
    LunarRule("guru_purnima", "Guru Purnima", Faith.HINDU, M["Ashadha"], 15, Anchor.SUNRISE),
    LunarRule(
        "raksha_bandhan",
        "Raksha Bandhan",
        Faith.HINDU,
        M["Shravana"],
        15,
        Anchor.APARAHNA,
        avoid_vishti=True,
    ),
    LunarRule(
        "ganesh_chaturthi", "Ganesh Chaturthi", Faith.HINDU, M["Bhadrapada"], 4, Anchor.MADHYAHNA
    ),
    LunarRule(
        "navratri_begins", "Sharad Navratri begins", Faith.HINDU, M["Ashwin"], 1, Anchor.SUNRISE
    ),
    LunarRule("durga_ashtami", "Durga Ashtami", Faith.HINDU, M["Ashwin"], 8, Anchor.SUNRISE),
    LunarRule("maha_navami", "Maha Navami", Faith.HINDU, M["Ashwin"], 9, Anchor.SUNRISE),
    LunarRule(
        "dussehra", "Dussehra (Vijayadashami)", Faith.HINDU, M["Ashwin"], 10, Anchor.APARAHNA
    ),
    LunarRule("dhanteras", "Dhanteras", Faith.HINDU, M["Ashwin"], 28, Anchor.PRADOSH),
    LunarRule("diwali", "Diwali (Lakshmi Puja)", Faith.HINDU, M["Ashwin"], 30, Anchor.PRADOSH),
    LunarRule("bandi_chhor", "Bandi Chhor Divas", Faith.SIKH, M["Ashwin"], 30, Anchor.PRADOSH),
    LunarRule("govardhan", "Govardhan Puja", Faith.HINDU, M["Kartika"], 1, Anchor.SUNRISE),
    LunarRule("bhai_dooj", "Bhai Dooj", Faith.HINDU, M["Kartika"], 2, Anchor.APARAHNA),
    LunarRule("dev_uthani", "Dev Uthani Ekadashi", Faith.HINDU, M["Kartika"], 11, Anchor.SUNRISE),
    LunarRule("guru_nanak", "Guru Nanak Gurpurab", Faith.SIKH, M["Kartika"], 15, Anchor.SUNRISE),
    LunarRule("vasant_panchami", "Vasant Panchami", Faith.HINDU, M["Magha"], 5, Anchor.PURVAHNA),
    LunarRule("maha_shivaratri", "Maha Shivaratri", Faith.HINDU, M["Magha"], 29, Anchor.NISHITA),
    LunarRule(
        "holika_dahan",
        "Holika Dahan",
        Faith.HINDU,
        M["Phalguna"],
        15,
        Anchor.EVENING_TO_MIDNIGHT,
        avoid_vishti=True,
    ),
    LunarRule(
        "holi",
        "Holi",
        Faith.HINDU,
        M["Phalguna"],
        15,
        Anchor.EVENING_TO_MIDNIGHT,
        after="holika_dahan",
        days_after=1,
    ),
)
SOLAR_RULES: tuple[SolarRule, ...] = (
    SolarRule("makar_sankranti", "Makar Sankranti / Pongal", Faith.HINDU, 9),
    SolarRule("mesha_sankranti", "Mesha Sankranti (Vaisakhi, Vishu, Puthandu)", Faith.HINDU, 0),
)


@dataclass(frozen=True)
class _Window:
    start: float  # Time.ut
    end: float


def _overlap(a_start: float, a_end: float, window: _Window) -> float:
    return max(0.0, min(a_end, window.end) - max(a_start, window.start))


def _day_windows(place: Place, day: date) -> dict[Anchor, _Window] | None:
    rise, set_, next_rise = (
        astro.sunrise(place, day),
        astro.sunset(place, day),
        astro.sunrise(place, day + timedelta(days=1)),
    )
    if rise is None or set_ is None or next_rise is None:
        return None  # polar day or night: no panchang day
    length = set_.ut - rise.ut
    fifth = length / 5
    night = next_rise.ut - set_.ut
    middle = set_.ut + night / 2
    half_muhurta = (1 / 30) / 24 * 1.0  # 24 minutes in days: a muhurta is 48 minutes
    return {
        Anchor.SUNRISE: _Window(rise.ut, rise.ut),
        Anchor.PURVAHNA: _Window(rise.ut, rise.ut + 2 * fifth),
        Anchor.MADHYAHNA: _Window(rise.ut + 2 * fifth, rise.ut + 3 * fifth),
        Anchor.APARAHNA: _Window(rise.ut + 3 * fifth, rise.ut + 4 * fifth),
        Anchor.PRADOSH: _Window(set_.ut, set_.ut + night / 5),
        Anchor.NISHITA: _Window(middle - half_muhurta, middle + half_muhurta),
        Anchor.EVENING_TO_MIDNIGHT: _Window(set_.ut, middle),
    }


def _vishti_spans(start: Time, end: Time) -> list[tuple[float, float]]:
    return [
        (s.start.ut, s.end.ut)
        for s in elements.KARANA.segments_between(start, end)
        if elements.karana_name(s.index) == elements.VISHTI
    ]


def _score(
    start: Time, end: Time, window: _Window, anchor: Anchor, vishti: list[tuple[float, float]]
) -> float:
    if anchor is Anchor.SUNRISE:
        return 1.0 if start.ut <= window.start < end.ut else 0.0
    covered = _overlap(start.ut, end.ut, window)
    for v_start, v_end in vishti:
        covered -= _overlap(max(start.ut, v_start), min(end.ut, v_end), window)
    return max(0.0, covered)


def pick_day(
    place: Place, start: Time, end: Time, anchor: Anchor, avoid_vishti: bool = False
) -> date:
    """The civil date on which a tithi spanning [start, end] is observed for the given anchor."""
    first = astro.to_datetime(start).astimezone(place.zone).date() - timedelta(days=1)
    last = astro.to_datetime(end).astimezone(place.zone).date() + timedelta(days=1)
    vishti = _vishti_spans(start, end) if avoid_vishti else []
    days = [first + timedelta(days=n) for n in range((last - first).days + 1)]
    windows = {d: w for d in days if (w := _day_windows(place, d)) is not None}

    best_day, best = None, 0.0
    for d, w in windows.items():
        score = _score(start, end, w[anchor], anchor, vishti)
        if score > best:
            best_day, best = d, score
    if best_day is not None:
        return best_day
    # No day holds the tithi at the required time: use the day it prevails at sunrise, else the
    # day on which most of it falls in daylight.
    for d, w in windows.items():
        if _score(start, end, w[Anchor.SUNRISE], Anchor.SUNRISE, []) > 0:
            return d
    return max(windows, key=lambda d: _overlap(start.ut, end.ut, w_daytime(place, d)))


def w_daytime(place: Place, day: date) -> _Window:
    rise, set_ = astro.sunrise(place, day), astro.sunset(place, day)
    return _Window(rise.ut, set_.ut) if rise and set_ else _Window(0, 0)


def _months_in(year: int) -> list[lunar.LunarMonth]:
    """Every amanta month overlapping the Gregorian year (from late the year before)."""
    begin = astro.to_time(datetime(year - 1, 11, 20, tzinfo=UTC))
    stop = astro.to_time(datetime(year + 1, 1, 12, tzinfo=UTC))
    month = lunar.month_at(begin)
    months = [month]
    while month.end.ut < stop.ut:
        month = lunar.month_after(month)
        months.append(month)
    return months


def _tithi_span(month: lunar.LunarMonth, tithi: int) -> tuple[Time, Time]:
    k = tithi - 1
    expected = month.start.ut + k * (month.end.ut - month.start.ut) / 30
    start = astro.crossing(
        astro.elongation,
        (k * elements.TITHI_SPAN) % 360,
        Time(expected - 1.7),
        Time(expected + 1.7),
    )
    end = astro.crossing(
        astro.elongation,
        ((k + 1) * elements.TITHI_SPAN) % 360,
        Time(expected - 0.7),
        Time(expected + 2.7),
    )
    return start, end


def _detail(month: lunar.LunarMonth, tithi: int) -> str:
    paksha = "Shukla" if tithi <= 15 else "Krishna"
    return f"{elements.tithi_name(tithi - 1)} ({paksha} paksha), {month.name}"


def lunar_observances(year: int, place: Place) -> list[Observance]:
    found: dict[str, Observance] = {}
    for month in _months_in(year):
        if month.adhika:
            continue
        for rule in LUNAR_RULES:
            if rule.month != month.index or rule.after:
                continue
            start, end = _tithi_span(month, rule.tithi)
            day = pick_day(place, start, end, rule.anchor, rule.avoid_vishti)
            if day.year == year:
                found[rule.code] = Observance(
                    rule.code, rule.name, rule.faith, day, _detail(month, rule.tithi)
                )
    for rule in LUNAR_RULES:
        if rule.after and rule.after in found:
            base = found[rule.after]
            found[rule.code] = Observance(
                rule.code,
                rule.name,
                rule.faith,
                base.date + timedelta(days=rule.days_after),
                base.detail,
            )
    return list(found.values())


def sankranti(sign: int, year: int, place: Place) -> tuple[Time, date]:
    """When the Sun enters sidereal ``sign`` and the civil day observed (the next day if it
    happens after sunset, as most regional calendars do)."""
    target = sign * lunar.SANKRANTI_STEP
    guess = astro.to_time(datetime(year, 1, 1, tzinfo=UTC))
    # The Sun passes each sign about once a year; scan in 5-day steps for the bracket.
    step = guess
    while True:
        nxt = astro.add_days(step, 5)
        if (
            astro._signed_gap(astro.sidereal_sun(step), target)
            < 0
            <= astro._signed_gap(astro.sidereal_sun(nxt), target)
        ):
            moment = astro.crossing(astro.sidereal_sun, target, step, nxt)
            break
        step = nxt
    local = astro.to_datetime(moment).astimezone(place.zone)
    day = local.date()
    set_ = astro.sunset(place, day)
    if set_ is not None and moment.ut > set_.ut:
        day += timedelta(days=1)
    return moment, day


def solar_observances(year: int, place: Place) -> list[Observance]:
    out = []
    for rule in SOLAR_RULES:
        _, day = sankranti(rule.sign, year, place)
        out.append(
            Observance(
                rule.code, rule.name, rule.faith, day, f"Sun enters {lunar.RASHIS[rule.sign]}"
            )
        )
    return out


def observances(year: int, place: Place) -> list[Observance]:
    return sorted(
        lunar_observances(year, place) + solar_observances(year, place), key=lambda o: o.date
    )
