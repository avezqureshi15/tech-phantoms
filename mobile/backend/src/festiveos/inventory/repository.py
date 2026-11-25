import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from festiveos.inventory.models import InventoryItem


class InventoryRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, item_id: uuid.UUID) -> InventoryItem | None:
        return self._session.get(InventoryItem, item_id)

    def list_for_household(
        self, household_id: uuid.UUID, category: str | None, limit: int, offset: int
    ) -> list[InventoryItem]:
        stmt = select(InventoryItem).where(InventoryItem.household_id == household_id)
        if category is not None:
            stmt = stmt.where(InventoryItem.category == category)
        stmt = stmt.order_by(InventoryItem.category, InventoryItem.name, InventoryItem.id)
        return list(self._session.scalars(stmt.limit(limit).offset(offset)))

    def totals_by_category(self, household_id: uuid.UUID) -> dict[str, int]:
        """Units owned per category, in one aggregate query."""
        stmt = (
            select(InventoryItem.category, func.sum(InventoryItem.quantity))
            .where(InventoryItem.household_id == household_id)
            .group_by(InventoryItem.category)
        )
        return {category: int(total) for category, total in self._session.execute(stmt)}

    def add(self, item: InventoryItem) -> InventoryItem:
        self._session.add(item)
        self._session.flush()
        return item

    def delete(self, item: InventoryItem) -> None:
        self._session.delete(item)
        self._session.flush()
