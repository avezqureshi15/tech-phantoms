"""Daily prayer times (salat), calculated from the Sun's position.

Fajr and Isha are when the Sun is a set angle below the horizon, which is *defined* differently by
different authorities, so the method is a choice, not a fact. Asr begins when an object's shadow
equals its length (Shafi, Maliki, Hanbali) or twice its length (Hanafi, the usual choice in India),
plus the shadow at noon. The result is a good estimate, usually within a few minutes of a local
masjid's printed timetable, which should win wherever the two differ.
"""

import math
from dataclasses import dataclass
from datetime import date

import astronomy

from festiveos.core.errors import InvalidInputError
from festiveos.panchang import astro
from festiveos.panchang.astro import Place, Time

# method -> (fajr degrees below the horizon, isha degrees below the horizon)
METHODS: dict[str, tuple[float, float]] = {
    "karachi": (
        18.0,
        18.0,
    ),  # University of Islamic Sciences, Karachi: common in India and Pakistan
    "mwl": (18.0, 17.0),  # Muslim World League
    "isna": (15.0, 15.0),  # Islamic Society of North America
}
SCHOOL_FACTOR = {"hanafi": 2, "shafi": 1}
DHUHR_DELAY_DAYS = 1 / 1440  # a minute after solar noon, so the Sun has clearly passed the meridian


@dataclass(frozen=True)
class PrayerTimes:
    fajr: Time | None
    sunrise: Time
    dhuhr: Time
    asr: Time | None
    maghrib: Time
    isha: Time | None
    method: str
    school: str


def _after(
    place: Place, start: Time, direction: astronomy.Direction, altitude: float
) -> Time | None:
    return astronomy.SearchAltitude(
        astronomy.Body.Sun, place.observer, direction, start, 1.0, altitude
    )


def prayer_times(
    place: Place, day: date, method: str = "karachi", school: str = "hanafi"
) -> PrayerTimes:
    if method not in METHODS or school not in SCHOOL_FACTOR:
        raise InvalidInputError("Unknown prayer-time method or school")
    fajr_angle, isha_angle = METHODS[method]
    midnight = astro.local_midnight(place, day)
    noon_event = astronomy.SearchHourAngle(astronomy.Body.Sun, place.observer, 0.0, midnight)
    sunrise, sunset = astro.sunrise(place, day), astro.sunset(place, day)
    if sunrise is None or sunset is None:
        raise InvalidInputError("The Sun does not rise and set on this date at this place")

    noon = noon_event.time
    declination = astronomy.Equator(astronomy.Body.Sun, noon, place.observer, True, True).dec
    shadow = SCHOOL_FACTOR[school] + math.tan(math.radians(abs(place.latitude - declination)))
    asr_altitude = math.degrees(math.atan(1 / shadow))

    return PrayerTimes(
        fajr=_after(place, midnight, astronomy.Direction.Rise, -fajr_angle),
        sunrise=sunrise,
        dhuhr=Time(noon.ut + DHUHR_DELAY_DAYS),
        asr=_after(place, noon, astronomy.Direction.Set, asr_altitude),
        maghrib=sunset,
        isha=_after(place, noon, astronomy.Direction.Set, -isha_angle),
        method=method,
        school=school,
    )
