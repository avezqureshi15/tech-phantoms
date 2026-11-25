from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from festiveos.auth.dependencies import CurrentUser
from festiveos.core import limits
from festiveos.panchang.dependencies import PanchangServiceDep
from festiveos.panchang.kinds import Faith, Scheme
from festiveos.panchang.schemas import (
    DayPanchangRead,
    NearestRead,
    ObservanceList,
    PlaceRead,
    TodayRead,
)

router = APIRouter(prefix="/panchang", tags=["panchang"])

# A place is a listed city, or coordinates (for anywhere else, including abroad).
City = Annotated[
    str | None, Query(description="A listed city key, e.g. delhi; see /panchang/cities")
]
Latitude = Annotated[float | None, Query(ge=-90, le=90)]
Longitude = Annotated[float | None, Query(ge=-180, le=180)]
Zone = Annotated[
    str | None, Query(description="IANA timezone for coordinates; default Asia/Kolkata")
]


@router.get("/cities", response_model=list[PlaceRead], dependencies=[Depends(limits.read)])
def list_cities(_: CurrentUser, service: PanchangServiceDep):
    return service.cities()


@router.get("/nearest", response_model=NearestRead, dependencies=[Depends(limits.read)])
def nearest_city(
    _: CurrentUser,
    service: PanchangServiceDep,
    latitude: Annotated[float, Query(ge=-90, le=90)],
    longitude: Annotated[float, Query(ge=-180, le=180)],
):
    return service.nearest(latitude, longitude)


@router.get("/today", response_model=TodayRead, dependencies=[Depends(limits.read)])
def today(
    user: CurrentUser,
    service: PanchangServiceDep,
    on: Annotated[date, Query(description="Civil date, YYYY-MM-DD")],
    city: City = None,
    latitude: Latitude = None,
    longitude: Longitude = None,
    timezone: Zone = None,
    scheme: Scheme = Scheme.AMANTA,
    faith: Annotated[list[Faith] | None, Query(description="Preview other faiths")] = None,
):
    """The page for *this person's* faiths (or the ones passed to preview). Coordinates, if
    given, are used for this answer only and never stored."""
    place = service.place(city or user.home_city, latitude, longitude, timezone)
    region = service.region(place, latitude, longitude)
    faiths = [f.value for f in faith] if faith else list(user.faiths)
    return service.today(faiths, place, on, scheme, region)


@router.get("/day", response_model=DayPanchangRead, dependencies=[Depends(limits.read)])
def day(
    _: CurrentUser,
    service: PanchangServiceDep,
    on: Annotated[date, Query(description="Civil date, YYYY-MM-DD")],
    city: City = None,
    latitude: Latitude = None,
    longitude: Longitude = None,
    timezone: Zone = None,
    scheme: Scheme = Scheme.AMANTA,
):
    return service.day(service.place(city, latitude, longitude, timezone), on, scheme)


@router.get("/observances", response_model=ObservanceList, dependencies=[Depends(limits.read)])
def observances(
    _: CurrentUser,
    service: PanchangServiceDep,
    year: Annotated[int, Query(ge=1950, le=2100)],
    city: City = None,
    latitude: Latitude = None,
    longitude: Longitude = None,
    timezone: Zone = None,
    faith: Annotated[
        list[Faith] | None, Query(description="Repeat to filter; none means all")
    ] = None,
):
    place = service.place(city, latitude, longitude, timezone)
    return service.observances(place, year, frozenset(faith or ()))
