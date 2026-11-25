import uuid
from collections.abc import Iterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from fastapi.responses import StreamingResponse

from festiveos.ai.dependencies import AIServiceDep
from festiveos.ai.schemas import (
    CardResponse,
    ConversationDetail,
    ConversationRead,
    DocumentRead,
    MessageCreate,
    SkillRead,
    SpeakRequest,
    TranscriptRead,
    TurnRead,
)
from festiveos.auth.dependencies import CurrentUser, require_feature
from festiveos.config import get_settings
from festiveos.core import limits
from festiveos.core.pagination import Limit, Offset
from festiveos.core.sse import sse_response
from festiveos.core.uploads import read_limited
from festiveos.integrations.sarvam import SarvamClient, get_sarvam

router = APIRouter(tags=["ai"])

# Every call that reaches the model is charged against both the hourly and the daily budget.
# A feature switched off in Flagsmith answers 503 before anything else (and before any paid call).
UTSAV_ON = Depends(require_feature("utsav"))
TURN_LIMITS = [UTSAV_ON, Depends(limits.ai_turn), Depends(limits.ai_daily)]
SCAN_LIMITS = [
    Depends(require_feature("utsav", "document_upload")),
    Depends(limits.scan),
    Depends(limits.scan_daily),
]
VOICE_LIMITS = [
    Depends(require_feature("utsav", "utsav_voice")),
    Depends(limits.voice),
    Depends(limits.voice_daily),
]
SarvamDep = Annotated[SarvamClient | None, Depends(get_sarvam)]


@router.get("/ai/skills", response_model=list[SkillRead], dependencies=[Depends(limits.read)])
def list_skills(_: CurrentUser, service: AIServiceDep):
    return service.skills()


@router.post(
    "/households/{household_id}/ai/conversations",
    response_model=TurnRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=TURN_LIMITS,
)
def start_conversation(
    household_id: uuid.UUID, payload: MessageCreate, user: CurrentUser, service: AIServiceDep
):
    return service.start(
        user,
        household_id,
        payload.message,
        payload.documents,
        mode=payload.mode,
        language=payload.language,
    )


@router.post(
    "/households/{household_id}/ai/documents",
    response_model=DocumentRead,
    dependencies=SCAN_LIMITS,
)
def read_document(
    household_id: uuid.UUID,
    user: CurrentUser,
    service: AIServiceDep,
    reader: SarvamDep,
    file: Annotated[UploadFile, File()],
):
    """Read a document (photo or PDF) into text to attach to a message. Nothing is stored."""
    data = read_limited(file.file, get_settings().max_upload_bytes)
    return service.read_document(user, household_id, data, file.filename or "document", reader)


@router.post(
    "/households/{household_id}/ai/transcribe",
    response_model=TranscriptRead,
    dependencies=VOICE_LIMITS,
)
def transcribe(
    household_id: uuid.UUID,
    user: CurrentUser,
    service: AIServiceDep,
    reader: SarvamDep,
    file: Annotated[UploadFile, File()],
):
    """A short voice recording as text, in whatever language was spoken. Nothing is stored."""
    data = read_limited(file.file, get_settings().max_upload_bytes)
    return service.transcribe(user, household_id, data, file.filename or "voice.m4a", reader)


@router.post(
    "/households/{household_id}/ai/speak",
    response_class=Response,
    dependencies=VOICE_LIMITS,
)
def speak(
    household_id: uuid.UUID,
    payload: SpeakRequest,
    user: CurrentUser,
    service: AIServiceDep,
    reader: SarvamDep,
):
    """Text as natural speech (a WAV file), in the language the text is written in."""
    audio = service.speak(user, household_id, payload, reader)
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@router.get(
    "/households/{household_id}/ai/conversations",
    response_model=list[ConversationRead],
    dependencies=[Depends(limits.read)],
)
def list_conversations(
    household_id: uuid.UUID,
    user: CurrentUser,
    service: AIServiceDep,
    limit: Limit = 20,
    offset: Offset = 0,
):
    return service.list(user, household_id, limit, offset)


