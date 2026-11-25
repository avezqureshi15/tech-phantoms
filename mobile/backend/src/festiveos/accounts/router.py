from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from festiveos.accounts.dependencies import AccountServiceDep
from festiveos.accounts.schemas import FeaturesRead, ProfileUpdate
from festiveos.auth.dependencies import CurrentUser
from festiveos.core import limits
from festiveos.integrations.flags import FeatureFlags, get_feature_flags
from festiveos.users.schemas import UserRead

router = APIRouter(prefix="/users", tags=["account"])


@router.get("/me", response_model=UserRead, dependencies=[Depends(limits.read)])
def read_me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserRead, dependencies=[Depends(limits.write)])
def update_me(payload: ProfileUpdate, user: CurrentUser, service: AccountServiceDep):
    return service.update_profile(user, payload)


@router.delete(
    "/me", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(limits.destructive)]
)
def delete_me(user: CurrentUser, service: AccountServiceDep) -> Response:
    service.delete(user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


features_router = APIRouter(tags=["account"])


@features_router.get("/features", response_model=FeaturesRead, dependencies=[Depends(limits.read)])
def read_features(user: CurrentUser, flags: Annotated[FeatureFlags, Depends(get_feature_flags)]):
    """The features that are on for this person. Evaluated here, so the app needs no flag key."""
    evaluated = flags.for_user(str(user.id))
    return FeaturesRead(features=evaluated.features, announcement=evaluated.value("announcement"))
