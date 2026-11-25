from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from festiveos.ai.llm import LLM, build_llm
from festiveos.ai.service import AIService
from festiveos.config import ai_enabled, get_settings
from festiveos.db.dependencies import SessionDep
from festiveos.integrations.flags import FeatureFlags, get_feature_flags
from festiveos.integrations.nudgebee import get_incidents


@lru_cache
def _shared_llm() -> LLM:
    """One client (and connection pool) per process."""
    return build_llm(get_settings(), get_feature_flags(), get_incidents())


def get_llm() -> LLM | None:
    """None when no OpenAI key is configured; tests override this with a fake."""
    return _shared_llm() if ai_enabled() else None


def get_ai_service(
    session: SessionDep,
    llm: Annotated[LLM | None, Depends(get_llm)],
    features: Annotated[FeatureFlags, Depends(get_feature_flags)],
) -> AIService:
    return AIService(session, llm, get_settings(), features)


AIServiceDep = Annotated[AIService, Depends(get_ai_service)]
