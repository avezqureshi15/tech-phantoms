"""Astronomy for the panchang: the Sun's and Moon's positions, the Lahiri ayanamsa, and where a
given sunrise falls. Everything else in this package is built on these few functions.

Positions come from ``astronomy-engine`` (MIT, pure Python, about one arcminute accurate), which
puts a tithi boundary within roughly two minutes of the printed ones. Tropical longitudes are of
the true equinox of date; the sidereal longitude subtracts the Lahiri (Chitrapaksha) ayanamsa, the
Indian government standard.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from zoneinfo import ZoneInfo

import astronomy

J2000_JD = 2451545.0
# Calendar Reform Committee value: 23d 15' 00.658" at the 1956 equinox, JD 2435553.5, minus the
# nutation term so it is a mean ayanamsa.
_AYANAMSA_1956 = 23.250182778 - 0.004658035
_JD_1956 = 2435553.5
SOLVER_ITERATIONS = 40


@dataclass(frozen=True)
class Place:
    key: str
    name: str
    latitude: float
    longitude: float
    timezone: str
    elevation_m: float = 0.0

    @property
    def zone(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    @property
    def observer(self) -> astronomy.Observer:
        return astronomy.Observer(self.latitude, self.longitude, self.elevation_m)


Time = astronomy.Time


def to_time(moment: datetime) -> Time:
    utc = moment.astimezone(UTC)
    return Time.Make(
        utc.year, utc.month, utc.day, utc.hour, utc.minute, utc.second + utc.microsecond / 1e6
    )


def to_datetime(time: Time) -> datetime:
    return (
        time.Utc().replace(tzinfo=UTC, microsecond=0) if False else time.Utc().replace(tzinfo=UTC)
    )


def add_days(time: Time, days: float) -> Time:
    return Time(time.ut + days)


def sun_longitude(time: Time) -> float:
    return astronomy.SunPosition(time).elon


def moon_longitude(time: Time) -> float:
    return astronomy.EclipticGeoMoon(time).lon


def _precession_degrees(jd: float) -> float:
    centuries = (jd - J2000_JD) / 36525
    return (5028.796195 * centuries + 1.1054348 * centuries**2) / 3600


def ayanamsa(time: Time) -> float:
    """Lahiri ayanamsa in degrees (23.857 at J2000, about 24.2 in 2025)."""
    jd = time.ut + J2000_JD
    return _AYANAMSA_1956 + _precession_degrees(jd) - _precession_degrees(_JD_1956)


def sidereal(longitude: float, time: Time) -> float:
    return (longitude - ayanamsa(time)) % 360


def sidereal_sun(time: Time) -> float:
    return sidereal(sun_longitude(time), time)


def sidereal_moon(time: Time) -> float:
    return sidereal(moon_longitude(time), time)


def elongation(time: Time) -> float:
    """How far the Moon is ahead of the Sun, 0 to 360 degrees; 12 degrees is one tithi."""
    return (moon_longitude(time) - sun_longitude(time)) % 360


def _signed_gap(value: float, target: float) -> float:
    return (value - target + 180) % 360 - 180


def crossing(function: Callable[[Time], float], target: float, low: Time, high: Time) -> Time:
    """When an increasing angle (``function``, in degrees) reaches ``target`` within [low, high].

    The caller guarantees the crossing is inside the window and that the angle moves less than
    180 degrees across it, which holds for every element here with windows of a couple of days.
    """
    start, end = low.ut, high.ut
    for _ in range(SOLVER_ITERATIONS):
        middle = (start + end) / 2
        if _signed_gap(function(Time(middle)), target) < 0:
            start = middle
        else:
            end = middle
    return Time((start + end) / 2)


def local_midnight(place: Place, day: "datetime.date") -> Time:  # type: ignore[name-defined]
    return to_time(datetime(day.year, day.month, day.day, tzinfo=place.zone))


@lru_cache(maxsize=8192)
def sunrise(place: Place, day: "datetime.date") -> Time | None:  # type: ignore[name-defined]
    """Upper-limb sunrise with standard refraction, the panchang convention. None in polar night."""
    return astronomy.SearchRiseSet(
        astronomy.Body.Sun,
        place.observer,
        astronomy.Direction.Rise,
        local_midnight(place, day),
        1.0,
    )


@lru_cache(maxsize=8192)
def sunset(place: Place, day: "datetime.date") -> Time | None:  # type: ignore[name-defined]
    return astronomy.SearchRiseSet(
        astronomy.Body.Sun, place.observer, astronomy.Direction.Set, local_midnight(place, day), 1.0
    )


def moonrise(place: Place, after: Time) -> Time | None:
    return astronomy.SearchRiseSet(
        astronomy.Body.Moon, place.observer, astronomy.Direction.Rise, after, 1.5
    )


def moonset(place: Place, after: Time) -> Time | None:
    return astronomy.SearchRiseSet(
        astronomy.Body.Moon, place.observer, astronomy.Direction.Set, after, 1.5
    )


def next_new_moon(after: Time, limit_days: float = 35) -> Time:
    found = astronomy.SearchMoonPhase(0.0, after, limit_days)
    if found is None:
        raise RuntimeError("no new moon found")
    return found
