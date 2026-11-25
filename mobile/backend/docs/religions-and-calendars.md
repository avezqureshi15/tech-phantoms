# Multiple religions and calendars (requirement note and design)

Status: **built for Hindu, Buddhist, Jain, Sikh, Christian and Muslim observances.** Parsi and several
regional rules are not (see *What is not done*).

## The requirement

India's households follow many faiths, and often more than one under one roof. FestiveOS must:

* serve **Hindus with a proper panchang** (not just a list of festival names), and
* serve **every other faith with its own calendar and its own observances**, not a Hindu calendar
  with other festivals bolted on.

## What is built

Code: `src/festiveos/panchang/`. API under `/api/v1/panchang/` (login required, normal read limit).

| Part | What it does |
|---|---|
| `astro.py` | Sun and Moon from `astronomy-engine` (MIT, pure Python), Lahiri ayanamsa, sunrise and sunset for a place |
| `elements.py` | The five limbs with exact start and end times: tithi, vara, nakshatra, yoga, karana (Vishti/Bhadra included) |
| `lunar.py` | Amanta and purnimanta month names, **adhika (leap) months**, Vikram and Shaka years |
| `daily.py` | A day's panchang: limbs, month, era, sun and moon times, Rahu Kalam, Yamaganda, Gulika, Abhijit and Brahma muhurta |
| `festivals.py` | Festival dates from rules: a month, a tithi, and the time of day it must prevail (sunrise, midday, evening, midnight). Solar sankrantis. Vishti avoidance for Holika Dahan and Raksha Bandhan |
| `christian.py` | Western and Orthodox Easter (the computus) and the dates that hang off it, Advent, Christmas |
| `islamic.py` | Expected Hijri dates from the Odeh crescent-visibility criterion at the person's place |
| `catalog.py` | All of the above merged, filterable by faith |
| `locations.py` | 31 Indian cities, or any coordinates and timezone |

Households record the faiths they follow (`faiths`, empty means everything) and a `panchang_city`. The app has
a Panchang tab with the day's panchang, a place picker, upcoming observances for the group's faiths, and
admin controls for faiths and the default city. Festival types are widened beyond the original twelve.

### The Today page is faith-aware

`GET /panchang/today` returns only the blocks that suit the person (their own `faiths`, set at sign-up):

| Faith | Shown |
|---|---|
| Hindu | the full panchang **and** the timings: Rahu Kalam, Yamaganda, Gulika, Abhijit and Brahma muhurta |
| Jain, Buddhist, Sikh | the lunar day (tithi, month, era), **without** the astrological timings |
| Muslim | the Hijri date (always flagged *expected*) and prayer times |
| Christian | the Western liturgical season (Advent, Christmas, Lent, Holy Week, Easter, Ordinary Time) |
| Parsi, or "prefer not to say" | sunrise, sunset and the Moon, plus upcoming dates |

Several faiths show the union. Everyone gets the Sun and Moon and the upcoming dates of their own faiths.
Rahu Kalam and the other timings are never sent to a person who does not follow Hindu astrology.

* **Prayer times** (`prayer.py`): computed from the Sun. Fajr and Isha use a method's twilight angle (default
  Karachi, 18 degrees; also MWL and ISNA); Asr uses the Hanafi shadow factor by default (the usual choice in India)
  or Shafi. Maghrib is sunset; Dhuhr is a minute past solar noon. The masjid's own timetable wins where they differ.
* **Regional names** (`terms.py`): "Rahukaal" in the north, "Rahu Kaalam" and "Kuligai" in Tamil Nadu, "Rahu Kala" in
  Karnataka, and so on, chosen from the person's place. A place more than 1,500 km from every listed city gets the
  neutral English names. These labels are best-effort from common usage and **need review by native speakers**.
* **Location**: the app asks for the position once, in the foreground, at city-level accuracy, rounds it to about a
  kilometre and keeps it on the phone. The server uses coordinates to answer one request (the page, or
  `/panchang/nearest`) and never stores them; only a chosen city key is saved (`users.home_city`).

### How accurate, and how that was checked

* **Tithi times** match Drik Panchang to the minute (Amavasya for New Delhi, 8 to 9 Nov 2026: published 11:27 to 12:31,
  computed 11:28 to 12:31). The astronomy is about one arcminute, roughly two minutes of tithi time.
