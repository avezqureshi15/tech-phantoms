import uuid
from enum import StrEnum

from pydantic import BaseModel


class ResultKind(StrEnum):
    GROUP = "group"
    FESTIVAL = "festival"
    TRADITION = "tradition"
    EXPENSE = "expense"
    MEMBER = "member"


class SearchResult(BaseModel):
    kind: ResultKind
    id: uuid.UUID
    title: str
    subtitle: str
    household_id: uuid.UUID  # the group it belongs to, so the app can open it in context


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
