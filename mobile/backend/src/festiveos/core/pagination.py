from typing import Annotated

from fastapi import Query

MAX_PAGE_SIZE = 100

Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Offset = Annotated[int, Query(ge=0)]
