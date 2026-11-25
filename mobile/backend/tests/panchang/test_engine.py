"""The panchang engine against published almanac values, and against its own invariants.

Golden dates below were confirmed against Drik Panchang and published news calendars for
New Delhi; they are not computed by this code. A failure here means the astronomy or a festival
rule changed, so check against a published panchang before "fixing" an expectation.
"""

import itertools
from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from festiveos.panchang import astro, daily, elements, festivals, locations, lunar

DELHI = locations.CITIES["delhi"]
IST = timezone(timedelta(hours=5, minutes=30))

# (year, code) -> date, as published for New Delhi.
PUBLISHED = {
    (2024, "holika_dahan"): date(2024, 3, 24),
    (2024, "holi"): date(2024, 3, 25),
    (2024, "maha_shivaratri"): date(2024, 3, 8),
    (2024, "raksha_bandhan"): date(2024, 8, 19),
    (2025, "holika_dahan"): date(2025, 3, 13),
    (2025, "holi"): date(2025, 3, 14),
    (2025, "dussehra"): date(2025, 10, 2),
    (2026, "maha_shivaratri"): date(2026, 2, 15),
    (2026, "holika_dahan"): date(2026, 3, 3),
    (2026, "holi"): date(2026, 3, 4),
    (2026, "rama_navami"): date(2026, 3, 26),
    (2026, "ganesh_chaturthi"): date(2026, 9, 14),
    (2026, "dussehra"): date(2026, 10, 20),
    (2026, "diwali"): date(2026, 11, 8),
    (2027, "diwali"): date(2027, 10, 29),
}


@pytest.fixture(scope="module")
def by_year() -> dict[int, dict[str, date]]:
    return {
        y: {o.code: o.date for o in festivals.observances(y, DELHI)}
        for y in (2024, 2025, 2026, 2027)
    }


@pytest.mark.parametrize(("year", "code"), sorted(PUBLISHED))
def test_festival_dates_match_published_almanacs(by_year, year: int, code: str) -> None:
    assert by_year[year][code] == PUBLISHED[(year, code)]


def test_amavasya_boundaries_match_drik_to_the_minute() -> None:
    """Drik Panchang, New Delhi: Amavasya begins 11:27 on 8 Nov 2026 and ends 12:31 on 9 Nov."""
    segment = elements.TITHI.segment_at(astro.to_time(datetime(2026, 11, 8, 12, 0, tzinfo=IST)))

    start = astro.to_datetime(segment.start).astimezone(IST)
    end = astro.to_datetime(segment.end).astimezone(IST)
    assert elements.tithi_name(segment.index) == "Amavasya"
    assert abs(start - datetime(2026, 11, 8, 11, 27, tzinfo=IST)) < timedelta(minutes=3)
    assert abs(end - datetime(2026, 11, 9, 12, 31, tzinfo=IST)) < timedelta(minutes=3)


def test_lahiri_ayanamsa_matches_the_standard_values() -> None:
    assert astro.ayanamsa(astro.Time(0.0)) == pytest.approx(23.857, abs=0.003)  # J2000
    assert astro.ayanamsa(astro.to_time(datetime(2025, 1, 1, tzinfo=UTC))) == pytest.approx(
        24.206, abs=0.003
    )


@pytest.mark.parametrize(
    ("day", "month", "era"),
    [
        (date(2025, 10, 21), "Ashwin", (2082, 1947)),
        (date(2025, 3, 25), "Phalguna", (2081, 1946)),  # the old year, days before Ugadi
        (date(2025, 3, 30), "Chaitra", (2082, 1947)),  # Ugadi 2025: the year turns over
        (date(2026, 3, 19), "Chaitra", (2083, 1948)),  # Gudi Padwa 2026
        (date(2026, 2, 15), "Magha", (2082, 1947)),
    ],
)
def test_month_and_era_years(day: date, month: str, era: tuple[int, int]) -> None:
    moment = datetime(day.year, day.month, day.day, 12, tzinfo=IST)
    found = lunar.month_at(astro.to_time(moment))

    assert found.name == month
    assert lunar.era_years(moment, found) == era


def test_2026_has_an_adhika_jyeshtha() -> None:
    inside = lunar.month_at(astro.to_time(datetime(2026, 5, 25, tzinfo=IST)))
    after = lunar.month_at(astro.to_time(datetime(2026, 6, 25, tzinfo=IST)))

    assert (inside.name, after.name) == ("Adhika Jyeshtha", "Jyeshtha")


