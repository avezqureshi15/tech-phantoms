import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from festiveos.users.models import User


class UserRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, user_id: uuid.UUID) -> User | None:
        return self._session.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        return self._session.scalar(select(User).where(User.email == email))

    def get_by_google_sub(self, sub: str) -> User | None:
        return self._session.scalar(select(User).where(User.google_sub == sub))

    def add(self, user: User) -> User:
        self._session.add(user)
        self._session.flush()
        return user

    def delete(self, user_id: uuid.UUID) -> None:
        # The database cascades to memberships, sessions and tokens, and nulls creator links.
        self._session.execute(
            delete(User).where(User.id == user_id).execution_options(synchronize_session=False)
        )
