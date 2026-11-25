from datetime import UTC, datetime

from sqlalchemy.orm import Session

from festiveos.accounts.schemas import ProfileUpdate
from festiveos.auth.repository import AuthRepository
from festiveos.core.errors import ConflictError
from festiveos.core.log import logged_service
from festiveos.households.repository import HouseholdRepository
from festiveos.users.models import User
from festiveos.users.repository import UserRepository


@logged_service
class AccountService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._households = HouseholdRepository(session)
        self._users = UserRepository(session)
        self._auth = AuthRepository(session)

    def update_profile(self, actor: User, data: ProfileUpdate) -> User:
        changes = data.model_dump(exclude_unset=True)
        if "faiths" in changes and changes["faiths"] is not None:
            actor.faiths = [faith.value for faith in changes["faiths"]]
            actor.faith_chosen_at = datetime.now(UTC)
        if "home_city" in changes:
            actor.home_city = changes["home_city"]
        self._session.commit()
        return actor

    def delete(self, actor: User) -> None:
        """Permanently delete the actor's account, atomically.

        * Households where they are the only member go with them.
        * Elsewhere they are simply removed from the household.
        * If they are the only admin of a household that has other members, nothing is
          deleted until they hand over (promote someone, or remove the others).
        * Things they created stay with the family; the creator link becomes empty.
        """
        household_ids = self._households.member_household_ids(actor.id)
        for household_id in household_ids:  # sorted: concurrent deletions cannot deadlock
            self._households.lock(household_id)

        for household_id in household_ids:
            member = self._households.get_member_for_update(household_id, actor.id)
            if member is None:  # removed by an admin while we were waiting for the lock
                continue

            if self._households.count_members(household_id) == 1:
                self._households.delete(household_id)
                continue

            if member.role == "admin" and self._households.count_admins(household_id) <= 1:
                household = self._households.get(household_id)
                name = household.name if household else "a household"
                self._session.rollback()
                raise ConflictError(
                    f"You are the only admin of '{name}'. Make someone else an admin, or "
                    "remove the other members, before deleting your account."
                )
            self._households.delete_member(member)

        # Sessions go before the user row, in the same session-then-tokens order as logout and
        # refresh. Leaving it to the user's cascade would let Postgres pick an order of its own.
        self._auth.delete_sessions_for_user(actor.id)
        self._users.delete(actor.id)
        self._session.commit()