def test_every_lunar_month_has_thirty_tithis_and_the_year_twelve_or_thirteen_months() -> None:
    start = astro.to_time(datetime(2026, 1, 1, tzinfo=IST))
    month = lunar.month_at(start)
    count = 0
    while month.start.ut < start.ut + 365:
        tithis = elements.TITHI.segments_between(month.start, astro.add_days(month.end, -1e-3))
        assert [t.index for t in tithis] == list(range(30))
        month, count = lunar.month_after(month), count + 1
    assert count in (12, 13)


def test_a_day_panchang_covers_sunrise_to_sunrise_without_gaps() -> None:
    panchang = daily.day_panchang(DELHI, date(2026, 11, 8))

    for limb in (panchang.tithis, panchang.nakshatras, panchang.yogas, panchang.karanas):
        assert limb[0].start <= panchang.sunrise
        assert limb[-1].end >= panchang.next_sunrise
        for earlier, later in itertools.pairwise(limb):
            assert abs(later.start - earlier.end) < timedelta(seconds=2)


def test_published_values_for_new_delhi_on_diwali_2026() -> None:
    panchang = daily.day_panchang(DELHI, date(2026, 11, 8))

    assert panchang.weekday == "Sunday"
    assert panchang.sunset.strftime("%H:%M") == "17:31"  # Drik: pradosh begins 17:31
    assert panchang.tithis[-1].name == "Amavasya"
    assert (panchang.month_amanta, panchang.paksha) == ("Ashwin", "Krishna")
    assert (panchang.vikram_samvat, panchang.shaka_year) == (2083, 1948)
    assert (panchang.nakshatras[0].name, panchang.moon_sign) == ("Swati", "Tula")


def test_inauspicious_periods_follow_the_weekday_table() -> None:
    sunday = daily.day_panchang(DELHI, date(2026, 11, 8))
    monday = daily.day_panchang(DELHI, date(2026, 11, 9))
    day_length = (sunday.sunset - sunday.sunrise) / 8

    assert sunday.rahu_kalam.end == sunday.sunset  # Sunday: the last eighth
    assert abs(sunday.rahu_kalam.end - sunday.rahu_kalam.start - day_length) < timedelta(seconds=2)
    monday_start = (
        monday.sunrise + (monday.sunset - monday.sunrise) / 8
    )  # Monday: the second eighth
    assert abs(monday.rahu_kalam.start - monday_start) < timedelta(seconds=2)


def test_abhijit_muhurta_is_centred_on_midday() -> None:
    panchang = daily.day_panchang(DELHI, date(2026, 11, 8))
    midday = panchang.sunrise + (panchang.sunset - panchang.sunrise) / 2

    centre = (
        panchang.abhijit_muhurta.start
        + (panchang.abhijit_muhurta.end - panchang.abhijit_muhurta.start) / 2
    )
    assert abs(centre - midday) < timedelta(seconds=2)


def test_sankranti_falls_where_the_sun_enters_the_sign() -> None:
    moment, day = festivals.sankranti(9, 2026, DELHI)  # Makara

    assert day == date(2026, 1, 14)
    assert astro.sidereal_sun(moment) == pytest.approx(270.0, abs=0.001)


def test_the_same_festival_can_fall_on_different_days_in_different_places() -> None:
    """Sunrise decides the day, so a festival near a tithi boundary differs by place."""
    delhi = {o.code: o.date for o in festivals.observances(2023, DELHI)}
    chennai = {o.code: o.date for o in festivals.observances(2023, locations.CITIES["chennai"])}

    assert set(delhi) == set(chennai)
    assert all(abs((delhi[c] - chennai[c]).days) <= 1 for c in delhi)


def test_polar_places_with_no_sunrise_are_refused_not_guessed() -> None:
    from festiveos.core.errors import InvalidInputError

    svalbard = locations.custom_place(78.2, 15.6, "Arctic/Longyearbyen")

    with pytest.raises(InvalidInputError):
        daily.day_panchang(svalbard, date(2026, 12, 21))


@pytest.mark.parametrize("year", [1949, 2101])
def test_years_outside_the_supported_range_are_refused(year: int) -> None:
    from festiveos.core.errors import InvalidInputError

    with pytest.raises(InvalidInputError):
        daily.check_date(date(year, 6, 1))