* **Festival dates** are tested against dates published by Drik Panchang and Indian news calendars for 2024 to 2027
  (Holi, Holika Dahan, Maha Shivaratri, Rama Navami, Ganesh Chaturthi, Dussehra, Diwali, Raksha Bandhan).
  Holika Dahan 2025 initially came out a day late; the cause was the Bhadra rule, fixed by giving Dahan an
  evening-to-midnight window. Every expected date in `tests/panchang/` was confirmed against a source, not computed.
* **Easter** matches the standard tables for 2023 to 2027, Western and Orthodox.
* **Islamic dates** match what India's central moon-sighting committee declared for Ramadan and Eid al-Fitr in 2024 and
  2025 in Delhi, Mumbai and Chennai. They remain *expected* dates: Kerala and Kashmir sometimes follow Saudi
  sighting a day earlier.
* A day on which the Sun does not rise (polar places) is refused, not guessed.

### What is not done

* **Parsi** calendars (Shahenshahi, Kadmi, Fasli): the New Year does not follow a simple rule; it needs a verified table.
* **Sect and region rules**: Janmashtami (Smarta and Vaishnava days differ), Karva Chauth and Sankashti (moonrise),
  Onam (nakshatra in the Malayalam month), Chhath, Ekadashi variants, Gujarat's Kartikadi new year, the regional
  solar calendars (Tamil, Malayalam, Bengali, Odia) as months, and the 60-year samvatsara names (north and south
  disagree, so none are shown).
* **Per-person faiths**: faiths are recorded per group today.
* **Utsav** does not yet have a `get_panchang` tool, so it cannot answer panchang questions or plan around fasting days.
* Sikh festivals that follow the Nanakshahi fixed calendar (for example Guru Gobind Singh Jayanti) are not included.
* Jain Paryushan, Hola Mohalla, Navroz and Buddhist festivals other than Buddha Purnima.
* Other-faith art: the mandala is a generic Indian ornament; no faith-specific motifs yet.

## Calendars to support

Each faith needs its own calendar engine, not a conversion from Gregorian.

| Faith | Calendar | What decides a date |
|---|---|---|
| Hindu | Lunisolar panchang (amanta in the south and west, purnimanta in the north); regional **solar** calendars for Tamil, Malayalam, Bengali and Odia; Vikram and Shaka eras | Moon and Sun positions at a **place**: a festival falls on a tithi prevailing at a stated time of day (sunrise, pradosh, madhyahna, nishita), by per-festival rules |
| Muslim | Hijri (lunar) | **Moon sighting**, which differs by a day between regions. Astronomy gives an expected date only |
| Sikh | Nanakshahi (SGPC) plus lunar (Bikrami) dates for many gurpurabs | Mixed: some fixed solar dates, some lunar. The SGPC has revised its rules before, so verify the current ones |
| Christian | Gregorian; Easter by the computus (Western) or the Julian reckoning (Orthodox) | Deterministic. Regional feasts (Kerala Syrian, Goan) are extra catalogue entries |
| Jain | Lunisolar (Vikram Samvat) | Differs between Svetambara and Digambara (for example Paryushan against Das Lakshana) |
| Buddhist | Lunar; traditions differ (Theravada, Mahayana, Tibetan Losar) | Per tradition |
| Parsi | Shahenshahi, Kadmi and Fasli | Three calendars give different New Year dates; Indian Parsis mostly follow Shahenshahi |
| Others later | Bene Israel Jewish, Baha'i, tribal faiths (for example Sarhul) | Per community, with a community adviser |

## The Hindu panchang

The five limbs, all derived from the Sun's and Moon's sidereal longitudes (Lahiri ayanamsa, the
Indian government standard):

* **Tithi**: each 12 degrees of Moon-minus-Sun elongation; 30 tithis in two pakshas (shukla and krishna).
* **Vara**: weekday, which begins at local sunrise.
* **Nakshatra**: each 13 degrees 20 minutes of the Moon's sidereal longitude; 27 of them.
* **Yoga**: (Sun plus Moon longitude) in 13 degrees 20 minutes steps; 27 of them.
* **Karana**: half a tithi; 11 karanas (7 repeating, 4 fixed).

