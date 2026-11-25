from sqlalchemy.orm import Session

from festiveos.core.log import logged_service
from festiveos.households.repository import HouseholdRepository
from festiveos.search.repository import SearchRepository, like_pattern
from festiveos.search.schemas import ResultKind, SearchResponse, SearchResult
from festiveos.users.models import User

PER_KIND = 5


@logged_service
class SearchService:
    """Search across everything in the groups the person belongs to, and nothing else."""

    def __init__(self, session: Session) -> None:
        self._search = SearchRepository(session)
        self._households = HouseholdRepository(session)

    def search(self, actor: User, query: str, per_kind: int = PER_KIND) -> SearchResponse:
        ids = self._households.member_household_ids(actor.id)
        if not ids:
            return SearchResponse(query=query, results=[])
        pattern = like_pattern(query)

        results = [
            SearchResult(
                kind=ResultKind.GROUP,
                id=g.id,
                title=g.name,
                subtitle=g.kind.title(),
                household_id=g.id,
            )
            for g in self._search.groups(ids, pattern, per_kind)
        ]
        results += [
            SearchResult(
                kind=ResultKind.FESTIVAL,
                id=f.id,
                title=f.name,
                subtitle=f"{f.start_date:%d %b %Y}",
                household_id=f.household_id,
            )
            for f in self._search.festivals(ids, pattern, per_kind)
        ]
        results += [
            SearchResult(
                kind=ResultKind.TRADITION,
                id=t.id,
                title=t.name,
                subtitle=t.festival_type.replace("_", " ").title(),
                household_id=t.household_id,
            )
            for t in self._search.traditions(ids, pattern, per_kind)
        ]
        results += [
            SearchResult(
                kind=ResultKind.EXPENSE,
                id=e.id,
                title=e.description,
                subtitle=f"{e.category.title()} · {e.spent_on:%d %b %Y}",
                household_id=e.household_id,
            )
            for e in self._search.expenses(ids, pattern, per_kind)
        ]
        results += [
            SearchResult(
                kind=ResultKind.MEMBER, id=u.id, title=u.name, subtitle="Member", household_id=gid
            )
            for u, gid in self._search.members(ids, pattern, per_kind)
        ]
        return SearchResponse(query=query, results=results)
