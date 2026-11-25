from urllib.parse import parse_qs, quote, urlparse

from fastapi.testclient import TestClient

from festiveos.audio.catalog import TRACKS
from festiveos.core.faiths import Faith
from festiveos.festivals.schemas import FestivalType
from tests.support import API, auth


def get(client: TestClient, user, **params):
    return client.get(f"{API}/audio", params=params, headers=auth(user))


def test_the_catalogue_is_consistent() -> None:
    ids = [t.id for t in TRACKS]
    festival_codes = {f.value for f in FestivalType}
    faiths = {f.value for f in Faith}

    assert len(ids) == len(set(ids))  # ids are unique
    assert all(t.festivals for t in TRACKS)  # every track belongs to at least one festival
    assert {code for t in TRACKS for code in t.festivals} <= festival_codes  # and only real ones
    assert {t.faith for t in TRACKS} <= faiths
    assert faiths <= {t.faith for t in TRACKS}  # every faith has something to offer
    assert all(t.title and t.note and t.theme and t.language for t in TRACKS)


def test_every_major_festival_has_music(client: TestClient, make_user) -> None:
    covered = {code for t in TRACKS for code in t.festivals}

    for code in (
        "DIWALI",
        "GANESH_CHATURTHI",
        "NAVRATRI",
        "MAHA_SHIVARATRI",
        "JANMASHTAMI",
        "CHRISTMAS",
        "EASTER",
        "EID_AL_FITR",
        "GURPURAB",
        "BUDDHA_PURNIMA",
        "MAHAVIR_JAYANTI",
        "NAVROZ",
    ):
        assert code in covered, code


def test_a_festival_returns_its_tracks_with_search_links(client: TestClient, make_user) -> None:
    user = make_user("a@example.com")

    body = get(client, user, festival="GANESH_CHATURTHI").json()

    titles = [t["title"] for t in body["tracks"]]
    assert "Sukhkarta Dukhharta" in titles
    assert all("GANESH_CHATURTHI" in t["festivals"] for t in body["tracks"])
    links = next(t for t in body["tracks"] if t["id"] == "hanuman-chalisa" or True)["links"]
    assert links["youtube"].startswith("https://www.youtube.com/results?search_query=")
    assert links["spotify"].startswith("https://open.spotify.com/search/")
    assert links["jiosaavn"].startswith("https://www.jiosaavn.com/search/")


def test_the_search_query_names_the_performer_and_is_url_safe(
    client: TestClient, make_user
) -> None:
    user = make_user("a@example.com")

    tracks = get(client, user, festival="RAMA_NAVAMI").json()["tracks"]

    chalisa = next(t for t in tracks if t["id"] == "hanuman-chalisa")
    query = parse_qs(urlparse(chalisa["links"]["youtube"]).query)["search_query"][0]
    assert query == "Hanuman Chalisa Hariharan"
    assert chalisa["links"]["spotify"].endswith(quote("Hanuman Chalisa Hariharan"))
    apostrophe = next(
        t
        for t in get(client, user, festival="MILAD_UN_NABI").json()["tracks"]
        if "Tala" in t["title"]
    )
    assert "'" not in apostrophe["links"]["youtube"].split("=", 1)[1]  # quoted, not raw


def test_with_no_festival_it_uses_the_persons_faiths(client: TestClient, make_user) -> None:
    user = make_user("a@example.com")
    client.patch(f"{API}/users/me", json={"faiths": ["sikh"]}, headers=auth(user))

    tracks = get(client, user).json()["tracks"]

    assert tracks
    assert {t["faith"] for t in tracks} == {"sikh"}


def test_a_festival_shows_every_faiths_music_unless_filtered(client: TestClient, make_user) -> None:
    user = make_user("a@example.com")
    client.patch(f"{API}/users/me", json={"faiths": ["christian"]}, headers=auth(user))

    everyone = {t["faith"] for t in get(client, user, festival="DIWALI").json()["tracks"]}
    only_christian = get(client, user, festival="DIWALI", faith="christian").json()["tracks"]

    assert everyone == {"hindu"}  # Diwali music is Hindu; the viewer's own faith does not hide it
    assert only_christian == []


def test_an_unknown_festival_is_an_empty_list_not_an_error(client: TestClient, make_user) -> None:
    user = make_user("a@example.com")

    assert get(client, user, festival="NOT_A_FESTIVAL").json() == {"tracks": []}
    assert get(client, user, festival="lowercase").status_code == 422
    assert client.get(f"{API}/audio").status_code == 401
