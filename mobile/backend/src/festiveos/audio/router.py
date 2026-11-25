from typing import Annotated

from fastapi import APIRouter, Depends, Query

from festiveos.audio.dependencies import AudioServiceDep
from festiveos.audio.schemas import AudioList
from festiveos.auth.dependencies import CurrentUser
from festiveos.core import limits
from festiveos.core.faiths import Faith

router = APIRouter(prefix="/audio", tags=["audio"])


@router.get("", response_model=AudioList, dependencies=[Depends(limits.read)])
def list_tracks(
    user: CurrentUser,
    service: AudioServiceDep,
    festival: Annotated[
        str | None,
        Query(pattern=r"^[A-Z_]{1,32}$", description="A festival type, e.g. DIWALI"),
    ] = None,
    faith: Annotated[list[Faith] | None, Query(description="Repeat to filter by faith")] = None,
):
    """Music for a festival. With a festival given and no faith, every faith's music for that
    festival is returned; with neither, the person's own faiths."""
    faiths = [f.value for f in faith] if faith else [] if festival else list(user.faiths)
    return service.tracks(festival, faiths)
