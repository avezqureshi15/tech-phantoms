from sqlalchemy.orm import Session

from festiveos.support.models import SupportCallback


class SupportRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, callback: SupportCallback) -> SupportCallback:
        self._session.add(callback)
        self._session.flush()
        return callback
