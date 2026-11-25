"""One day's panchang for one place, as printed in an almanac: the five limbs with their times,
sun and moon rise and set, the lunar month, the era years and the day's timings.

The panchang day runs from one local sunrise to the next, so a limb that changes at 03:00 shows
under the previous civil date. Times are returned in the place's own timezone.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from festiveos.core.errors import InvalidInputError
from festiveos.panchang import astro, elements, lunar
from festiveos.panchang.astro import Place, Time
from festiveos.panchang.kinds import Scheme

# Which eighth of the daylight (counted from 1 at sunrise) is the inauspicious period, by weekday
# with Sunday = 0. Rahu Kalam is the well-known one; Yamaganda and Gulika are its siblings.
RAHU_PART = (8, 2, 7, 5, 6, 4, 3)
YAMAGANDA_PART = (5, 4, 3, 2, 1, 7, 6)
GULIKA_PART = (7, 6, 5, 4, 3, 2, 1)
MUHURTA_COUNT = 15  # daylight is 15 muhurtas; the 8th is Abhijit
BRAHMA_MUHURTA_BEFORE_SUNRISE = timedelta(minutes=96)
BRAHMA_MUHURTA_LENGTH = timedelta(minutes=48)
FIRST_YEAR, LAST_YEAR = 1950, 2100


@dataclass(frozen=True)
class Span:
    name: str
    start: datetime
    end: datetime
    number: int | None = None  # tithi number within its fortnight, 1..15
    paksha: str | None = None


@dataclass(frozen=True)
class Period:
    start: datetime
    end: datetime


@dataclass(frozen=True)
class DayPanchang:
    date: date
    place: Place
    weekday: str
    vara: str
    sunrise: datetime
    sunset: datetime
    next_sunrise: datetime
    moonrise: datetime | None
    moonset: datetime | None
    tithis: list[Span]
    nakshatras: list[Span]
    yogas: list[Span]
    karanas: list[Span]
    month_amanta: str
    month_purnimanta: str
    paksha: str
    vikram_samvat: int
    shaka_year: int
    sun_sign: str
    moon_sign: str
    ayanamsa: float
    rahu_kalam: Period
    yamaganda: Period
    gulika: Period
    abhijit_muhurta: Period
    brahma_muhurta: Period


def check_date(day: date) -> None:
    if not FIRST_YEAR <= day.year <= LAST_YEAR:
        raise InvalidInputError(f"Panchang is available for {FIRST_YEAR} to {LAST_YEAR}")


def local_time(place: Place, time: Time) -> datetime:
    return _local(place, time)


def _local(place: Place, time: Time) -> datetime:
    return astro.to_datetime(time).astimezone(place.zone).replace(microsecond=0)


def _spans(
    place: Place,
    limb: elements.Limb,
    begin: Time,
    finish: Time,
    name_of,
    number_of=None,
    paksha_of=None,
) -> list[Span]:
    return [
        Span(
            name_of(s.index),
            _local(place, s.start),
            _local(place, s.end),
            number_of(s.index) if number_of else None,
            paksha_of(s.index) if paksha_of else None,
        )
        for s in limb.segments_between(begin, finish)
    ]


def _eighth(sunrise: Time, sunset: Time, part: int, place: Place) -> Period:
    length = (sunset.ut - sunrise.ut) / 8
    return Period(
        _local(place, Time(sunrise.ut + (part - 1) * length)),
        _local(place, Time(sunrise.ut + part * length)),
    )


def day_panchang(place: Place, day: date, scheme: Scheme = Scheme.AMANTA) -> DayPanchang:
    check_date(day)
    rise, set_ = astro.sunrise(place, day), astro.sunset(place, day)
    next_rise = astro.sunrise(place, day + timedelta(days=1))
    if rise is None or set_ is None or next_rise is None:
        raise InvalidInputError("The Sun does not rise and set on this date at this place")

    tithis = _spans(
        place, elements.TITHI, rise, next_rise, elements.tithi_name,
        lambda i: i % 15 + 1, elements.paksha,
    )  # fmt: skip
    sunrise_tithi = elements.TITHI.index_at(rise)
    month = lunar.month_at(rise)
    month_purnimanta, paksha = lunar.label_at(rise, sunrise_tithi, Scheme.PURNIMANTA)
    local_noon = datetime(day.year, day.month, day.day, 12, tzinfo=place.zone)
    vikram, shaka = lunar.era_years(local_noon, month)
    weekday = (day.weekday() + 1) % 7  # Sunday = 0

    muhurta = (set_.ut - rise.ut) / MUHURTA_COUNT
    brahma_start = astro.add_days(rise, -BRAHMA_MUHURTA_BEFORE_SUNRISE / timedelta(days=1))
    moon_rise = astro.moonrise(place, astro.local_midnight(place, day))
    moon_set = astro.moonset(place, astro.local_midnight(place, day))
    return DayPanchang(
        date=day,
        place=place,
        weekday=elements.WEEKDAYS[weekday],
        vara=elements.VARAS[weekday],
        sunrise=_local(place, rise),
        sunset=_local(place, set_),
        next_sunrise=_local(place, next_rise),
        moonrise=_local(place, moon_rise) if moon_rise else None,
        moonset=_local(place, moon_set) if moon_set else None,
        tithis=tithis,
        nakshatras=_spans(
            place, elements.NAKSHATRA, rise, next_rise, lambda i: elements.NAKSHATRAS[i]
        ),
        yogas=_spans(place, elements.YOGA, rise, next_rise, lambda i: elements.YOGAS[i]),
        karanas=_spans(place, elements.KARANA, rise, next_rise, elements.karana_name),
        month_amanta=month.name,
        month_purnimanta=month_purnimanta if scheme is Scheme.PURNIMANTA else month.name,
        paksha=paksha,
        vikram_samvat=vikram,
        shaka_year=shaka,
        sun_sign=lunar.RASHIS[lunar.rashi_at(rise)],
        moon_sign=lunar.RASHIS[int(astro.sidereal_moon(rise) // 30) % 12],
        ayanamsa=round(astro.ayanamsa(rise), 4),
        rahu_kalam=_eighth(rise, set_, RAHU_PART[weekday], place),
        yamaganda=_eighth(rise, set_, YAMAGANDA_PART[weekday], place),
        gulika=_eighth(rise, set_, GULIKA_PART[weekday], place),
        abhijit_muhurta=Period(
            _local(place, Time(rise.ut + 7 * muhurta)), _local(place, Time(rise.ut + 8 * muhurta))
        ),
        brahma_muhurta=Period(
            _local(place, brahma_start),
            _local(place, astro.add_days(brahma_start, BRAHMA_MUHURTA_LENGTH / timedelta(days=1))),
        ),
    )
