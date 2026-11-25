from pydantic import BaseModel


class TrackLinks(BaseModel):
    youtube: str
    spotify: str
    jiosaavn: str


class TrackRead(BaseModel):
    id: str
    title: str
    kind: str
    faith: str
    theme: str
    language: str
    note: str
    performer: str | None
    festivals: list[str]
    links: TrackLinks


class AudioList(BaseModel):
    tracks: list[TrackRead]
