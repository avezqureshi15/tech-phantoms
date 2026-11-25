import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from festiveos.ai.models import AIConversation, AIMessage, AIPendingCard


class AIRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    # conversations
    def add_conversation(self, conversation: AIConversation) -> AIConversation:
        self._session.add(conversation)
        self._session.flush()
        return conversation

    def get_conversation(self, conversation_id: uuid.UUID) -> AIConversation | None:
        return self._session.get(AIConversation, conversation_id)

    def list_conversations(
        self, user_id: uuid.UUID, household_id: uuid.UUID, limit: int, offset: int
    ) -> list[AIConversation]:
        stmt = (
            select(AIConversation)
            .where(AIConversation.user_id == user_id, AIConversation.household_id == household_id)
            .order_by(AIConversation.updated_at.desc(), AIConversation.id)
            .limit(limit)
            .offset(offset)
        )
        return list(self._session.scalars(stmt))

    def delete_conversation(self, conversation: AIConversation) -> None:
        self._session.delete(conversation)
        self._session.flush()

    def claim_turn(self, conversation_id: uuid.UUID, stale_before: datetime) -> bool:
        """Atomically take the conversation for one turn. False if another turn holds it."""
        result = self._session.execute(
            update(AIConversation)
            .where(
                AIConversation.id == conversation_id,
                (AIConversation.turn_started_at.is_(None))
                | (AIConversation.turn_started_at < stale_before),
            )
            .values(turn_started_at=datetime.now(UTC))
            .execution_options(synchronize_session=False)
        )
        return result.rowcount == 1

    def release_turn(self, conversation_id: uuid.UUID) -> None:
        self._session.execute(
            update(AIConversation)
            .where(AIConversation.id == conversation_id)
            .values(turn_started_at=None)
            .execution_options(synchronize_session=False)
        )

    def set_agent(self, conversation_id: uuid.UUID, agent: str) -> None:
        self._session.execute(
            update(AIConversation)
            .where(AIConversation.id == conversation_id)
            .values(active_agent=agent)
            .execution_options(synchronize_session=False)
        )

    # messages
    def add_message(
        self, conversation: AIConversation, role: str, content: Any, ui: Any | None
    ) -> AIMessage:
        message = AIMessage(
            conversation_id=conversation.id,
            seq=conversation.message_count,
            role=role,
            content=content,
            ui=ui,
        )
        conversation.message_count += 1
        self._session.add(message)
        self._session.flush()
        return message

    def list_messages(self, conversation_id: uuid.UUID) -> list[AIMessage]:
        stmt = (
            select(AIMessage)
            .where(AIMessage.conversation_id == conversation_id)
            .order_by(AIMessage.seq)
        )
        return list(self._session.scalars(stmt))

    # cards
    def add_card(self, card: AIPendingCard) -> AIPendingCard:
        self._session.add(card)
        self._session.flush()
        return card

    def get_card(self, card_id: uuid.UUID) -> AIPendingCard | None:
        return self._session.get(AIPendingCard, card_id)

    def get_open_card(self, conversation_id: uuid.UUID) -> AIPendingCard | None:
        stmt = select(AIPendingCard).where(
            AIPendingCard.conversation_id == conversation_id, AIPendingCard.status == "open"
        )
        return self._session.scalar(stmt)

    def resolve_card(self, card_id: uuid.UUID, status: str) -> bool:
        """Close an open card. False if it was no longer open (someone answered first)."""
        result = self._session.execute(
            update(AIPendingCard)
            .where(AIPendingCard.id == card_id, AIPendingCard.status == "open")
            .values(status=status, resolved_at=datetime.now(UTC))
            .execution_options(synchronize_session=False)
        )
        return result.rowcount == 1
