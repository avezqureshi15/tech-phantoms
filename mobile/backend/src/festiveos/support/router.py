from fastapi import APIRouter, Depends, status

from festiveos.auth.dependencies import CurrentUser, require_feature
from festiveos.core import limits
from festiveos.support.dependencies import SupportServiceDep
from festiveos.support.schemas import CallbackCreate, CallbackRead

router = APIRouter(prefix="/support", tags=["support"])


@router.post(
    "/callback",
    response_model=CallbackRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_feature("support_callback")), Depends(limits.support_callback)],
)
def request_callback(payload: CallbackCreate, user: CurrentUser, service: SupportServiceDep):
    """Ask the support team to phone you back, in your language. Needs your explicit consent."""
    return service.request_callback(user, payload)
