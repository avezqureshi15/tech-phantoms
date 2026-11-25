"""The five limbs (panchanga): tithi, vara, nakshatra, yoga and karana, with exact start and end
times. Each limb is an angle sweeping through equal slices; its boundaries are where the angle
hits a multiple of the slice size.
"""

from collections.abc import Callable
from dataclasses import dataclass

from festiveos.panchang import astro
from festiveos.panchang.astro import Time

TITHI_NAMES = (
    "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami",
    "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi",
)  # fmt: skip
NAKSHATRAS = (
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya",
    "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati",
    "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
    "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
)  # fmt: skip
YOGAS = (
    "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti",
    "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi", "Vyatipata",
    "Variyana", "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra",
    "Vaidhriti",
)  # fmt: skip
REPEATING_KARANAS = ("Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti")
VARAS = ("Ravivara", "Somavara", "Mangalavara", "Budhavara", "Guruvara", "Shukravara", "Shanivara")
WEEKDAYS = ("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
VISHTI = "Vishti"  # also called Bhadra: avoided for starting auspicious work

TITHI_SPAN = 12.0
KARANA_SPAN = 6.0
STAR_SPAN = 360 / 27
SEARCH_DAYS = 2.2  # no limb here is longer than about 1.3 days


@dataclass(frozen=True)
class Segment:
    index: int  # position in the limb's cycle, from 0
    start: Time
    end: Time


def tithi_name(index: int) -> str:
    """index 0..29: Shukla 1..15 then Krishna 1..15."""
    if index == 14:
        return "Purnima"
    if index == 29:
        return "Amavasya"
    return TITHI_NAMES[index % 15]


def paksha(index: int) -> str:
    return "Shukla" if index < 15 else "Krishna"


def karana_name(index: int) -> str:
    """index 0..59 within the lunar month."""
    if index == 0:
        return "Kimstughna"
    if index >= 57:
        return ("Shakuni", "Chatushpada", "Naga")[index - 57]
    return REPEATING_KARANAS[(index - 1) % 7]


def _yoga_angle(time: Time) -> float:
    return (astro.sidereal_sun(time) + astro.sidereal_moon(time)) % 360


@dataclass(frozen=True)
class Limb:
    angle: Callable[[Time], float]
    span: float
    count: int

    def index_at(self, time: Time) -> int:
        return int(self.angle(time) // self.span) % self.count

    def segment_at(self, time: Time) -> Segment:
        index = self.index_at(time)
        start_angle = (index * self.span) % 360
        end_angle = ((index + 1) * self.span) % 360
        start = astro.crossing(self.angle, start_angle, astro.add_days(time, -SEARCH_DAYS), time)
        end = astro.crossing(self.angle, end_angle, time, astro.add_days(time, SEARCH_DAYS))
        return Segment(index, start, end)

    def segments_between(self, begin: Time, finish: Time) -> list[Segment]:
        """Every segment overlapping [begin, finish], in order."""
        segment = self.segment_at(begin)
        found = [segment]
        while segment.end.ut < finish.ut:
            segment = self.segment_at(astro.add_days(segment.end, 1e-4))
            found.append(segment)
        return found


TITHI = Limb(astro.elongation, TITHI_SPAN, 30)
KARANA = Limb(astro.elongation, KARANA_SPAN, 60)
NAKSHATRA = Limb(astro.sidereal_moon, STAR_SPAN, 27)
YOGA = Limb(_yoga_angle, STAR_SPAN, 27)
