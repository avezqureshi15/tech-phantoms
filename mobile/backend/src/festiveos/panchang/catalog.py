"""Every observance for a year and place, across the faiths the app knows.

Hindu, Buddhist, Jain and Sikh dates come from the lunisolar and solar rules in ``festivals``;
Christian dates from the computus; Muslim dates from a crescent-visibility estimate. Parsi dates
are not included: the Shahenshahi calendar's New Year does not follow a simple rule and needs a
verified table first.
"""

from functools import lru_cache

from festiveos.panchang import christian, festivals, islamic
from festiveos.panchang.astro import Place
from festiveos.panchang.festivals import Observance

COORDINATE_DECIMALS = 1  # about 11 km: festival dates do not change over that distance


def _quantised(place: Place) -> Place:
    """Many nearby coordinates share one cache entry. Listed cities are used as they are."""
    if place.key != "custom":
        return place
    latitude = round(place.latitude, COORDINATE_DECIMALS)
    longitude = round(place.longitude, COORDINATE_DECIMALS)
    return Place("custom", f"{latitude}, {longitude}", latitude, longitude, place.timezone)


@lru_cache(maxsize=256)
def _observances(year: int, place: Place) -> tuple[Observance, ...]:
    combined = [
        *festivals.observances(year, place),
        *christian.observances(year),
        *islamic.observances(year, place),
    ]
    return tuple(sorted(combined, key=lambda o: (o.date, o.name)))


def all_observances(year: int, place: Place) -> list[Observance]:
    """Every observance of a year. Computing a year costs a fraction of a second, and the answer
    never changes, so it is cached here, where every caller (the list, the Today page) shares it."""
    return list(_observances(year, _quantised(place)))
