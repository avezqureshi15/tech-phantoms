import uuid

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from festiveos.ai.models import AIConversation, AIMessage, AIPendingCard
from tests.support import API, auth, create_household, setup_household


def conversation(session: Session, user_id, household_id) -> AIConversation:
    row = AIConversation(household_id=household_id, user_id=user_id, title="t")
    session.add(row)
    session.flush()
    return row


def card(conversation_id, status: str = "open") -> AIPendingCard:
    return AIPendingCard(
        id=uuid.uuid4(),
        conversation_id=conversation_id,
        tool_use_id="toolu_1",
        kind="question",
        card={},
        payload={},
        status=status,
    )


def test_a_conversation_can_have_only_one_open_card(
    client, make_user, session_factory: sessionmaker[Session]
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    with session_factory() as session:
        row = conversation(session, dad.id, uuid.UUID(household_id))
        session.add_all([card(row.id, "answered"), card(row.id, "answered"), card(row.id)])
        session.commit()

        session.add(card(row.id))
        with pytest.raises(IntegrityError):
            session.commit()


def test_message_content_round_trips_with_its_key_order(
    client, make_user, session_factory: sessionmaker[Session]
) -> None:
    """The prompt cache matches bytes: replayed content must come back in the order it went in."""
    dad, _, household_id = setup_household(client, make_user)
    content = [
        {"type": "tool_use", "name": "x", "id": "toolu_1", "input": {"z": 1, "a": 2, "m": 3}}
    ]
    with session_factory() as session:
        row = conversation(session, dad.id, uuid.UUID(household_id))
        session.add(AIMessage(conversation_id=row.id, seq=0, role="assistant", content=content))
        session.commit()
        row_id = row.id

    with session_factory() as session:
        stored = session.query(AIMessage).filter_by(conversation_id=row_id).one()

        assert list(stored.content[0]) == ["type", "name", "id", "input"]
        assert list(stored.content[0]["input"]) == ["z", "a", "m"]


def test_deleting_a_household_removes_its_conversations(
    client, make_user, session_factory: sessionmaker[Session]
) -> None:
    dad = make_user("solo@example.com")  # only a household's sole member can delete it
    household_id = create_household(client, dad, "Solo")
    with session_factory() as session:
        row = conversation(session, dad.id, uuid.UUID(household_id))
        session.add(card(row.id))
        session.commit()
        row_id = row.id

    assert client.delete(f"{API}/households/{household_id}", headers=auth(dad)).status_code == 204

    with session_factory() as session:
        assert session.get(AIConversation, row_id) is None
        assert session.query(AIPendingCard).filter_by(conversation_id=row_id).count() == 0
