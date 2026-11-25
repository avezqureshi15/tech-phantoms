import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, computed_field


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    avatar_url: str | None


class UserRead(UserSummary):
    email: str
    phone: str | None
    faiths: list[str]
    home_city: str | None
    faith_chosen_at: datetime | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def faith_chosen(self) -> bool:
        """False until the person has answered the faith question (the app then asks it)."""
        return self.faith_chosen_at is not None
