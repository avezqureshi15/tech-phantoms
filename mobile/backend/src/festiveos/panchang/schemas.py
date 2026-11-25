from datetime import date, datetime

from pydantic import BaseModel

from festiveos.panchang.kinds import Faith


class PlaceRead(BaseModel):
    key: str
    name: str
    latitude: float
    longitude: float
    timezone: str


class SpanRead(BaseModel):
    name: str
    start: datetime
    end: datetime
    number: int | None = None
    paksha: str | None = None


class PeriodRead(BaseModel):
    start: datetime
    end: datetime


class DayPanchangRead(BaseModel):
    date: date
    place: PlaceRead
    weekday: str
    vara: str
    sunrise: datetime
    sunset: datetime
    next_sunrise: datetime
    moonrise: datetime | None
    moonset: datetime | None
    tithis: list[SpanRead]
    nakshatras: list[SpanRead]
    yogas: list[SpanRead]
    karanas: list[SpanRead]
    month_amanta: str
    month_purnimanta: str
    paksha: str
    vikram_samvat: int
    shaka_year: int
    sun_sign: str
    moon_sign: str
    ayanamsa: float
    rahu_kalam: PeriodRead
    yamaganda: PeriodRead
    gulika: PeriodRead
    abhijit_muhurta: PeriodRead
    brahma_muhurta: PeriodRead


class ObservanceRead(BaseModel):
    code: str
    name: str
    faith: Faith
    date: date
    detail: str


class ObservanceList(BaseModel):
    year: int
    place: PlaceRead
    observances: list[ObservanceRead]


class TermsRead(BaseModel):
    """The names to show for this person's region."""

    tithi: str
    nakshatra: str
    yoga: str
    karana: str
    rahu_kalam: str
    yamaganda: str
    gulika: str
    abhijit: str
    brahma: str


class SunMoonRead(BaseModel):
    sunrise: datetime
    sunset: datetime
    moonrise: datetime | None
    moonset: datetime | None


class LunarRead(BaseModel):
    tithis: list[SpanRead]
    nakshatras: list[SpanRead]
    yogas: list[SpanRead]
    karanas: list[SpanRead]
    month_amanta: str
    month_purnimanta: str
    paksha: str
    vikram_samvat: int
    shaka_year: int
    sun_sign: str
    moon_sign: str


class TimingsRead(BaseModel):
    rahu_kalam: PeriodRead
    yamaganda: PeriodRead
    gulika: PeriodRead
    abhijit_muhurta: PeriodRead
    brahma_muhurta: PeriodRead


class HijriRead(BaseModel):
    day: int
    month: int
    month_name: str
    year: int
    expected: bool = True  # always: it depends on the moon being sighted


class PrayerRead(BaseModel):
    fajr: datetime | None
    sunrise: datetime
    dhuhr: datetime
    asr: datetime | None
    maghrib: datetime
    isha: datetime | None
    method: str
    school: str


class SeasonRead(BaseModel):
    name: str
    colour: str
    note: str


class TodayRead(BaseModel):
    """Only the blocks that suit the person's faiths are present; the rest are null."""

    date: date
    place: PlaceRead
    region: str | None
    faiths: list[str]
    terms: TermsRead
    sun_moon: SunMoonRead
    lunar: LunarRead | None
    timings: TimingsRead | None
    hijri: HijriRead | None
    prayers: PrayerRead | None
    season: SeasonRead | None
    upcoming: list[ObservanceRead]


class NearestRead(BaseModel):
    city: PlaceRead
    distance_km: float
    region: str | None
