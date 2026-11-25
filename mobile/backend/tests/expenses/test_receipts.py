from datetime import date

import pytest
from fastapi.testclient import TestClient

from festiveos.core.errors import InvalidInputError
from festiveos.expenses.receipts import to_date, to_draft, to_minor
from festiveos.integrations.sarvam import get_sarvam
from festiveos.main import app
from tests.support import API, auth, setup_household

TODAY = date(2026, 11, 25)
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 100


class FakeReader:
    def __init__(self, result=None, error: Exception | None = None) -> None:
        self.result, self.error, self.calls = result or {}, error, []

    def extract(self, data, *, filename, content_type, schema, language="en-IN"):
        self.calls.append({"size": len(data), "filename": filename, "content_type": content_type})
        if self.error:
            raise self.error
        return self.result


RECEIPT = {
    "merchant": "Sharma Sweets",
    "date": "2026-11-22",
    "total": 1323,
    "items": [{"name": "Kaju Katli", "amount": 900}, {"name": "Samosa", "amount": 240}],
}


# ------------------------------------------------------------------------------- the normaliser


@pytest.mark.parametrize(
    ("value", "paise"),
    [(1323, 132300), (1323.5, 132350), ("Rs 1,323.00", 132300), ("₹ 90", 9000), ("0.10", 10)],
)
def test_amounts_become_whole_paise(value, paise) -> None:
    assert to_minor(value) == paise


@pytest.mark.parametrize("value", [None, True, "", "abc", 0, -5, "-12", 10**12, float("nan")])
def test_nonsense_amounts_are_dropped_not_guessed(value) -> None:
    assert to_minor(value) is None


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("2026-11-22", date(2026, 11, 22)),
        ("22/11/2026", date(2026, 11, 22)),
        ("22-11-2026", date(2026, 11, 22)),
        ("2026-11-26", date(2026, 11, 26)),  # tomorrow is tolerated (time zones)
        ("2027-01-01", None),  # far in the future
        ("1999-01-01", None),
        ("31/02/2026", None),
        ("last week", None),
        (None, None),
        (20261122, None),
    ],
)
def test_dates_are_parsed_defensively(value, expected) -> None:
    assert to_date(value, TODAY) == expected


def test_a_clean_receipt_becomes_a_draft_without_warnings() -> None:
    draft = to_draft({**RECEIPT, "total": 1140}, TODAY)

    assert draft.merchant == "Sharma Sweets"
    assert draft.spent_on == date(2026, 11, 22)
    assert draft.total_minor == 114000
    assert [(i.name, i.amount_minor) for i in draft.items] == [
        ("Kaju Katli", 90000),
        ("Samosa", 24000),
    ]
    assert draft.warnings == []


def test_a_total_that_does_not_match_the_items_is_flagged() -> None:
    draft = to_draft({**RECEIPT, "total": 5000}, TODAY)

    assert draft.total_minor == 500000
    assert any("add up" in w for w in draft.warnings)


def test_a_missing_total_is_filled_from_the_items_with_a_warning() -> None:
    draft = to_draft(
        {"items": [{"name": "Tea", "amount": 120}, {"name": "Cake", "amount": 80}]}, TODAY
    )

    assert draft.total_minor == 20000
    assert any("added up" in w for w in draft.warnings)


def test_nothing_readable_gives_an_empty_draft_that_says_so() -> None:
    draft = to_draft({}, TODAY)

    assert (draft.merchant, draft.spent_on, draft.total_minor, draft.items) == (
        None,
        None,
        None,
        [],
    )
    assert any("total" in w for w in draft.warnings)


def test_a_bad_date_is_left_out_with_a_warning_and_junk_items_are_skipped() -> None:
    draft = to_draft(
        {
            "date": "someday",
            "total": 100,
            "items": [
                "x",
                {"name": "", "amount": 5},
                {"name": "Chai", "amount": "free"},
                {"name": "Ok", "amount": 1},
            ],
        },
        TODAY,
    )

    assert draft.spent_on is None
    assert any("date" in w for w in draft.warnings)
    assert [i.name for i in draft.items] == ["Ok"]


