from typing import Annotated

from fastapi import Depends

from festiveos.audio.service import AudioService


def get_audio_service() -> AudioService:
    return AudioService()


AudioServiceDep = Annotated[AudioService, Depends(get_audio_service)]
