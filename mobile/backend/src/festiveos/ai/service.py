import threading
import uuid
from collections.abc import Callable, Generator, Iterator
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

from pydantic import TypeAdapter
from sqlalchemy.orm import Session

from festiveos.ai.agents import AGENTS, ELDER, ORCHESTRATOR, RECITE, SKILLS
from festiveos.ai.cards import Card, QuestionCard, validate_answers
from festiveos.ai.llm import LLM
from festiveos.ai.models import AIConversation, AIPendingCard
from festiveos.ai.orchestrator import Event, Orchestrator, Run, TurnOutcome
from festiveos.ai.repository import AIRepository
from festiveos.ai.schemas import (
    MAX_DOCUMENT_CHARS,
    MAX_MESSAGE_CHARS,
    AttachedDocument,
    CardResponse,
    ConversationDetail,
    ConversationRead,
    DocumentRead,
    MessageRead,
    SkillRead,
    SpeakRequest,
    TranscriptRead,
    TurnRead,
)
from festiveos.ai.speech import (
    LANGUAGE_NAMES,
    SPEECH_LANGUAGES,
    detect_language,
    first_chunk,
    speakable,
)
from festiveos.ai.tools import PendingCard, ToolContext, ToolResult, execute_action
from festiveos.config import Settings
from festiveos.core.errors import (
    ConflictError,
    InvalidInputError,
    NotFoundError,
    ServiceUnavailableError,
)
from festiveos.core.log import logged_service
from festiveos.core.uploads import checked_audio, checked_document
from festiveos.households.access import HouseholdAccess
from festiveos.households.repository import HouseholdRepository
from festiveos.integrations.flags import FeatureFlags, feature_off
from festiveos.integrations.sarvam import SarvamClient
from festiveos.users.models import User

MAX_AUDIO_BYTES = 3 * 1024 * 1024  # about 30 seconds of speech, with room to spare
TITLE_CHARS = 80
# A turn that crashed leaves its claim behind; after this it no longer blocks the conversation.
STALE_TURN = timedelta(minutes=3)
CARD = TypeAdapter(Card)


@lru_cache
def _turn_slots(size: int) -> threading.BoundedSemaphore:
    return threading.BoundedSemaphore(size)


class _Journal:
    """Persists each step as it happens, committing so nothing is lost if a later call fails and
    no connection is held while the model thinks."""

    def __init__(self, session: Session, repo: AIRepository, conversation: AIConversation) -> None:
        self._session, self._repo, self._conversation = session, repo, conversation

    def record(self, role: str, content: Any, ui: list[dict[str, Any]] | None = None) -> None:
        self._repo.add_message(self._conversation, role, content, ui)
        self._session.commit()

    def set_agent(self, name: str) -> None:
        self._repo.set_agent(self._conversation.id, name)
        self._conversation.active_agent = name

    def open_card(self, tool_use_id: str, pending: PendingCard, payload: dict[str, Any]) -> None:
        self._repo.add_card(
            AIPendingCard(
                id=pending.card.id,
                conversation_id=self._conversation.id,
                tool_use_id=tool_use_id,
                kind=pending.kind,
                card=pending.card.model_dump(mode="json"),
                payload=payload,
            )
        )
        self._session.commit()


