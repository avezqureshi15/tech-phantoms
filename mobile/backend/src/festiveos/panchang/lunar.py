"""Lunar months: which month a date is in, whether it is an adhika (leap) month, and the era years.

An amanta month runs new moon to new moon and is named for the zodiac sign the Sun *enters*
during it (Chaitra holds the Mesha sankranti). A month in which the Sun enters no new sign is the
adhika month, named for the month that follows it. Purnimanta (north India) runs full moon to full
moon, so the dark fortnight is named for the *next* amanta month.
"""

from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache

from festiveos.panchang import astro
from festiveos.panchang.astro import Time
from festiveos.panchang.kinds import Scheme

MASAS = (
    "Chaitra", "Vaishakha", "Jyeshtha", "Ashadha", "Shravana", "Bhadrapada", "Ashwin", "Kartika",
    "Margashirsha", "Pausha", "Magha", "Phalguna",
)  # fmt: skip
RASHIS = (
    "Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya", "Tula", "Vrishchika", "Dhanu",
    "Makara", "Kumbha", "Meena",
)  # fmt: skip
SANKRANTI_STEP = 30.0


@dataclass(frozen=True)
class LunarMonth:
    start: Time  # the new moon that begins it
    end: Time  # the next new moon
    index: int  # 0 = Chaitra .. 11 = Phalguna
    adhika: bool

    @property
    def name(self) -> str:
        return ("Adhika " if self.adhika else "") + MASAS[self.index]


def rashi_at(time: Time) -> int:
    """The Sun's sidereal sign, 0 = Mesha .. 11 = Meena."""
    return int(astro.sidereal_sun(time) // SANKRANTI_STEP) % 12


@lru_cache(maxsize=512)
def _month_from_new_moon(start_ut: float) -> LunarMonth:
    start = Time(start_ut)
    end = astro.next_new_moon(astro.add_days(start, 1))
    rashi_start, rashi_end = rashi_at(start), rashi_at(end)
    return LunarMonth(start, end, (rashi_start + 1) % 12, rashi_start == rashi_end)


def month_at(time: Time) -> LunarMonth:
    """The amanta month containing ``time``."""
    new_moon = astro.next_new_moon(astro.add_days(time, -32))
    while True:
        following = astro.next_new_moon(astro.add_days(new_moon, 1))
        if following.ut > time.ut:
            break
        new_moon = following
    return _month_from_new_moon(new_moon.ut)


def month_after(month: LunarMonth) -> LunarMonth:
    return _month_from_new_moon(month.end.ut)


def label_at(time: Time, tithi_index: int, scheme: Scheme) -> tuple[str, str]:
    """(month name, paksha) as a panchang prints them for a moment in the given tithi."""
    month = month_at(time)
    if scheme is Scheme.PURNIMANTA and tithi_index >= 15:
        month = month_after(month)
    return month.name, ("Shukla" if tithi_index < 15 else "Krishna")


def era_years(moment: datetime, month: LunarMonth) -> tuple[int, int]:
    """(Vikram Samvat, Shaka year). Both turn over at Chaitra Shukla Pratipada.

    Gujarat starts the Vikram year after Diwali (Kartikadi); that variant is not offered.
    """
    year = moment.year
    before_chaitra = moment.month <= 4 and month.index >= 8  # Margashirsha .. Phalguna in Jan-Apr
    return (year + 56, year - 79) if before_chaitra else (year + 57, year - 78)
