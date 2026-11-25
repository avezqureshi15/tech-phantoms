"""The Today page: what to show a person depends on their faith.

* Hindu: the full panchang, with the inauspicious and auspicious timings (Rahu Kalam and the rest).
* Jain, Buddhist, Sikh: the lunar day (tithi, month) but not the astrological timings.
* Muslim: the Hijri date and prayer times.
* Christian: the liturgical season.
* Parsi, or no answer: the Sun and Moon, and the upcoming observances.

Several faiths show the union. Everyone gets sunrise, sunset and their faiths' upcoming dates.
"""

from dataclasses import dataclass
from datetime import date

from festiveos.core.faiths import Faith
from festiveos.panchang import catalog, daily, islamic, liturgical, prayer, terms
from festiveos.panchang.astro import Place
from festiveos.panchang.daily import DayPanchang
from festiveos.panchang.festivals import Observance
from festiveos.panchang.kinds import Scheme

UPCOMING = 10
LUNAR_FAITHS = {Faith.HINDU, Faith.JAIN, Faith.BUDDHIST, Faith.SIKH}


@dataclass(frozen=True)
class Today:
    date: date
    place: Place
    region: str | None
    terms: terms.Terms
    faiths: tuple[Faith, ...]
    day: DayPanchang  # always computed: sunrise, sunset and the Moon are for everyone
    show_lunar: bool  # tithi, nakshatra, yoga, karana, month and era
    show_timings: bool  # Rahu Kalam, Yamaganda, Gulika, Abhijit and Brahma muhurta
    hijri: islamic.HijriDate | None
    prayers: prayer.PrayerTimes | None
    season: liturgical.Season | None
    upcoming: list[Observance]


def _upcoming(place: Place, day: date, faiths: set[Faith]) -> list[Observance]:
    found: list[Observance] = []
    for year in (day.year, day.year + 1):
        found += [
            o
            for o in catalog.all_observances(year, place)
            if o.date >= day and (not faiths or o.faith in faiths)
        ]
    return sorted(found, key=lambda o: (o.date, o.name))[:UPCOMING]


def today(
    place: Place,
    day: date,
    faiths: tuple[Faith, ...],
    scheme: Scheme = Scheme.AMANTA,
    region: str | None = None,
) -> Today:
    chosen = set(faiths)
    return Today(
        date=day,
        place=place,
        region=region,
        terms=terms.terms_for(region),
        faiths=faiths,
        day=daily.day_panchang(place, day, scheme),
        show_lunar=bool(chosen & LUNAR_FAITHS),
        show_timings=Faith.HINDU in chosen,
        hijri=islamic.hijri_on(place, day) if Faith.MUSLIM in chosen else None,
        prayers=prayer.prayer_times(place, day) if Faith.MUSLIM in chosen else None,
        season=liturgical.season_of(day) if Faith.CHRISTIAN in chosen else None,
        upcoming=_upcoming(place, day, chosen),
    )
