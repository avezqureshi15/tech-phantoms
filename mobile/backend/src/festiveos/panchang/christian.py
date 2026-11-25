"""Christian observances. Easter is deterministic (the computus), so nothing here depends on a
place. Western churches count by the Gregorian calendar, Orthodox churches by the Julian one.
"""

from datetime import date, timedelta

from festiveos.panchang.festivals import Observance
from festiveos.panchang.kinds import Faith

JULIAN_TO_GREGORIAN_DAYS = 13  # for 1900-2099


def western_easter(year: int) -> date:
    """Anonymous Gregorian algorithm (Meeus/Jones/Butcher)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    el = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * el) // 451
    month, day = divmod(h + el - 7 * m + 114, 31)
    return date(year, month, day + 1)


def orthodox_easter(year: int) -> date:
    """Meeus' Julian algorithm, then shifted to the Gregorian calendar."""
    a, b, c = year % 4, year % 7, year % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    month, day = divmod(d + e + 114, 31)
    return date(year, month, day + 1) + timedelta(days=JULIAN_TO_GREGORIAN_DAYS)


def advent_sunday(year: int) -> date:
    christmas = date(year, 12, 25)
    # The fourth Sunday before Christmas Day (Christmas itself, if a Sunday, does not count).
    days_back = (christmas.weekday() + 1) % 7 or 7
    return christmas - timedelta(days=days_back + 21)


def observances(year: int) -> list[Observance]:
    easter, orthodox = western_easter(year), orthodox_easter(year)
    western = "Western churches"
    out = [
        ("epiphany", "Epiphany", date(year, 1, 6), "6 January"),
        (
            "ash_wednesday",
            "Ash Wednesday",
            easter - timedelta(days=46),
            f"46 days before Easter, {western}",
        ),
        (
            "palm_sunday",
            "Palm Sunday",
            easter - timedelta(days=7),
            f"Sunday before Easter, {western}",
        ),
        (
            "good_friday",
            "Good Friday",
            easter - timedelta(days=2),
            f"Friday before Easter, {western}",
        ),
        ("easter", "Easter Sunday", easter, western),
        (
            "ascension",
            "Ascension Day",
            easter + timedelta(days=39),
            f"39 days after Easter, {western}",
        ),
        ("pentecost", "Pentecost", easter + timedelta(days=49), f"49 days after Easter, {western}"),
        ("advent", "First Sunday of Advent", advent_sunday(year), "Four Sundays before Christmas"),
        ("christmas", "Christmas", date(year, 12, 25), "25 December"),
        (
            "orthodox_christmas",
            "Christmas (Orthodox)",
            date(year, 1, 7),
            "25 December, Julian calendar",
        ),
        (
            "orthodox_good_friday",
            "Good Friday (Orthodox)",
            orthodox - timedelta(days=2),
            "Orthodox churches",
        ),
        (
            "orthodox_easter",
            "Easter Sunday (Orthodox)",
            orthodox,
            "Orthodox churches, Julian reckoning",
        ),
    ]
    return sorted(
        (Observance(code, name, Faith.CHRISTIAN, day, detail) for code, name, day, detail in out),
        key=lambda o: o.date,
    )
