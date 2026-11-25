"""Christian dates (the standard Easter tables) and Islamic dates (checked against what India's
central moon-sighting committee actually declared, as reported by Indian news outlets)."""

import itertools
from datetime import date

import pytest

from festiveos.panchang import christian, islamic, locations

EASTER = {  # year: (Western, Orthodox)
    2023: (date(2023, 4, 9), date(2023, 4, 16)),
    2024: (date(2024, 3, 31), date(2024, 5, 5)),
    2025: (date(2025, 4, 20), date(2025, 4, 20)),
    2026: (date(2026, 4, 5), date(2026, 4, 12)),
    2027: (date(2027, 3, 28), date(2027, 5, 2)),
}


@pytest.mark.parametrize("year", sorted(EASTER))
def test_easter_matches_the_standard_tables(year: int) -> None:
    assert (christian.western_easter(year), christian.orthodox_easter(year)) == EASTER[year]


def test_dates_that_hang_off_easter_and_advent() -> None:
    found = {o.code: o.date for o in christian.observances(2025)}

    assert found["good_friday"] == date(2025, 4, 18)
    assert found["ash_wednesday"] == date(2025, 3, 5)
    assert found["pentecost"] == date(2025, 6, 8)
    assert found["advent"] == date(2025, 11, 30)
    assert found["christmas"] == date(2025, 12, 25)
    assert found["orthodox_christmas"] == date(2025, 1, 7)


# What India's central committee declared after sighting (Ramadan and Eid al-Fitr).
INDIA_DECLARED = {
    (2024, "ramadan_begins"): date(2024, 3, 12),
    (2024, "eid_al_fitr"): date(2024, 4, 11),
    (2025, "ramadan_begins"): date(2025, 3, 2),
    (2025, "eid_al_fitr"): date(2025, 3, 31),
}


@pytest.mark.parametrize("city", ["delhi", "mumbai", "chennai"])
@pytest.mark.parametrize(("year", "code"), sorted(INDIA_DECLARED))
def test_expected_islamic_dates_match_what_india_declared(city: str, year: int, code: str) -> None:
    found = {o.code: o.date for o in islamic.observances(year, locations.CITIES[city])}

    assert found[code] == INDIA_DECLARED[(year, code)]


def test_islamic_dates_are_labelled_expected() -> None:
    sample = islamic.observances(2025, locations.CITIES["delhi"])[0]

    assert "expected" in sample.detail


def test_hijri_months_are_29_or_30_days() -> None:
    starts = islamic.month_starts(locations.CITIES["delhi"], date(2025, 1, 1), date(2026, 12, 31))

    lengths = {(b[0] - a[0]).days for a, b in itertools.pairwise(starts)}
    assert lengths <= {29, 30}
    assert [s[2] for s in starts[:3]] == [
        starts[0][2],
        starts[0][2] % 12 + 1,
        (starts[0][2] + 1) % 12 + 1,
    ]


def test_tabular_hijri_names_a_known_day() -> None:
    year, month, _ = islamic.tabular_hijri(date(2025, 3, 2))

    assert (year, month) == (1446, 9)  # Ramadan 1446


def test_the_catalogue_covers_every_faith_with_a_calendar_engine() -> None:
    from festiveos.panchang import catalog

    faiths = {o.faith.value for o in catalog.all_observances(2026, locations.CITIES["delhi"])}

    assert faiths == {"hindu", "buddhist", "jain", "sikh", "christian", "muslim"}
