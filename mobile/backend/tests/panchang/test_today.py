import itertools
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from festiveos.panchang import astro, islamic, liturgical, locations, prayer
from tests.support import API, auth

DELHI = locations.CITIES["delhi"]
DAY = "2026-11-24"


def set_faiths(client: TestClient, user, faiths: list[str], **extra) -> None:
    response = client.patch(f"{API}/users/me", json={"faiths": faiths, **extra}, headers=auth(user))
    assert response.status_code == 200, response.text


def today(client: TestClient, user, **params) -> dict:
    response = client.get(
        f"{API}/panchang/today", params={"on": DAY, "city": "delhi", **params}, headers=auth(user)
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_a_hindu_sees_the_panchang_and_the_inauspicious_timings(client, make_user) -> None:
    user = make_user("h@example.com")
    set_faiths(client, user, ["hindu"])

    page = today(client, user)

    assert page["lunar"]["tithis"]
    assert page["timings"]["rahu_kalam"]
    assert page["hijri"] is None
    assert page["prayers"] is None
    assert page["season"] is None


@pytest.mark.parametrize("faith", ["muslim", "christian", "parsi"])
def test_other_faiths_never_see_rahu_kalam_and_the_other_hindu_timings(
    client, make_user, faith
) -> None:
    user = make_user("o@example.com")
    set_faiths(client, user, [faith])

    page = today(client, user)

    assert page["timings"] is None
    assert page["lunar"] is None
    assert page["sun_moon"]["sunrise"]  # but everyone gets the Sun and Moon


@pytest.mark.parametrize("faith", ["jain", "buddhist", "sikh"])
def test_lunar_faiths_get_the_lunar_day_without_the_astrological_timings(
    client, make_user, faith
) -> None:
    user = make_user("l@example.com")
    set_faiths(client, user, [faith])

    page = today(client, user)

    assert page["lunar"]["month_amanta"] == "Kartika"
    assert page["timings"] is None


def test_a_muslim_sees_the_hijri_date_and_prayer_times(client, make_user) -> None:
    user = make_user("m@example.com")
    set_faiths(client, user, ["muslim"])

    page = today(client, user)

    assert page["hijri"] == {
        "day": 13, "month": 6, "month_name": "Jumada al-thani", "year": 1448, "expected": True,
    }  # fmt: skip
    prayers = page["prayers"]
    order = [prayers[k] for k in ("fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha")]
    assert order == sorted(order)
    assert prayers["method"] == "karachi"
    assert prayers["school"] == "hanafi"


def test_a_christian_sees_the_liturgical_season(client, make_user) -> None:
    user = make_user("c@example.com")
    set_faiths(client, user, ["christian"])

    page = today(client, user, on="2026-12-01")

    assert page["season"]["name"] == "Advent"
    assert page["season"]["colour"] == "violet"


def test_several_faiths_show_the_union_of_their_pages(client, make_user) -> None:
    user = make_user("both@example.com")
    set_faiths(client, user, ["hindu", "muslim", "christian"])

    page = today(client, user)

    assert page["timings"]
    assert page["hijri"]
    assert page["season"]


def test_no_answer_gives_a_general_page_with_every_faiths_dates(client, make_user) -> None:
    user = make_user("none@example.com")
    set_faiths(client, user, [])

    page = today(client, user)

    assert (page["lunar"], page["timings"], page["hijri"], page["season"]) == (
        None,
        None,
        None,
        None,
    )
    assert page["upcoming"]  # and all faiths' upcoming observances


def test_upcoming_shows_only_the_persons_faiths_and_only_future_dates(client, make_user) -> None:
    user = make_user("u@example.com")
    set_faiths(client, user, ["christian"])

    upcoming = today(client, user)["upcoming"]

    assert {o["faith"] for o in upcoming} == {"christian"}
    assert all(o["date"] >= DAY for o in upcoming)
    assert [o["date"] for o in upcoming] == sorted(o["date"] for o in upcoming)


@pytest.mark.parametrize(
    ("latitude", "longitude", "region", "rahu"),
    [
        (13.08, 80.27, "tamil", "Rahu Kaalam"),  # Chennai
        (28.61, 77.21, "north", "Rahukaal"),  # Delhi
        (12.97, 77.59, "kannada", "Rahu Kala"),  # Bengaluru
        (40.71, -74.0, None, "Rahu Kalam"),  # New York: too far from any listed city: neutral names
    ],
)
def test_terms_follow_the_region_of_the_persons_location(
    client, make_user, latitude, longitude, region, rahu
) -> None:
    user = make_user("r@example.com")
    set_faiths(client, user, ["hindu"])
    zone = "America/New_York" if region is None else "Asia/Kolkata"

    response = client.get(
        f"{API}/panchang/today",
        params={"on": DAY, "latitude": latitude, "longitude": longitude, "timezone": zone},
        headers=auth(user),
    ).json()

    assert response["region"] == region
    assert response["terms"]["rahu_kalam"] == rahu


def test_the_saved_home_city_is_used_when_no_place_is_given(client, make_user) -> None:
    user = make_user("home@example.com")
    set_faiths(client, user, ["hindu"], home_city="chennai")

    page = client.get(f"{API}/panchang/today", params={"on": DAY}, headers=auth(user)).json()

    assert page["place"]["key"] == "chennai"
    assert page["region"] == "tamil"


def test_the_nearest_city_endpoint_answers_without_keeping_the_point(client, make_user) -> None:
    user = make_user("n@example.com")

    body = client.get(
        f"{API}/panchang/nearest", params={"latitude": 12.95, "longitude": 77.6}, headers=auth(user)
    ).json()

    assert body["city"]["key"] == "bengaluru"
    assert body["region"] == "kannada"
    assert body["distance_km"] < 10
    far = client.get(
        f"{API}/panchang/nearest",
        params={"latitude": -33.9, "longitude": 151.2},
        headers=auth(user),
    ).json()
    assert far["region"] is None  # Sydney: no regional naming


def test_prayer_times_are_ordered_and_physically_sensible() -> None:
    times = prayer.prayer_times(DELHI, date(2026, 6, 21))
    shafi = prayer.prayer_times(DELHI, date(2026, 6, 21), school="shafi")
    sunset = astro.sunset(DELHI, date(2026, 6, 21))

    chain = [times.fajr, times.sunrise, times.dhuhr, times.asr, times.maghrib, times.isha]
    assert [t.ut for t in chain] == sorted(t.ut for t in chain)
    assert times.maghrib.ut == sunset.ut  # Maghrib is sunset
    assert times.asr.ut > shafi.asr.ut  # the Hanafi Asr is later than the Shafi one
    noon = (times.sunrise.ut + times.maghrib.ut) / 2
    assert abs(times.dhuhr.ut - noon) < 10 / 1440  # Dhuhr is about solar noon


def test_isha_comes_later_with_the_deeper_twilight_angle() -> None:
    karachi = prayer.prayer_times(DELHI, date(2026, 3, 1), method="karachi")  # 18 degrees
    isna = prayer.prayer_times(DELHI, date(2026, 3, 1), method="isna")  # 15 degrees

    assert karachi.isha.ut > isna.isha.ut
    assert karachi.fajr.ut < isna.fajr.ut


@pytest.mark.parametrize(
    ("day", "season"),
    [
        (date(2026, 11, 28), "Ordinary Time"),
        (date(2026, 11, 29), "Advent"),  # First Sunday of Advent 2026
        (date(2026, 12, 24), "Advent"),
        (date(2026, 12, 25), "Christmas"),
        (date(2027, 1, 6), "Christmas"),
        (date(2026, 1, 15), "Ordinary Time"),
        (date(2026, 2, 18), "Lent"),  # Ash Wednesday 2026
        (date(2026, 3, 29), "Holy Week"),  # Palm Sunday 2026
        (date(2026, 4, 5), "Easter"),  # Easter Sunday 2026
        (date(2026, 5, 24), "Easter"),  # Pentecost 2026
        (date(2026, 5, 25), "Ordinary Time"),
    ],
)
def test_liturgical_seasons(day: date, season: str) -> None:
    assert liturgical.season_of(day).name == season


def test_hijri_day_numbers_run_from_one_without_gaps() -> None:
    days = [islamic.hijri_on(DELHI, date(2026, 11, 1) + timedelta(days=n)) for n in range(70)]

    for earlier, later in itertools.pairwise(days):
        assert (later.day, later.month) == (earlier.day + 1, earlier.month) or later.day == 1
    assert all(1 <= d.day <= 30 for d in days)
