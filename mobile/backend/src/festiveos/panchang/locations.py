"""Places the panchang can be computed for. Sunrise decides the day, so a place is required."""

import math
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from festiveos.core.errors import InvalidInputError
from festiveos.panchang.astro import Place

IST = "Asia/Kolkata"
_CITIES = (
    ("delhi", "New Delhi", 28.6139, 77.2090, "north"),
    ("mumbai", "Mumbai", 19.0760, 72.8777, "marathi"),
    ("kolkata", "Kolkata", 22.5726, 88.3639, "bengali"),
    ("chennai", "Chennai", 13.0827, 80.2707, "tamil"),
    ("bengaluru", "Bengaluru", 12.9716, 77.5946, "kannada"),
    ("hyderabad", "Hyderabad", 17.3850, 78.4867, "telugu"),
    ("ahmedabad", "Ahmedabad", 23.0225, 72.5714, "gujarati"),
    ("pune", "Pune", 18.5204, 73.8567, "marathi"),
    ("jaipur", "Jaipur", 26.9124, 75.7873, "north"),
    ("lucknow", "Lucknow", 26.8467, 80.9462, "north"),
    ("varanasi", "Varanasi", 25.3176, 82.9739, "north"),
    ("ujjain", "Ujjain", 23.1765, 75.7885, "north"),
    ("kochi", "Kochi", 9.9312, 76.2673, "malayalam"),
    ("thiruvananthapuram", "Thiruvananthapuram", 8.5241, 76.9366, "malayalam"),
    ("bhubaneswar", "Bhubaneswar", 20.2961, 85.8245, "north"),
    ("guwahati", "Guwahati", 26.1445, 91.7362, "north"),
    ("patna", "Patna", 25.5941, 85.1376, "north"),
    ("chandigarh", "Chandigarh", 30.7333, 76.7794, "north"),
    ("amritsar", "Amritsar", 31.6340, 74.8723, "north"),
    ("bhopal", "Bhopal", 23.2599, 77.4126, "north"),
    ("nagpur", "Nagpur", 21.1458, 79.0882, "marathi"),
    ("visakhapatnam", "Visakhapatnam", 17.6868, 83.2185, "telugu"),
    ("coimbatore", "Coimbatore", 11.0168, 76.9558, "tamil"),
    ("madurai", "Madurai", 9.9252, 78.1198, "tamil"),
    ("mysuru", "Mysuru", 12.2958, 76.6394, "kannada"),
    ("surat", "Surat", 21.1702, 72.8311, "gujarati"),
    ("indore", "Indore", 22.7196, 75.8577, "north"),
    ("ranchi", "Ranchi", 23.3441, 85.3096, "north"),
    ("dehradun", "Dehradun", 30.3165, 78.0322, "north"),
    ("srinagar", "Srinagar", 34.0837, 74.7973, "north"),
    ("panaji", "Panaji", 15.4909, 73.8278, "marathi"),
)
CITIES: dict[str, Place] = {
    key: Place(key, name, latitude, longitude, IST) for key, name, latitude, longitude, _ in _CITIES
}
REGIONS: dict[str, str] = {key: region for key, _, _, _, region in _CITIES}
DEFAULT_CITY = "delhi"


def custom_place(latitude: float, longitude: float, timezone: str = IST) -> Place:
    """A place given by coordinates, for anywhere not in the city list (including abroad)."""
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise InvalidInputError("latitude must be -90..90 and longitude -180..180")
    try:
        ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
        raise InvalidInputError("Unknown timezone") from exc
    return Place("custom", f"{latitude:.3f}, {longitude:.3f}", latitude, longitude, timezone)


def resolve(
    city: str | None, latitude: float | None, longitude: float | None, timezone: str | None
) -> Place:
    if latitude is not None or longitude is not None:
        if latitude is None or longitude is None:
            raise InvalidInputError("give both latitude and longitude")
        return custom_place(latitude, longitude, timezone or IST)
    key = (city or DEFAULT_CITY).strip().lower()
    place = CITIES.get(key)
    if place is None:
        raise InvalidInputError(
            f"Unknown city '{key}'. Use one of the listed cities or coordinates."
        )
    return place


EARTH_RADIUS_KM = 6371.0
MAX_REGION_DISTANCE_KM = (
    1500  # farther from every listed city than this, no regional naming applies
)


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def nearest(latitude: float, longitude: float) -> tuple[Place, float]:
    """The listed city closest to a point, and how far away it is. Used only to pick regional
    wording and a default; the coordinates themselves are never stored."""
    best = min(
        CITIES.values(), key=lambda c: distance_km(latitude, longitude, c.latitude, c.longitude)
    )
    return best, distance_km(latitude, longitude, best.latitude, best.longitude)


def region_of(
    place: Place, latitude: float | None = None, longitude: float | None = None
) -> str | None:
    """The regional naming to use for a place, or None when it is nowhere near a listed city."""
    if place.key in REGIONS:
        return REGIONS[place.key]
    if latitude is None or longitude is None:
        return None
    city, km = nearest(latitude, longitude)
    return REGIONS[city.key] if km <= MAX_REGION_DISTANCE_KM else None
