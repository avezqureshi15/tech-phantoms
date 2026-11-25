from fastapi import APIRouter, Depends, Response, status

from festiveos.auth.dependencies import AuthServiceDep
from festiveos.auth.schemas import AuthResponse, GoogleSignIn, RefreshRequest
from festiveos.core import limits

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/google", response_model=AuthResponse, dependencies=[Depends(limits.sign_in)])
def sign_in_with_google(payload: GoogleSignIn, service: AuthServiceDep):
    return service.sign_in_with_google(payload.id_token)


@router.post("/refresh", response_model=AuthResponse, dependencies=[Depends(limits.refresh)])
def refresh(payload: RefreshRequest, service: AuthServiceDep):
    return service.refresh(payload.refresh_token)


@router.post(
    "/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(limits.logout)]
)
def logout(payload: RefreshRequest, service: AuthServiceDep) -> Response:
    service.logout(payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
