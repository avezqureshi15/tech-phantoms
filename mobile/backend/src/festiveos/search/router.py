from typing import Annotated

from fastapi import APIRouter, Depends, Query

from festiveos.auth.dependencies import CurrentUser
from festiveos.core import limits
from festiveos.search.dependencies import SearchServiceDep
from festiveos.search.schemas import SearchResponse

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse, dependencies=[Depends(limits.read)])
def search(
    user: CurrentUser,
    service: SearchServiceDep,
    q: Annotated[str, Query(min_length=2, max_length=60, description="At least two characters")],
):
    return service.search(user, q.strip())
