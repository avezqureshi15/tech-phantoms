"""Links to play a song, bhajan, hymn, naat or shabad on the person's own phone.

There is no catalogue to go stale: each link is a search on a music service, so it always works, and
the person's own app (YouTube, Spotify, JioSaavn, Apple Music) opens and plays it.
"""

import re
from urllib.parse import quote

SERVICES: tuple[tuple[str, str], ...] = (
    ("YouTube", "https://www.youtube.com/results?search_query={q}"),
    ("YouTube Music", "https://music.youtube.com/search?q={q}"),
    ("Spotify", "https://open.spotify.com/search/{q}"),
    ("JioSaavn", "https://www.jiosaavn.com/search/{q}"),
    ("Apple Music", "https://music.apple.com/in/search?term={q}"),
)


def clean_query(query: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f]+", " ", query)).strip()[:100]


def music_links(query: str) -> list[tuple[str, str]]:
    """(label, url) for each service, with the search term safely encoded."""
    encoded = quote(clean_query(query), safe="")
    return [(f"Play on {name}", template.format(q=encoded)) for name, template in SERVICES]
