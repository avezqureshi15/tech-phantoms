from datetime import date
from functools import lru_cache

from festiveos.core.errors import InvalidInputError
from festiveos.core.faiths import Faith as UserFaith
from festiveos.core.log import logged_service
from festiveos.panchang import catalog, daily, locations
from festiveos.panchang import today as today_page
from festiveos.panchang.astro import Place
from festiveos.panchang.kinds import Faith, Scheme
from festiveos.panchang.schemas import (
    DayPanchangRead,
    HijriRead,
    LunarRead,
    NearestRead,
    ObservanceList,
    ObservanceRead,
    PlaceRead,
    PrayerRead,
    SeasonRead,
    SunMoonRead,
    TermsRead,
    TimingsRead,
    TodayRead,
)


def _place_read(place: Place) -> PlaceRead:
    return PlaceRead(
        key=place.key,
        name=place.name,
        latitude=place.latitude,
        longitude=place.longitude,
        timezone=place.timezone,
    )


def _prayers(times, place: Place) -> PrayerRead:
    def local(moment):
        return None if moment is None else daily.local_time(place, moment)

    return PrayerRead(
        fajr=local(times.fajr),
        sunrise=local(times.sunrise),
        dhuhr=local(times.dhuhr),
        asr=local(times.asr),
        maghrib=local(times.maghrib),
        isha=local(times.isha),
        method=times.method,
        school=times.school,
    )


@lru_cache(maxsize=512)
def _today_page(
    known: tuple[UserFaith, ...], place: Place, day: date, scheme: Scheme, region: str | None
) -> TodayRead:
    """One person's page for one day. Everything it needs is a pure function of these arguments, so
    a repeat visit (the Home strip, the Today tab, pulling to refresh) is answered from memory."""
    page = today_page.today(place, day, known, scheme, region)
    d = page.day
    panchang = DayPanchangRead.model_validate(
        {**d.__dict__, "place": _place_read(place).model_dump()}, from_attributes=True
    )
    return TodayRead(
        date=day,
        place=_place_read(place),
        region=region,
        faiths=[f.value for f in known],
        terms=TermsRead.model_validate(page.terms.__dict__),
        sun_moon=SunMoonRead(
            sunrise=d.sunrise, sunset=d.sunset, moonrise=d.moonrise, moonset=d.moonset
        ),
        lunar=LunarRead.model_validate(panchang.model_dump()) if page.show_lunar else None,
        timings=TimingsRead.model_validate(panchang.model_dump()) if page.show_timings else None,
        hijri=HijriRead(
            day=page.hijri.day,
            month=page.hijri.month,
            month_name=page.hijri.month_name,
            year=page.hijri.year,
        )
        if page.hijri
        else None,
        prayers=_prayers(page.prayers, place) if page.prayers else None,
        season=SeasonRead.model_validate(page.season.__dict__) if page.season else None,
        upcoming=[ObservanceRead.model_validate(o, from_attributes=True) for o in page.upcoming],
    )


@logged_service
class PanchangService:
    """Pure computation: no database, nothing stored, safe to call for any place and date."""

    def place(
        self,
        city: str | None,
        latitude: float | None,
        longitude: float | None,
        timezone: str | None,
    ) -> Place:
        return locations.resolve(city, latitude, longitude, timezone)

    def region(self, place: Place, latitude: float | None, longitude: float | None) -> str | None:
        return locations.region_of(place, latitude, longitude)

    def nearest(self, latitude: float, longitude: float) -> NearestRead:
        """The listed city closest to a point; the point is used for this answer, never kept."""
        city, km = locations.nearest(latitude, longitude)
        return NearestRead(
            city=_place_read(city),
            distance_km=round(km, 1),
            region=locations.REGIONS[city.key] if km <= locations.MAX_REGION_DISTANCE_KM else None,
        )

    def today(
        self,
        faiths: list[str],
        place: Place,
        day: date,
        scheme: Scheme,
        region: str | None,
    ) -> TodayRead:
        known = tuple(UserFaith(v) for v in faiths if v in UserFaith._value2member_map_)
        return _today_page(known, place, day, scheme, region)

    def cities(self) -> list[PlaceRead]:
        return [_place_read(p) for p in locations.CITIES.values()]

    def day(self, place: Place, day: date, scheme: Scheme) -> DayPanchangRead:
        panchang = daily.day_panchang(place, day, scheme)
        return DayPanchangRead.model_validate(
            {**panchang.__dict__, "place": _place_read(place).model_dump()},
            from_attributes=True,
        )

    def observances(self, place: Place, year: int, faiths: frozenset[Faith]) -> ObservanceList:
        if not daily.FIRST_YEAR <= year <= daily.LAST_YEAR:
            raise InvalidInputError(f"Year must be {daily.FIRST_YEAR} to {daily.LAST_YEAR}")
        chosen = [
            o for o in catalog.all_observances(year, place) if not faiths or o.faith in faiths
        ]
        return ObservanceList(
            year=year,
            place=_place_read(place),
            observances=[ObservanceRead.model_validate(o, from_attributes=True) for o in chosen],
        )
