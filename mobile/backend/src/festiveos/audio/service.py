from urllib.parse import quote

from festiveos.audio.catalog import TRACKS, Track
from festiveos.audio.schemas import AudioList, TrackLinks, TrackRead
from festiveos.core.log import logged_service

MAX_TRACKS = 30


def links_for(track: Track) -> TrackLinks:
    """Search links, so nothing here can go stale or point at a removed upload."""
    query = quote(" ".join(part for part in (track.title, track.performer) if part))
    return TrackLinks(
        youtube=f"https://www.youtube.com/results?search_query={query}",
        spotify=f"https://open.spotify.com/search/{query}",
        jiosaavn=f"https://www.jiosaavn.com/search/{query}",
    )


@logged_service
class AudioService:
    """Pure lookup in the curated catalogue: no database, no network."""

    def tracks(self, festival: str | None, faiths: list[str], limit: int = MAX_TRACKS) -> AudioList:
        chosen = [
            t
            for t in TRACKS
            if (festival is None or festival in t.festivals) and (not faiths or t.faith in faiths)
        ][:limit]
        return AudioList(
            tracks=[
                TrackRead(
                    id=t.id,
                    title=t.title,
                    kind=t.kind,
                    faith=t.faith,
                    theme=t.theme,
                    language=t.language,
                    note=t.note,
                    performer=t.performer,
                    festivals=list(t.festivals),
                    links=links_for(t),
                )
                for t in chosen
            ]
        )
