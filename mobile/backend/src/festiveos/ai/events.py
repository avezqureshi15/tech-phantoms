"""Finding festive events near the person, from real listings.

The model's own web search (limited to a few event sites) finds the listings. Web text is
untrusted, so nothing it returns is used as it arrives: each event must be an https page on one
of the sites we searched, its text is cleaned and capped, and a fixed set of site-scoped searches
is always offered alongside, so the person is never left with nothing to tap.
"""

import json
import re
import time
from dataclasses import dataclass
from datetime import date
from urllib.parse import quote_plus, urlparse

SEARCH_DOMAINS = ["in.bookmyshow.com", "district.in", "insider.in", "allevents.in"]
SITE_NAMES = {
    "in.bookmyshow.com": "BookMyShow",
    "district.in": "District",
    "insider.in": "Insider",
    "allevents.in": "AllEvents",
}
MAX_EVENTS = 5
CACHE_SECONDS = 6 * 3600  # event listings change slowly; searching is the expensive part
CACHE_SIZE = 200
_cache: dict[tuple[str, str, str], tuple[float, list["Event"]]] = {}


@dataclass(frozen=True)
class Event:
    title: str
    date: str
    venue: str
    url: str


def search_prompt(query: str, city: str, when: str | None, today: date) -> str:
    timing = f" Focus on {when}." if when else " Prefer events in the next few weeks."
    return (
        f"Today is {today.isoformat()}. Find real, upcoming events in or near {city}, India, "
        f"matching: {query}.{timing} Return ONLY a JSON array of at most {MAX_EVENTS} objects with "
        "the keys title, date, venue and url. Only include an event if you found its page, and use "
        "that page's own address as the url. If you find none, return []."
    )


def _clean(value: object, limit: int) -> str:
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", value if isinstance(value, str) else "")
    return re.sub(r"\s+", " ", text).strip()[:limit]


def host_allowed(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and any(
        host == domain or host.endswith("." + domain) for domain in SEARCH_DOMAINS
    )


def parse_events(text: str) -> list[Event]:
    """The valid events in the model's answer; prose, junk and other sites are dropped."""
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        return []
    try:
        raw = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    events: list[Event] = []
    seen: set[str] = set()
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        url, title = _clean(item.get("url"), 500), _clean(item.get("title"), 120)
        if not title or not host_allowed(url) or url in seen:
            continue
        seen.add(url)
        events.append(
            Event(title, _clean(item.get("date"), 40), _clean(item.get("venue"), 120), url)
        )
        if len(events) == MAX_EVENTS:
            break
    return events


def site_searches(query: str, city: str) -> list[tuple[str, str]]:
    """(label, url) pairs that always work: the event searched on each site, plus a general one."""
    links = []
    for domain, name in SITE_NAMES.items():
        terms = quote_plus(f"{query} events {city} site:{domain}")
        links.append((f"More on {name}", f"https://www.google.com/search?q={terms}"))
    links.append(
        (
            "Search everywhere",
            f"https://www.google.com/search?q={quote_plus(f'{query} {city} RSVP')}",
        )
    )
    return links


def cached(city: str, query: str, today: date) -> list[Event] | None:
    entry = _cache.get((city.lower(), query.lower(), today.isoformat()))
    return entry[1] if entry and time.monotonic() - entry[0] < CACHE_SECONDS else None


def remember(city: str, query: str, today: date, events: list[Event]) -> None:
    if len(_cache) >= CACHE_SIZE:
        _cache.clear()  # simple and bounded: a cold cache only costs one more search
    _cache[(city.lower(), query.lower(), today.isoformat())] = (time.monotonic(), events)
