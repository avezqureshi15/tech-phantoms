from typing import Annotated

from fastapi import Depends

from festiveos.panchang.service import PanchangService


def get_panchang_service() -> PanchangService:
    return PanchangService()


PanchangServiceDep = Annotated[PanchangService, Depends(get_panchang_service)]