Also needed: masa (with the amanta or purnimanta choice), samvatsara and samvat year,
sunrise/sunset/moonrise for the household's location, and daily timings (Rahu Kaal, Abhijit
muhurta, Choghadiya). Festival dates come from per-festival rules over those values, for example
Diwali is the Amavasya at pradosh in Ashwin (amanta) which is Kartik (purnimanta).

**Everything is location dependent.** Sunrise decides the vara and which tithi "counts", so the same
festival can fall on different dates in Delhi and Chennai. A household therefore needs a real
location (latitude, longitude, timezone), which is already partly there (`Household.timezone`,
`location`).

## Design

1. **Catalogue, not an enum.** A `festival_catalog` of observances: code, religion, names per
   language, calendar system, and a rule (data, not code, where possible). Festivals reference a
   catalogue code. Custom family festivals stay free-form.
2. **Religion belongs to the person and the observance, not the household.** A mixed household keeps
   one group; each member can mark the faiths they follow, and the Home screen shows the union
   (filterable). Region and sampradaya (for example amanta/purnimanta, Svetambara/Digambara) are
   preferences too.
3. **Compute, never type in.** An astronomical engine produces the values; a cache table
   (`observance_dates`: code, year, location key, dates, engine version) stores results so the app is
   not recomputing per request. Candidate engines: Swiss Ephemeris (**check its licence**: it is
   dual-licensed AGPL or commercial, which may not suit a closed product) or a JPL-based library
   such as Skyfield (permissive). Decide before writing code.
4. **Accuracy policy.** Values carry their source and ayanamsa. Hijri dates are shown as *expected*,
   with a per-household +/-1 day adjustment for local sighting. Golden tests use dates **a human has
   checked against an authoritative published panchang**; the model and I must never invent a date.
5. **API.** Read-only and cheap to cache: `GET /panchang?date=&lat=&lon=&tradition=`,
   a month view, and `GET /calendar/observances?from=&to=&religions=`. Normal `read` rate limit.
6. **Utsav.** Add a `get_panchang` tool so the assistant reads values instead of guessing. The base
   prompt becomes faith-neutral. Household context carries the faiths and diet: Jain (no root
   vegetables), Navratri and Ekadashi fasting food, Eid menus, Parsi dhansak, and so on. Hosting
   quantities stay in code; dietary rules become data.
7. **Art and wording.** The new mandala is a generic Indian ornament. Other faiths get their own
   neutral geometric motifs (for example Islamic girih-style geometry). **Do not use sacred symbols
   decoratively** (Ik Onkar, Khanda, the cross, Om, calligraphy of God's names) without a community
   adviser's review. Copy says "group", "members" and "festival", not "family" and "Hindu festival".

## Phases (1 and 2 are done; 3 is partly done)

1. **Foundations**: faiths on member profiles, the catalogue table, a wider festival list, faith-neutral
   wording and prompts. No computation yet.
2. **Hindu panchang engine**: the five limbs, masa, sunrise/sunset, festival rules for the major
   festivals, location input, golden tests.
3. **Other calendars**: Hijri (expected dates plus adjustment), Easter and Christian feasts, Sikh,
   Jain, Buddhist, Parsi.
4. **Muhurta and extras**: Rahu Kaal, Choghadiya, Ekadashi and vrat reminders, eclipses, regional
   solar calendars, Utsav's dietary rules per faith.

## Open questions

* Which regions and traditions first? (Amanta or purnimanta, which solar calendars.)
* Accuracy bar: match a specific published panchang, or "within the tithi, location-correct"?
* Engine licence (see above), and whether to ship precomputed tables for offline use.
* Who is the authority for Hijri dates per region, and can a group admin override?
* Do we need a community adviser for each faith before shipping its content?

## Festival audio

`GET /audio?festival=&faith=` (`src/festiveos/audio/`). A curated catalogue of well-known devotional works per
festival; no audio is hosted. Each entry carries search links for YouTube, Spotify and JioSaavn, so it opens in the
person's own app and can never point at a removed upload. A performer is named only where one recording is so
closely tied to the piece that it improves the search. The order is editorial ("most familiar first"), not a
measured ranking, and the catalogue is the place to add or correct entries (a test checks every festival code is
real and every faith has music). Which tracks are "the best" is a human call: have a person from each tradition
review the list before launch.