def test_a_huge_item_list_is_capped() -> None:
    items = [{"name": f"item {i}", "amount": 1} for i in range(500)]

    assert len(to_draft({"items": items, "total": 500}, TODAY).items) == 30


# ----------------------------------------------------------------------------------- the endpoint


@pytest.fixture
def reader(client: TestClient):
    fake = FakeReader(RECEIPT)
    app.dependency_overrides[get_sarvam] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_sarvam, None)


def scan(client, user, household_id, data=PNG, name="r.png", content_type="image/png"):
    return client.post(
        f"{API}/households/{household_id}/expenses/scan",
        files={"file": (name, data, content_type)},
        headers=auth(user),
    )


def test_a_receipt_photo_becomes_a_draft_and_nothing_is_saved(
    client: TestClient, make_user, reader: FakeReader
) -> None:
    dad, _, household_id = setup_household(client, make_user)

    response = scan(client, dad, household_id)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["merchant"] == "Sharma Sweets"
    assert body["total_minor"] == 132300
    assert body["currency"] == "INR"
    assert reader.calls == [{"size": len(PNG), "filename": "r.png", "content_type": "image/png"}]
    listing = client.get(f"{API}/households/{household_id}/expenses", headers=auth(dad))
    assert listing.json() == []


def test_the_file_is_judged_by_its_bytes_not_its_label(
    client: TestClient, make_user, reader: FakeReader
) -> None:
    dad, _, household_id = setup_household(client, make_user)

    fake_image = scan(client, dad, household_id, data=b"<html>not an image</html>")
    jpeg_called_png = scan(client, dad, household_id, data=b"\xff\xd8\xff\xe0" + b"0" * 50)

    assert fake_image.status_code == 422
    assert jpeg_called_png.status_code == 200
    assert reader.calls[-1]["content_type"] == "image/jpeg"  # what it really is


def test_empty_and_missing_files_are_refused(
    client: TestClient, make_user, reader: FakeReader
) -> None:
    dad, _, household_id = setup_household(client, make_user)

    assert scan(client, dad, household_id, data=b"").status_code == 422
    missing = client.post(f"{API}/households/{household_id}/expenses/scan", headers=auth(dad))
    assert missing.status_code == 422
    assert reader.calls == []


def test_a_large_photo_is_accepted_but_a_huge_one_is_refused(
    client: TestClient, make_user, reader: FakeReader
) -> None:
    dad, _, household_id = setup_household(client, make_user)

    big_photo = scan(
        client, dad, household_id, data=PNG + b"0" * 2_000_000
    )  # far over the 256 KB JSON limit
    huge = scan(client, dad, household_id, data=PNG + b"0" * 11_000_000)

    assert big_photo.status_code == 200
    assert huge.status_code == 413


def test_only_a_member_can_scan_into_a_group(
    client: TestClient, make_user, reader: FakeReader
) -> None:
    _dad, _, household_id = setup_household(client, make_user)
    stranger = make_user("stranger@example.com")

    response = scan(client, stranger, household_id)

    assert response.status_code in (403, 404)
    assert reader.calls == []


def test_without_a_reader_the_scan_is_unavailable(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    app.dependency_overrides[get_sarvam] = lambda: None
    try:
        response = scan(client, dad, household_id)
    finally:
        app.dependency_overrides.pop(get_sarvam, None)

    assert response.status_code == 503


def test_a_file_the_reader_cannot_read_is_a_422_with_a_helpful_message(
    client: TestClient, make_user
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    fake = FakeReader(error=InvalidInputError("We couldn't read that file."))
    app.dependency_overrides[get_sarvam] = lambda: fake
    try:
        response = scan(client, dad, household_id)
    finally:
        app.dependency_overrides.pop(get_sarvam, None)

    assert response.status_code == 422
    assert "couldn't read" in response.json()["detail"]
