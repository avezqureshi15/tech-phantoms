import uuid

from sqlalchemy.orm import Session

from festiveos.core.errors import NotFoundError
from festiveos.core.log import logged_service
from festiveos.households.access import HouseholdAccess
from festiveos.households.repository import HouseholdRepository
from festiveos.inventory.models import InventoryItem
from festiveos.inventory.repository import InventoryRepository
from festiveos.inventory.schemas import InventoryItemCreate, InventoryItemUpdate
from festiveos.users.models import User


@logged_service
class InventoryService:
    """Any household member can read and maintain the belongings list, not only the admin: the
    person who knows how many chairs there are is often not the one who administers the app."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._items = InventoryRepository(session)
        self._access = HouseholdAccess(HouseholdRepository(session))

    def create(
        self, actor: User, household_id: uuid.UUID, data: InventoryItemCreate
    ) -> InventoryItem:
        self._access.member(household_id, actor.id)
        item = self._items.add(InventoryItem(household_id=household_id, **data.model_dump()))
        self._session.commit()
        return item

    def list_for_household(
        self, actor: User, household_id: uuid.UUID, category: str | None, limit: int, offset: int
    ) -> list[InventoryItem]:
        self._access.member(household_id, actor.id)
        return self._items.list_for_household(household_id, category, limit, offset)

    def totals(self, actor: User, household_id: uuid.UUID) -> dict[str, int]:
        self._access.member(household_id, actor.id)
        return self._items.totals_by_category(household_id)

    def update(self, actor: User, item_id: uuid.UUID, data: InventoryItemUpdate) -> InventoryItem:
        item = self._get_for_member(actor, item_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(item, field, value)
        self._session.commit()
        return item

    def delete(self, actor: User, item_id: uuid.UUID) -> None:
        self._items.delete(self._get_for_member(actor, item_id))
        self._session.commit()

    def _get_for_member(self, actor: User, item_id: uuid.UUID) -> InventoryItem:
        item = self._items.get(item_id)
        if item is None:
            raise NotFoundError("Inventory item not found")
        self._access.member(item.household_id, actor.id)
        return item
