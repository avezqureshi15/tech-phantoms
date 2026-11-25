"""Small enums shared by the engine and the API, kept apart so neither imports the other."""

from enum import StrEnum

from festiveos.core.faiths import Faith

__all__ = ["Faith", "Scheme"]


class Scheme(StrEnum):
    AMANTA = (
        "amanta"  # Maharashtra, Karnataka, Andhra, Telangana, Tamil Nadu: month ends at new moon
    )
    PURNIMANTA = "purnimanta"  # most of north India: month ends at full moon
