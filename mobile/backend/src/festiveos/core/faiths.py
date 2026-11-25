"""The faiths the app knows about. A household lists the ones its members follow."""

from enum import StrEnum


class Faith(StrEnum):
    HINDU = "hindu"
    BUDDHIST = "buddhist"
    JAIN = "jain"
    SIKH = "sikh"
    CHRISTIAN = "christian"
    MUSLIM = "muslim"
    PARSI = "parsi"