@logged_service
class AIService:
    """Utsav. Every method authorises first: a conversation belongs to the person who started it,
    and only while they remain a member of the household."""

    def __init__(
        self,
        session: Session,
        llm: LLM | None,
        settings: Settings,
        features: FeatureFlags | None = None,
    ) -> None:
        self._features = features or FeatureFlags(None)
        self._session = session
        self._llm = llm
        self._settings = settings
        self._repo = AIRepository(session)
        self._access = HouseholdAccess(HouseholdRepository(session))

    # ------------------------------------------------------------------------------- turns

    # Each turn has a blocking form (``start``) and a streaming form (``start_stream``). They share
    # one code path: the streaming form hands back the events as they happen, the blocking form
    # drains them. Every check that can fail runs in the plain method, before the first event, so a
    # streamed request still gets a proper 404/409/422/503 and not a half-sent 200.

    def start(
        self,
        actor: User,
        household_id: uuid.UUID,
        text: str,
        documents: list[AttachedDocument] | None = None,
        mode: str = "normal",
        language: str | None = None,
    ) -> TurnRead:
        return _finished(
            self.start_stream(
                actor, household_id, text, documents, stream=False, mode=mode, language=language
            )
        )

    def start_stream(
        self,
        actor: User,
        household_id: uuid.UUID,
        text: str,
        documents: list[AttachedDocument] | None = None,
        *,
        stream: bool = True,
        mode: str = "normal",
        language: str | None = None,
    ) -> Iterator[Event]:
        llm = self._require_llm()
        self._access.member(household_id, actor.id)
        self._check_mode(actor, mode)
        conversation = self._repo.add_conversation(
            AIConversation(
                household_id=household_id, user_id=actor.id, title=text.strip()[:TITLE_CHARS]
            )
        )
        self._session.commit()
        attached = _attached(documents)
        return self._turn_events(
            actor,
            conversation,
            llm,
            lambda o: o.start_events(
                text,
                first_message=True,
                stream=stream,
                documents=attached,
                agent={"elder": ELDER, "recite": RECITE}.get(mode),
                language=LANGUAGE_NAMES.get(language or ""),
            ),
        )

    def send(
        self,
        actor: User,
        conversation_id: uuid.UUID,
        text: str,
        documents: list[AttachedDocument] | None = None,
        language: str | None = None,
    ) -> TurnRead:
        return _finished(
            self.send_stream(
                actor, conversation_id, text, documents, stream=False, language=language
            )
        )

    def send_stream(
        self,
        actor: User,
        conversation_id: uuid.UUID,
        text: str,
        documents: list[AttachedDocument] | None = None,
        *,
        stream: bool = True,
        language: str | None = None,
    ) -> Iterator[Event]:
        llm = self._require_llm()
        conversation = self._owned(actor, conversation_id)
        if self._repo.get_open_card(conversation.id):
            raise ConflictError("Answer the open card first, or start a new chat.")
        if conversation.message_count >= self._settings.ai_max_messages:
            raise ConflictError("This chat has got long. Please start a new one.")
        attached = _attached(documents)
        return self._turn_events(
            actor,
            conversation,
            llm,
            lambda o: o.start_events(
                text,
                first_message=False,
                stream=stream,
                documents=attached,
                language=LANGUAGE_NAMES.get(language or ""),
            ),
        )

    def respond(
        self, actor: User, conversation_id: uuid.UUID, card_id: uuid.UUID, response: CardResponse
    ) -> TurnRead:
        return _finished(
            self.respond_stream(actor, conversation_id, card_id, response, stream=False)
        )

    def respond_stream(
        self,
        actor: User,
        conversation_id: uuid.UUID,
        card_id: uuid.UUID,
        response: CardResponse,
        *,
        stream: bool = True,
    ) -> Iterator[Event]:
        llm = self._require_llm()
        conversation = self._owned(actor, conversation_id)
        card = self._repo.get_card(card_id)
        if card is None or card.conversation_id != conversation.id:
            raise NotFoundError("Card not found")
        if card.status != "open":
            raise ConflictError("That card has already been answered.")
        result, status = self._result_for(
            card, response
        )  # bad answers are a 422 before anything runs

        def resume(orchestrator: Orchestrator, ctx: ToolContext) -> Run:
            if not self._repo.resolve_card(card.id, status):
                raise ConflictError("That card has already been answered.")
            self._session.commit()
            outcome = result
            if status == "approved":
                outcome = execute_action(ctx, card.payload["action"], card.payload["params"])
            return orchestrator.resume_events(
                card.tool_use_id, outcome, card.payload, stream=stream
            )

        return self._turn_events(actor, conversation, llm, resume, with_ctx=True)

    def read_document(
        self,
        actor: User,
        household_id: uuid.UUID,
        data: bytes,
        filename: str,
        reader: SarvamClient | None,
    ) -> DocumentRead:
        """Read an uploaded document into text for the person to attach to a message. Nothing is
        stored: the file lives in memory for this call only."""
        self._access.member(household_id, actor.id)
        if reader is None:
            raise ServiceUnavailableError("Reading documents is not available right now.")
        content_type = checked_document(data)
        text = reader.parse(data, filename=filename, content_type=content_type).strip()
        if not text:
            raise InvalidInputError("We couldn't find any text in that file.")
        return DocumentRead(
            name=filename[:120],
            text=text[:MAX_DOCUMENT_CHARS],
            truncated=len(text) > MAX_DOCUMENT_CHARS,
        )

    def transcribe(
        self,
        actor: User,
        household_id: uuid.UUID,
        data: bytes,
        filename: str,
        reader: SarvamClient | None,
    ) -> TranscriptRead:
        """A short voice recording as text, in whatever language was spoken. Nothing is stored."""
        self._access.member(household_id, actor.id)
        if reader is None:
            raise ServiceUnavailableError("Voice is not available right now.")
        if len(data) > MAX_AUDIO_BYTES:
            raise InvalidInputError("That recording is too long. Keep it under 30 seconds.")
        content_type = checked_audio(data)
        heard = reader.transcribe(data, filename=filename, content_type=content_type)
        if not heard.text:
            raise InvalidInputError("I didn't catch that. Please try again.")
        return TranscriptRead(text=heard.text[:MAX_MESSAGE_CHARS], language=heard.language)

    def speak(
        self,
        actor: User,
        household_id: uuid.UUID,
        data: SpeakRequest,
        reader: SarvamClient | None,
    ) -> bytes:
        """Text as natural speech (WAV), in the language it is written in. Nothing is stored."""
        self._access.member(household_id, actor.id)
        if reader is None:
            raise ServiceUnavailableError("Speaking is not available right now.")
        words = first_chunk(speakable(data.text))
        if not words:
            raise InvalidInputError("There is nothing to say.")
        language = data.language if data.language in SPEECH_LANGUAGES else detect_language(words)
        return reader.speak(words, language=language, pace=data.pace)

    # ------------------------------------------------------------------------------- reads

    def skills(self) -> list[SkillRead]:
        return [SkillRead(**vars(skill)) for skill in SKILLS.values()]

    def list(
        self, actor: User, household_id: uuid.UUID, limit: int, offset: int
    ) -> list[ConversationRead]:
        self._access.member(household_id, actor.id)
        rows = self._repo.list_conversations(actor.id, household_id, limit, offset)
        return [ConversationRead.model_validate(row) for row in rows]

    def get(self, actor: User, conversation_id: uuid.UUID) -> ConversationDetail:
        conversation = self._owned(actor, conversation_id)
        messages = [
            MessageRead(role=m.role, items=m.ui, created_at=m.created_at)
            for m in self._repo.list_messages(conversation.id)
            if m.ui is not None and m.role in ("user", "assistant", "notice") and m.ui
        ]
        open_card = self._repo.get_open_card(conversation.id)
        return ConversationDetail(
            **ConversationRead.model_validate(conversation).model_dump(),
            messages=messages,
            pending_card=CARD.validate_python(open_card.card) if open_card else None,
        )

    def delete(self, actor: User, conversation_id: uuid.UUID) -> None:
        self._repo.delete_conversation(self._owned(actor, conversation_id))
        self._session.commit()

    # ---------------------------------------------------------------------------- internals

    def _require_llm(self) -> LLM:
        if self._llm is None:
            raise ServiceUnavailableError("Utsav is not available right now.")
        return self._llm

    def _check_mode(self, actor: User, mode: str) -> None:
        feature = {"elder": "elder_mode", "recite": "recite_mode"}.get(mode)
        if feature and not self._features.enabled(feature, str(actor.id)):
            raise feature_off(feature)

    def _owned(self, actor: User, conversation_id: uuid.UUID) -> AIConversation:
        conversation = self._repo.get_conversation(conversation_id)
        # Someone else's conversation looks exactly like a missing one.
        if conversation is None or conversation.user_id != actor.id:
            raise NotFoundError("Conversation not found")
        self._access.member(conversation.household_id, actor.id)
        return conversation

    def _result_for(self, card: AIPendingCard, response: CardResponse) -> tuple[ToolResult, str]:
        if card.kind == "question":
            if response.answers is None:
                raise InvalidInputError("This card needs answers")
            cleaned = validate_answers(QuestionCard.model_validate(card.card), response.answers)
            return ToolResult({"answers": cleaned}), "answered"
        if response.decision is None:
            raise InvalidInputError("This card needs a decision")
        if response.decision == "decline":
            return ToolResult({"status": "declined_by_user"}), "declined"
        return ToolResult({}), "approved"  # replaced by the action's real result after claiming

    def _turn_events(
        self,
        actor: User,
        conversation: AIConversation,
        llm: LLM,
        run: Callable[..., Run],
        *,
        with_ctx: bool = False,
    ) -> Generator[Event, None, None]:
        slots = _turn_slots(self._settings.ai_max_concurrent_turns)
        if not slots.acquire(blocking=False):
            raise ServiceUnavailableError("Utsav is busy. Please try again in a moment.")
        try:
            outcome = yield from self._claimed_turn(actor, conversation, llm, run, with_ctx)
        finally:
            slots.release()
        yield {
            "type": "done",
            "turn": TurnRead(
                conversation_id=conversation.id,
                agent=outcome.agent,
                items=outcome.items,
                pending_card=outcome.pending,
            ),
        }

    def _claimed_turn(
        self, actor, conversation, llm, run, with_ctx
    ) -> Generator[Event, None, TurnOutcome]:
        stale_before = datetime.now(UTC) - STALE_TURN
        if not self._repo.claim_turn(conversation.id, stale_before):
            self._session.rollback()
            raise ConflictError("Utsav is still working on the previous message.")
        self._session.commit()
        yield {"type": "start", "conversation_id": conversation.id}
        try:
            history = [
                {"role": m.role, "content": m.content}
                for m in self._repo.list_messages(conversation.id)
                if m.role != "notice"
            ]
            ctx = ToolContext(
                session=self._session,
                actor=actor,
                household_id=conversation.household_id,
                agent=AGENTS.get(conversation.active_agent, AGENTS[ORCHESTRATOR]),
                # Live web search is the costly part of finding events; off, only the site
                # searches are offered.
                search=(
                    (lambda prompt, domains: llm.search(prompt=prompt, domains=domains))
                    if self._features.enabled("event_search", str(actor.id))
                    else None
                ),
            )
            orchestrator = Orchestrator(
                llm, self._settings, _Journal(self._session, self._repo, conversation), history, ctx
            )
            # Closing this generator early (the person left) ends here, and the finally below still
            # runs: the claim is released and nothing half-written is left behind.
            return (yield from (run(orchestrator, ctx) if with_ctx else run(orchestrator)))
        finally:
            self._session.rollback()
            self._repo.release_turn(conversation.id)
            self._session.commit()


def _attached(documents: list[AttachedDocument] | None) -> list[dict[str, str]]:
    return [{"name": d.name, "text": d.text} for d in documents or []]


def _finished(events: Iterator[Event]) -> TurnRead:
    """The final turn of an event stream that is being consumed without streaming."""
    for event in events:
        if event["type"] == "done":
            return event["turn"]
    raise RuntimeError("a turn ended without finishing")  # a bug, never a user error
