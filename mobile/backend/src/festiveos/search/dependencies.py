from typing import Annotated

from fastapi import Depends

from festiveos.db.dependencies import SessionDep
from festiveos.search.service import SearchService


def get_search_service(session: SessionDep) -> SearchService:
    return SearchService(session)


SearchServiceDep = Annotated[SearchService, Depends(get_search_service)]
