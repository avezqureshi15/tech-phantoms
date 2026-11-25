"""Expected Islamic observances.

A Hijri month begins on the day after the new crescent is first *seen*, so no formula can give a
date that every community will keep: India's central committee has declared Eid a day after Saudi
Arabia in several years, and Kerala and Kashmir sometimes differ again. This module estimates the
sighting from the Moon's position at sunset using the Odeh crescent-visibility criterion for the
naked eye, at the place the person asks about. Treat every date as *expected*, to be confirmed by
the local moon-sighting committee; households can adjust by a day.
"""

import math
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import astronomy

from festiveos.panchang import astro
from festiveos.panchang.astro import Place, Time
from festiveos.panchang.festivals import Observance
from festiveos.panchang.kinds import Faith

HIJRI_MONTHS = (
    "Muharram", "Safar", "Rabi al-awwal", "Rabi al-thani", "Jumada al-awwal", "Jumada al-thani",
    "Rajab", "Shaban", "Ramadan", "Shawwal", "Dhu al-Qadah", "Dhu al-Hijjah",
)  # fmt: skip
ISLAMIC_EPOCH_RD = 227015  # 1 Muharram 1 AH, the civil (Friday) epoch, as a Rata Die day number
ODEH_NAKED_EYE = 5.65  # V at or above this: crescent visible to the unaided eye
MOON_RADIUS_KM = 1737.4
AU_KM = 149_597_870.7

# (month 1..12, day, code, name)
OBSERVANCES = (
    (1, 1, "islamic_new_year", "Islamic New Year"),
    (1, 10, "ashura", "Ashura"),
    (3, 12, "mawlid", "Mawlid (Milad-un-Nabi)"),
    (8, 15, "shab_e_barat", "Shab-e-Barat"),
    (9, 1, "ramadan_begins", "Ramadan begins"),
    (10, 1, "eid_al_fitr", "Eid al-Fitr"),
    (12, 10, "eid_al_adha", "Eid al-Adha"),
)


@dataclass(frozen=True)
class Crescent:
    """The Moon at sunset on the evening after a conjunction."""

    age_hours: float
    arcv: float  # Moon's altitude above the Sun's, degrees
    width: float  # crescent width, arcminutes
    odeh_v: float

    @property
    def visible(self) -> bool:
        return self.odeh_v >= ODEH_NAKED_EYE


def _equator(body: astronomy.Body, time: Time, place: Place) -> astronomy.Equatorial:
    return astronomy.Equator(body, time, place.observer, True, True)


def _altitude(eq: astronomy.Equatorial, time: Time, place: Place) -> float:
    return astronomy.Horizon(
        time, place.observer, eq.ra, eq.dec, astronomy.Refraction.Airless
    ).altitude


def crescent_at(place: Place, sunset: Time, conjunction: Time) -> Crescent:
    sun, moon = (
        _equator(astronomy.Body.Sun, sunset, place),
        _equator(astronomy.Body.Moon, sunset, place),
    )
    arcv = _altitude(moon, sunset, place) - _altitude(sun, sunset, place)
    separation = astronomy.AngleBetween(sun.vec, moon.vec)
    semi_diameter = math.degrees(math.asin(MOON_RADIUS_KM / (moon.dist * AU_KM))) * 60
    width = semi_diameter * (1 - math.cos(math.radians(separation)))
    odeh = arcv - (-0.1018 * width**3 + 0.7319 * width**2 - 6.3226 * width + 7.1651)
    return Crescent((sunset.ut - conjunction.ut) * 24, arcv, width, odeh)


def first_day_of_month(place: Place, conjunction: Time) -> date:
    """The civil date a Hijri month is expected to begin, from the conjunction that precedes it."""
    local = astro.to_datetime(conjunction).astimezone(place.zone).date()
    for offset in range(3):
        evening = local + timedelta(days=offset)
        sunset = astro.sunset(place, evening)
        if sunset is None or sunset.ut <= conjunction.ut:
            continue
        if crescent_at(place, sunset, conjunction).visible or offset == 2:
            return evening + timedelta(days=1)
    return local + timedelta(days=3)


def _fixed_from_hijri(year: int, month: int, day: int) -> int:
    return (
        day + 29 * (month - 1) + (6 * month - 1) // 11 + (year - 1) * 354 + (3 + 11 * year) // 30
        + ISLAMIC_EPOCH_RD - 1
    )  # fmt: skip


def tabular_hijri(day: date) -> tuple[int, int, int]:
    """Arithmetic ('tabular') Hijri date. Used only to *name* a month and number its year; the
    date a month starts on comes from the crescent estimate above."""
    fixed = day.toordinal()
    year = (30 * (fixed - ISLAMIC_EPOCH_RD) + 10646) // 10631
    prior = fixed - _fixed_from_hijri(year, 1, 1)
    month = (11 * prior + 330) // 325
    return year, month, fixed - _fixed_from_hijri(year, month, 1) + 1


def month_starts(place: Place, begin: date, end: date) -> list[tuple[date, int, int]]:
    """(first day, hijri year, month number) for every month starting between two dates."""
    found: list[tuple[date, int, int]] = []
    conjunction = astro.next_new_moon(
        astro.to_time(datetime(begin.year, begin.month, begin.day, tzinfo=UTC))
    )
    while True:
        start = first_day_of_month(place, conjunction)
        if start > end:
            return found
        year, month, _ = tabular_hijri(start + timedelta(days=14))  # mid-month: robust to +-2 days
        if start >= begin:
            found.append((start, year, month))
        conjunction = astro.next_new_moon(astro.add_days(conjunction, 1))


def observances(year: int, place: Place) -> list[Observance]:
    wanted = {(month, day): (code, name) for month, day, code, name in OBSERVANCES}
    out: list[Observance] = []
    for start, hijri_year, month in month_starts(place, date(year - 1, 12, 1), date(year, 12, 31)):
        for day in {d for m, d in wanted if m == month}:
            code, name = wanted[(month, day)]
            observed = start + timedelta(days=day - 1)
            if observed.year == year:
                out.append(
                    Observance(
                        code,
                        name,
                        Faith.MUSLIM,
                        observed,
                        f"{day} {HIJRI_MONTHS[month - 1]} {hijri_year} AH (expected)",
                    )
                )
    return sorted(out, key=lambda o: o.date)


@dataclass(frozen=True)
class HijriDate:
    year: int
    month: int
    day: int
    month_name: str


def hijri_on(place: Place, day: date) -> HijriDate:
    """The expected Hijri date of a civil day: counted from the estimated first day of the month."""
    starts = month_starts(place, day - timedelta(days=45), day)
    start, year, month = starts[-1]  # the latest month beginning on or before the day
    return HijriDate(year, month, (day - start).days + 1, HIJRI_MONTHS[month - 1])
