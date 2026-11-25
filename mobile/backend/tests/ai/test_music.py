import pytest
from fastapi.testclient import TestClient

from festiveos.ai.music import clean_query, music_links
from tests.ai.conftest import FakeLLM, text, use
from tests.support import API, auth, setup_household


def test_every_service_gets_a_safely_encoded_search() -> None:
    links = dict(music_links("Hanuman Chalisa & Bhajans / M S Subbulakshmi"))

    assert list(links) == [
        f"Play on {n}" for n in ("YouTube", "YouTube Music", "Spotify", "JioSaavn", "Apple Music")
    ]
    for url in links.values():
        assert url.startswith("https://")
        assert " " not in url
        assert "&" not in url.split("?", 1)[-1].replace("%26", "")
    assert (
        "Hanuman%20Chalisa%20%26%20Bhajans%20%2F%20M%20S%20Subbulakshmi" in links["Play on YouTube"]
    )


def test_the_query_is_cleaned_and_capped() -> None:
    assert clean_query("  Om   Jai\n Jagdish\x00 ") == "Om Jai Jagdish"
    assert len(clean_query("x" * 500)) == 100


def test_unicode_titles_survive_encoding() -> None:
    url = dict(music_links("हनुमान चालीसा"))["Play on YouTube"]

    assert "%E0%A4%B9" in url  # percent-encoded UTF-8, not mangled


def ask(client, user, household_id, message="play a hanuman bhajan"):
    return client.post(
        f"{API}/households/{household_id}/ai/conversations",
        json={"message": message},
        headers=auth(user),
    )


def test_asking_for_music_shows_links_to_play_it(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("play_music", {"query": "Hanuman Chalisa"})), text("Here you go."))

    turn = ask(client, dad, household_id).json()

    card = next(i["card"] for i in turn["items"] if i["type"] == "card")
    assert card["kind"] == "links"
    assert card["title"] == "Play: Hanuman Chalisa"
    assert card["links"][0]["label"] == "Play on YouTube"
    assert all(link["url"].startswith("https://") for link in card["links"])


@pytest.mark.parametrize("bad", [{}, {"query": ""}, {"query": "x"}, {"query": "ok", "extra": 1}])
def test_bad_music_requests_are_errors_the_model_can_read_not_crashes(
    client: TestClient, make_user, llm: FakeLLM, bad
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("play_music", bad)), text("Sorry, what should I play?"))

    turn = ask(client, dad, household_id)

    assert turn.status_code == 201
    result = [m for m in llm.requests[1]["messages"] if m["role"] == "user"][-1]["content"][0]
    assert result["is_error"] is True
