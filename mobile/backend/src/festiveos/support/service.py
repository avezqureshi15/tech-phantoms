import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from festiveos.core.errors import ServiceUnavailableError
from festiveos.core.log import logged_service
from festiveos.integrations.diya import DiyaClient
from festiveos.support.models import SupportCallback
from festiveos.support.repository import SupportRepository
from festiveos.support.schemas import CONSENT_VERSION, CallbackCreate
from festiveos.users.models import User

CATEGORY = "festiveos_support"  # the query category the support platform calls back on
TOPIC_LABELS = {
    "expense_dispute": "Expense dispute",
    "group_help": "Help with a group",
    "account_access": "Cannot get into the account",
    "app_problem": "A problem with the app",
    "other": "Something else",
}
STATUSES = {"created": "sent", "duplicate": "sent", "do_not_call": "do_not_call"}


@logged_service
class SupportService:
    def __init__(self, session: Session, diya: DiyaClient | None) -> None:
        self._session = session
        self._diya = diya
        self._repo = SupportRepository(session)

    def request_callback(self, actor: User, data: CallbackCreate) -> SupportCallback:
        """Ask the support platform to call this person back. The request is sent first and only
        recorded if it was accepted, so a failure leaves nothing behind (and no phone number)."""
        if self._diya is None:
            raise ServiceUnavailableError("Call-back support is not available right now.")

        request_id = uuid.uuid4()
        consented_at = datetime.now(UTC)
        summary = TOPIC_LABELS[data.topic] + (f": {data.note}" if data.note else "")
        answer = self._diya.create_support_request(
            {
                "requestId": str(request_id),
                "externalUserId": str(actor.id),
                "name": actor.name,
                "phone": data.phone,
                "preferredLang": data.language,
                "consent": {
                    "at": consented_at.isoformat(),
                    "source": "festiveos_app",
                    "version": CONSENT_VERSION,
                },
                "category": CATEGORY,
                "topic": data.topic,
                "issueSummary": summary,
            }
        )
        callback = self._repo.add(
            SupportCallback(
                id=request_id,
                user_id=actor.id,
                topic=data.topic,
                language=data.language,
                status=STATUSES.get(str(answer.get("status")), "sent"),
                remote_id=str(answer["queryId"])[:64] if answer.get("queryId") else None,
                consent_text_version=CONSENT_VERSION,
                consented_at=consented_at,
            )
        )
        self._session.commit()
        return callback