@router.get(
    "/ai/conversations/{conversation_id}",
    response_model=ConversationDetail,
    dependencies=[Depends(limits.read)],
)
def get_conversation(conversation_id: uuid.UUID, user: CurrentUser, service: AIServiceDep):
    return service.get(user, conversation_id)


@router.post(
    "/ai/conversations/{conversation_id}/messages",
    response_model=TurnRead,
    dependencies=TURN_LIMITS,
)
def send_message(
    conversation_id: uuid.UUID, payload: MessageCreate, user: CurrentUser, service: AIServiceDep
):
    return service.send(
        user, conversation_id, payload.message, payload.documents, language=payload.language
    )


@router.post(
    "/ai/conversations/{conversation_id}/cards/{card_id}/response",
    response_model=TurnRead,
    dependencies=TURN_LIMITS,
)
def respond_to_card(
    conversation_id: uuid.UUID,
    card_id: uuid.UUID,
    payload: CardResponse,
    user: CurrentUser,
    service: AIServiceDep,
):
    return service.respond(user, conversation_id, card_id, payload)


@router.delete(
    "/ai/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(limits.write)],
)
def delete_conversation(conversation_id: uuid.UUID, user: CurrentUser, service: AIServiceDep):
    service.delete(user, conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------------------------------- streaming
# The same three turns as above, answered as a stream of server-sent events:
#   start         {"conversation_id"}   the turn began
#   text          {"segment", "text"}   a piece of the answer; a new segment is a new message
#   tool          {"name"}              the model started a tool call
#   card          {"card"}              a result card (e.g. a hosting plan)
#   pending_card  {"card"}              a question or confirmation waiting for the person
#   done          the authoritative result (conversation_id, agent, items, pending_card): replace
#                 everything streamed so far in this turn with it
#   error         {"status", "message"} the turn failed after streaming began
# Checks that can fail (404, 409, 422, 503) still answer with a normal status before any event.


def _wire(events: Iterator[dict[str, Any]]) -> Iterator[dict[str, Any]]:
    try:
        for event in events:
            if event["type"] == "done":
                yield {"type": "done", **event["turn"].model_dump(mode="json")}
            else:
                yield event
    finally:
        close = getattr(events, "close", None)
        if close is not None:
            close()


@router.post(
    "/households/{household_id}/ai/conversations/stream",
    response_class=StreamingResponse,
    dependencies=TURN_LIMITS,
)
def start_conversation_stream(
    household_id: uuid.UUID, payload: MessageCreate, user: CurrentUser, service: AIServiceDep
) -> StreamingResponse:
    return sse_response(
        _wire(
            service.start_stream(
                user,
                household_id,
                payload.message,
                payload.documents,
                mode=payload.mode,
                language=payload.language,
            )
        )
    )


@router.post(
    "/ai/conversations/{conversation_id}/messages/stream",
    response_class=StreamingResponse,
    dependencies=TURN_LIMITS,
)
def send_message_stream(
    conversation_id: uuid.UUID, payload: MessageCreate, user: CurrentUser, service: AIServiceDep
) -> StreamingResponse:
    return sse_response(
        _wire(
            service.send_stream(
                user, conversation_id, payload.message, payload.documents, language=payload.language
            )
        )
    )


@router.post(
    "/ai/conversations/{conversation_id}/cards/{card_id}/response/stream",
    response_class=StreamingResponse,
    dependencies=TURN_LIMITS,
)
def respond_to_card_stream(
    conversation_id: uuid.UUID,
    card_id: uuid.UUID,
    payload: CardResponse,
    user: CurrentUser,
    service: AIServiceDep,
) -> StreamingResponse:
    return sse_response(_wire(service.respond_stream(user, conversation_id, card_id, payload)))
