"""What people in each region call the parts of a panchang.

The same limb or period has different everyday names across India; showing "Rahukaal" to a Tamil
speaker or "Kuligai" to someone from Lucknow is wrong in both directions. Labels are chosen by the
region of the person's place. These are best-effort, from common usage, and should be reviewed by
native speakers; an unknown region gets the neutral English names.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Terms:
    tithi: str = "Tithi"
    nakshatra: str = "Nakshatra"
    yoga: str = "Yoga"
    karana: str = "Karana"
    rahu_kalam: str = "Rahu Kalam"
    yamaganda: str = "Yamaganda"
    gulika: str = "Gulika"
    abhijit: str = "Abhijit Muhurta"
    brahma: str = "Brahma Muhurta"


NEUTRAL = Terms()
TERMS: dict[str, Terms] = {
    "north": Terms(
        yoga="Yog",
        karana="Karan",
        rahu_kalam="Rahukaal",
        yamaganda="Yamghant",
        gulika="Gulik Kaal",
        abhijit="Abhijit Muhurat",
        brahma="Brahma Muhurat",
    ),
    "marathi": Terms(
        rahu_kalam="Rahu Kaal",
        yamaganda="Yamghant",
        gulika="Gulik Kaal",
        abhijit="Abhijit Muhurat",
        brahma="Brahma Muhurat",
    ),
    "gujarati": Terms(
        rahu_kalam="Rahu Kaal",
        yamaganda="Yamghant",
        gulika="Gulik Kaal",
        abhijit="Abhijit Muhurat",
        brahma="Brahma Muhurat",
    ),
    "bengali": Terms(rahu_kalam="Rahu Kal", yamaganda="Yamaganda", gulika="Gulika"),
    "tamil": Terms(
        tithi="Thithi",
        nakshatra="Natchathiram",
        yoga="Yogam",
        karana="Karanam",
        rahu_kalam="Rahu Kaalam",
        yamaganda="Yamagandam",
        gulika="Kuligai",
        abhijit="Abhijit Muhurtham",
        brahma="Brahma Muhurtham",
    ),
    "telugu": Terms(
        nakshatra="Nakshatram",
        yoga="Yogam",
        karana="Karanam",
        rahu_kalam="Rahu Kalam",
        yamaganda="Yamagandam",
        gulika="Gulika Kalam",
        abhijit="Abhijit Muhurtham",
        brahma="Brahma Muhurtham",
    ),
    "kannada": Terms(rahu_kalam="Rahu Kala", yamaganda="Yamaganda Kala", gulika="Gulika Kala"),
    "malayalam": Terms(
        tithi="Thithi",
        nakshatra="Nakshathram",
        rahu_kalam="Rahu Kalam",
        yamaganda="Yamagandam",
        gulika="Gulika Kalam",
        abhijit="Abhijit Muhurtham",
        brahma="Brahma Muhurtham",
    ),
}


def terms_for(region: str | None) -> Terms:
    return TERMS.get(region or "", NEUTRAL)
