import uuid

from festiveos.core.errors import ForbiddenError, NotFoundError
from festiveos.households.models import HouseholdMember
from festiveos.households.repository import HouseholdRepository


class HouseholdAccess:
    """Membership checks shared by every household-scoped service."""

    def __init__(self, households: HouseholdRepository) -> None:
        self._households = households

    def member(self, household_id: uuid.UUID, user_id: uuid.UUID) -> HouseholdMember:
        # Non-members get 404, so household ids can't be probed for existence.
        member = self._households.get_member(household_id, user_id)
        if member is None:
            raise NotFoundError("Household not found")
        return member

    def admin(self, household_id: uuid.UUID, user_id: uuid.UUID) -> HouseholdMember:
        member = self.member(household_id, user_id)
        if member.role != "admin":
            raise ForbiddenError("Admin role required")
        return member
