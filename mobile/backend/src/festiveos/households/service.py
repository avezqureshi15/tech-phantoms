import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from festiveos.core.errors import ConflictError, ForbiddenError, NotFoundError
from festiveos.core.log import logged_service
from festiveos.households.access import HouseholdAccess
from festiveos.households.models import Household, HouseholdMember
from festiveos.households.repository import HouseholdRepository
from festiveos.households.schemas import (
    HouseholdCreate,
    HouseholdUpdate,
    MemberCreate,
    MemberRole,
    MemberUpdate,
)
from festiveos.users.models import User
from festiveos.users.repository import UserRepository


@logged_service
class HouseholdService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._households = HouseholdRepository(session)
        self._users = UserRepository(session)
        self._access = HouseholdAccess(self._households)

    def create(self, actor: User, data: HouseholdCreate) -> Household:
        household = self._households.add(Household(created_by=actor.id, **data.model_dump()))
        self._households.add_member(
            HouseholdMember(household_id=household.id, user=actor, role=MemberRole.ADMIN)
        )
        self._session.commit()
        return household

    def update(self, actor: User, household_id: uuid.UUID, data: HouseholdUpdate) -> Household:
        self._access.admin(household_id, actor.id)
        household = self._households.get(household_id)
        if household is None:
            raise NotFoundError("Household not found")
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(household, field, value)
        self._session.commit()
        return household

    def list_mine(self, actor: User) -> list[Household]:
        return self._households.list_for_user(actor.id)

    def get_detail(self, actor: User, household_id: uuid.UUID) -> Household:
        self._access.member(household_id, actor.id)
        household = self._households.get_with_members(household_id)
        if household is None:
            raise NotFoundError("Household not found")
        return household

    def add_member(
        self, actor: User, household_id: uuid.UUID, data: MemberCreate
    ) -> HouseholdMember:
        self._access.admin(household_id, actor.id)

        user = self._users.get_by_email(data.email.strip().lower())
        if user is None:
            raise NotFoundError("No user with that email has signed in yet")
        if self._households.get_member(household_id, user.id):
            raise ConflictError("User is already a member of this household")

        try:
            member = self._households.add_member(
                HouseholdMember(
                    household_id=household_id,
                    user=user,
                    relationship=data.relationship,
                    role=data.role,
                    notification_preference=data.notification_preference,
                )
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("User is already a member of this household") from exc
        return member

    def update_member(
        self,
        actor: User,
        household_id: uuid.UUID,
        user_id: uuid.UUID,
        data: MemberUpdate,
    ) -> HouseholdMember:
        actor_member, target = self._lock_actor_and_target(household_id, actor.id, user_id)
        changes = data.model_dump(exclude_unset=True)

        is_admin = actor_member.role == "admin"
        if (actor.id != user_id or "role" in changes) and not is_admin:
            raise ForbiddenError("Admin role required")
        if target is None:
            raise NotFoundError("Member not found")

        if changes.get("role") == "member" and target.role == "admin":
            self._require_another_admin(household_id)

        for field, value in changes.items():
            setattr(target, field, value)
        self._session.commit()
        return target

    def remove_member(self, actor: User, household_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """An admin removes a member, or any member leaves (user_id is the actor)."""
        actor_member, target = self._lock_actor_and_target(household_id, actor.id, user_id)

        if actor.id != user_id and actor_member.role != "admin":
            raise ForbiddenError("Admin role required")
        if target is None:
            raise NotFoundError("Member not found")

        if target.role == "admin":
            self._require_another_admin(household_id)

        self._households.delete_member(target)
        self._session.commit()

    def delete(self, actor: User, household_id: uuid.UUID) -> None:
        """Delete a household and everything in it; only its sole remaining member may."""
        actor_member, _ = self._lock_actor_and_target(household_id, actor.id, actor.id)

        if actor_member.role != "admin":
            raise ForbiddenError("Admin role required")
        if self._households.count_members(household_id) > 1:
            raise ConflictError(
                "Other members are still in this household. Remove them or ask them to leave first."
            )

        self._households.delete(household_id)
        self._session.commit()

    def _lock_actor_and_target(
        self, household_id: uuid.UUID, actor_id: uuid.UUID, target_id: uuid.UUID
    ) -> tuple[HouseholdMember, HouseholdMember | None]:
        # Cheap rejection of outsiders before taking the lock.
        self._access.member(household_id, actor_id)
        self._households.lock(household_id)

        # Re-read under the lock: the actor may have been demoted or removed while
        # waiting, and permissions must reflect the committed state.
        actor_member = self._households.get_member_for_update(household_id, actor_id)
        if actor_member is None:
            raise NotFoundError("Household not found")
        if target_id == actor_id:
            return actor_member, actor_member
        return actor_member, self._households.get_member_for_update(household_id, target_id)

    def _require_another_admin(self, household_id: uuid.UUID) -> None:
        if self._households.count_admins(household_id) <= 1:
            raise ConflictError(
                "A household needs at least one admin. Make someone else an admin first."
            )
