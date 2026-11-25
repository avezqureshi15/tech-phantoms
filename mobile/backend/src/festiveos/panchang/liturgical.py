"""The Western Christian liturgical season of a day. Orthodox churches keep a different calendar and
are not covered here."""

from dataclasses import dataclass
from datetime import date, timedelta

from festiveos.panchang import christian


@dataclass(frozen=True)
class Season:
    name: str
    colour: str  # the liturgical colour, as a word
    note: str


def season_of(day: date) -> Season:
    year = day.year
    easter = christian.western_easter(year)
    ash_wednesday, palm_sunday = easter - timedelta(days=46), easter - timedelta(days=7)
    pentecost = easter + timedelta(days=49)

    if christian.advent_sunday(year) <= day <= date(year, 12, 24):
        return Season("Advent", "violet", "Preparing for Christmas")
    if (day.month == 12 and day.day >= 25) or (day.month == 1 and day.day <= 6):
        return Season("Christmas", "white", "Celebrating the birth of Christ")
    if palm_sunday <= day < easter:
        return Season("Holy Week", "red", "The last week of Lent")
    if ash_wednesday <= day < palm_sunday:
        return Season("Lent", "violet", "Forty days of prayer and fasting")
    if easter <= day <= pentecost:
        return Season("Easter", "white", "Celebrating the Resurrection")
    return Season("Ordinary Time", "green", "The season of ordinary life and growth")
