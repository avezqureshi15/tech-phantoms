"""The tools the model can call.

Tool *definitions* are static: the same list for every agent, user and request, because the tool
list is the first thing in the cached prompt. Per-agent permissions are enforced here, at call
time. Every input is validated again with pydantic: the schema in the definition guides the model,
it is not a security boundary.
"""

import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from festiveos.ai import events, jugaad, music, recitation
from festiveos.ai.actions import ACTIONS, ActionServices
from festiveos.ai.agents import AGENTS, Agent
from festiveos.ai.cards import (
    CalendarCard,
    Card,
    ConfirmCard,
    Detail,
    HostingPlanCard,
    LinkItem,
    LinksCard,
    PlanSection,
    QuestionCard,
    QuestionContent,
)
from festiveos.ai.hosting import MAX_GUESTS, Diet, HostingPlan, Meal, plan_hosting
from festiveos.core.errors import (
    ConflictError,
    ForbiddenError,
    InvalidInputError,
    NotFoundError,
    ServiceUnavailableError,
)
from festiveos.festivals.service import FestivalService
from festiveos.households.service import HouseholdService
from festiveos.inventory.service import InventoryService
from festiveos.users.models import User

DOMAIN_ERRORS = (NotFoundError, ConflictError, ForbiddenError, InvalidInputError)
RAW_ITEMS = ("Rice (raw)", "Atta")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HostingInput(Strict):
    adults: int = Field(ge=1, le=MAX_GUESTS)
    children: int = Field(ge=0, le=MAX_GUESTS)
    elders: int = Field(ge=0, le=MAX_GUESTS)
    meal: Meal
    diet: Diet
    chairs_available: int | None = Field(default=None, ge=0, le=10_000)
    floor_seats_available: int | None = Field(default=None, ge=0, le=10_000)
    plates_available: int | None = Field(default=None, ge=0, le=10_000)


class JugaadInput(Strict):
    shortfall_seats: int = Field(ge=0, le=MAX_GUESTS)
    elders_without_chair: int = Field(ge=0, le=MAX_GUESTS)
    children: int = Field(ge=0, le=MAX_GUESTS)
    plates_short: int = Field(default=0, ge=0, le=MAX_GUESTS)


class HandoffInput(Strict):
    agent: str
    brief: str = Field(min_length=1, max_length=600)


class ProposeInput(Strict):
    kind: str
    params: dict[str, Any]


@dataclass
class PendingCard:
    kind: str  # "question" | "confirm"
    card: Card
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolResult:
    content: dict[str, Any]
    is_error: bool = False
    cards: list[Card] = field(default_factory=list)
    pause: PendingCard | None = None
    handoff_to: str | None = None

    def as_block(self, tool_use_id: str) -> dict[str, Any]:
        block: dict[str, Any] = {
            "type": "tool_result",
            "tool_use_id": tool_use_id,
            "content": json.dumps(self.content, ensure_ascii=False),
        }
        if self.is_error:
            block["is_error"] = True
        return block


@dataclass
class ToolContext:
    session: Any
    actor: User
    household_id: uuid.UUID
    agent: Agent
    clock: Callable[[], datetime] = lambda: datetime.now(UTC)
    # Live web search for events (None when unavailable): takes a prompt and the sites to search.
    search: Callable[[str, list[str]], str] | None = None

    def __post_init__(self) -> None:
        self.households = HouseholdService(self.session)
        self.festivals = FestivalService(self.session)
        self.inventory = InventoryService(self.session)


def _schema(model: type[BaseModel]) -> dict[str, Any]:
    schema = model.model_json_schema()
    schema.pop("title", None)
    return schema


def _tool(name: str, description: str, schema: dict[str, Any]) -> dict[str, Any]:
    return {"name": name, "description": description, "input_schema": schema}


class EventsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(
        min_length=2,
        max_length=80,
        description="The festival or kind of event, e.g. 'Diwali party' or 'Christmas carols'",
    )
    city: str | None = Field(
        default=None,
        max_length=60,
        description="The city to look in. Leave out to use the group's own location.",
    )
    when: str | None = Field(
        default=None, max_length=60, description="Optional timing, e.g. 'this weekend'"
    )


class MusicInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(
        min_length=2,
        max_length=100,
        description="What to play, e.g. 'Hanuman Chalisa M S Subbulakshmi', 'Om Jai Jagdish "
        "aarti', 'Ganesh bhajans', 'Ayat al-Kursi recitation', 'Christmas carols'",
    )


class RecitationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected: str = Field(
        min_length=1, max_length=600, description="The exact line you asked them to say"
    )
    heard: str = Field(default="", max_length=600, description="What they said, as it reached you")


class CalendarInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)
    start_date: date
    end_date: date | None = Field(default=None, description="Last day; leave out for one day")
    notes: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def sensible(self) -> "CalendarInput":
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date is before start_date")
        if self.end_date is not None and self.end_date - self.start_date > timedelta(days=31):
            raise ValueError("an event can span at most a month")
        return self


_EMPTY = {"type": "object", "properties": {}, "additionalProperties": False}

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    _tool(
        "get_household_context",
        "The household's name, timezone, today's date there, language and how many members it "
        "has. Call it before asking about the household.",
        _EMPTY,
    ),
    _tool(
        "list_inventory",
        "What the household owns that hosting needs (chairs, floor seating, tables, serving "
        "ware), with totals per category. Check this before asking how many chairs there are.",
        _EMPTY,
    ),
    _tool(
        "list_festivals",
        "The household's festivals, newest first, with dates, status and readiness score.",
        _EMPTY,
    ),
    _tool(
        "calculate_hosting",
        "Work out how much food to make and whether seats and plates are enough for a gathering. "
        "Always use this for quantities; never calculate food or seating yourself. Leave out "
        "chairs_available unless the person told you a number, and the household inventory is "
        "used. `adults` includes the hosts and the elders. If something is missing the result "
        "lists it under `needs`.",
        _schema(HostingInput),
    ),
    _tool(
        "jugaad_options",
        "Safe, resourceful ways to close a shortage of seats or plates, free options first, "
        "with how many seats each covers. Pass the numbers calculate_hosting reported.",
        _schema(JugaadInput),
    ),
    _tool(
        "find_events",
        "Look for real, upcoming events (parties, cultural programmes, pujas, concerts) near the "
        "person on BookMyShow, District, Insider and AllEvents, and show them as tappable links "
        "they can open to RSVP. Use it whenever someone asks what is happening near them or "
        "wants somewhere to celebrate or RSVP. If the group has no location and you do not know "
        "the city, ask once first. Results are listings, not bookings: never claim a seat is "
        "available or give a price.",
        _schema(EventsInput),
    ),
    _tool(
        "play_music",
        "Show links that play a song, bhajan, hymn, aarti, naat, shabad, carol or recitation on "
        "the person's phone (YouTube, Spotify, JioSaavn, Apple Music). Use it whenever they ask "
        "for music or want to listen along. Put the title and, if known, the singer in the query.",
        _schema(MusicInput),
    ),
    _tool(
        "check_recitation",
        "Check what the person said against the line you asked them to repeat. Returns a verdict "
        "(correct, close, retry or unclear), a score and exactly which words were missed, said "
        "differently or added. Always call it after they repeat a line, and base your praise or "
        "correction on its result, never on your own guess. Spelling differences that sound the "
        "same are already ignored. Pass the exact line you asked for in `expected`.",
        _schema(RecitationInput),
    ),
    _tool(
        "add_to_calendar",
        "Show a card that adds a festival or event to the person's own phone calendar (Apple "
        "Calendar on iPhone, Google Calendar or the phone's calendar on Android) when they tap "
        "it. Use it when they ask to put something in their calendar. Dates must be real: look "
        "them up with list_festivals first if you are not sure.",
        _schema(CalendarInput),
    ),
    _tool(
        "ask_user",
        "Show the person a card with up to six questions and wait for their answers. Use it for "
        "every missing fact, together in one card. Call it alone, never with another tool.",
        _schema(QuestionContent),
    ),
    _tool(
        "propose_action",
        "Propose a change to the household's data. The person sees a confirmation card and "
        "nothing happens unless they approve. kind is one of: "
        + ", ".join(sorted(ACTIONS))
        + ". params follow that action's fields (add_inventory_item: name, category, quantity, "
        "notes; create_festival: type, name, start_date, end_date). Call it alone.",
        _schema(ProposeInput),
    ),
    _tool(
        "handoff",
        "Pass the conversation to another specialist agent with a short brief of what is known. "
        "Allowed targets depend on who you are; see your instructions.",
        _schema(HandoffInput),
    ),
]
KNOWN_TOOLS = {tool["name"] for tool in TOOL_DEFINITIONS}


def _error(message: str, **extra: Any) -> ToolResult:
    return ToolResult({"error": message, **extra}, is_error=True)


def run_tool(ctx: ToolContext, name: str, raw_input: object) -> ToolResult:
    """Execute one tool call. Never raises for a bad call: the model gets an error to react to."""
    if name not in KNOWN_TOOLS:
        return _error(f"Unknown tool '{name}'.")
    if name not in ctx.agent.tools:
        return _error(f"The {ctx.agent.name} agent may not use '{name}'.")
    if not isinstance(raw_input, dict):
        return _error("Tool input must be a JSON object.")
    try:
        return HANDLERS[name](ctx, raw_input)
    except ValidationError as exc:
        problems = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()[:5]
        )
        return _error(f"Invalid input: {problems}")
    except DOMAIN_ERRORS as exc:
        return _error(str(exc))


# ------------------------------------------------------------------------------------ read tools


def _household_context(ctx: ToolContext, _: dict[str, Any]) -> ToolResult:
    household = ctx.households.get_detail(ctx.actor, ctx.household_id)
    today = ctx.clock().astimezone(ZoneInfo(household.timezone)).date()
    return ToolResult(
        {
            "household": household.name,
            "members": len(household.members),
            "timezone": household.timezone,
            "today": today.isoformat(),
            "language": household.default_language,
            "location": household.location,
            # About the person asking (not other members): lets answers fit their faith and city.
            "person": {
                "faiths": list(ctx.actor.faiths or []),
                "home_city": ctx.actor.home_city,
            },
        }
    )


def _list_inventory(ctx: ToolContext, _: dict[str, Any]) -> ToolResult:
    items = ctx.inventory.list_for_household(ctx.actor, ctx.household_id, None, 100, 0)
    totals = ctx.inventory.totals(ctx.actor, ctx.household_id)
    return ToolResult(
        {
            "totals_by_category": totals,
            "items": [
                {"name": i.name, "category": i.category, "quantity": i.quantity} for i in items
            ],
        }
    )


def _list_festivals(ctx: ToolContext, _: dict[str, Any]) -> ToolResult:
    festivals = ctx.festivals.list_for_household(ctx.actor, ctx.household_id, None, 20, 0)
    return ToolResult(
        {
            "festivals": [
                {
                    "name": f.name,
                    "type": f.type,
                    "start": f.start_date.isoformat(),
                    "end": f.end_date.isoformat(),
                    "status": f.status,
                    "readiness_score": f.readiness_score,
                }
                for f in festivals
            ]
        }
    )


def _find_events(ctx: ToolContext, raw: dict[str, Any]) -> ToolResult:
    data = EventsInput.model_validate(raw)
    household = ctx.households.get_detail(ctx.actor, ctx.household_id)
    city = (data.city or household.location or "").strip()
    if not city:
        return _error("The city is unknown. Ask the person which city to look in, then call again.")
    today = ctx.clock().astimezone(ZoneInfo(household.timezone)).date()

    found = events.cached(city, data.query, today)
    if found is None and ctx.search is not None:
        try:
            found = events.parse_events(
                ctx.search(
                    events.search_prompt(data.query, city, data.when, today), events.SEARCH_DOMAINS
                )
            )
            events.remember(city, data.query, today, found)
        except ServiceUnavailableError:
            found = None  # no live listings right now; the searches below still work
    found = found or []

    links = [
        LinkItem(
            label=e.title, url=e.url, note=" · ".join(p for p in (e.date, e.venue) if p) or None
        )
        for e in found
    ] + [LinkItem(label=label, url=url) for label, url in events.site_searches(data.query, city)]
    card = LinksCard(
        id=uuid.uuid4(),
        title=f"{data.query.strip().capitalize()} near {city}",
        description=(
            "Open a listing to see the date, venue and RSVP."
            if found
            else "No exact listings came up, but these searches open each site's own results."
        ),
        links=links,
    )
    return ToolResult(
        {
            "city": city,
            "events": [{"title": e.title, "date": e.date, "venue": e.venue} for e in found],
            "note": "Shown to the person as tappable links. These are listings found just now, not "
            "bookings: do not promise availability or prices, and tell them to check the page.",
        },
        cards=[card],
    )


def _play_music(_: ToolContext, raw: dict[str, Any]) -> ToolResult:
    data = MusicInput.model_validate(raw)
    query = music.clean_query(data.query)
    if len(query) < 2:
        return _error("Say what to play, such as a song, bhajan or hymn.")
    card = LinksCard(
        id=uuid.uuid4(),
        title=f"Play: {query}",
        description="Tap one to open it in that app or site on your phone.",
        links=[LinkItem(label=label, url=url) for label, url in music.music_links(query)],
    )
    return ToolResult(
        {
            "status": "shown",
            "note": "Links to play it were shown. Say so briefly, do not read them out.",
        },
        cards=[card],
    )


def _check_recitation(_: ToolContext, raw: dict[str, Any]) -> ToolResult:
    data = RecitationInput.model_validate(raw)
    result = recitation.compare(data.expected, data.heard)
    return ToolResult(
        {
            "verdict": result.verdict,
            "score": result.score,
            "missing": result.missing,
            "different": [{"expected": d.expected, "heard": d.heard} for d in result.different],
            "extra": result.extra,
            "note": result.note
            or "Speech recognition is imperfect: if only one small word differs, be gentle.",
        }
    )


def _add_to_calendar(_: ToolContext, raw: dict[str, Any]) -> ToolResult:
    data = CalendarInput.model_validate(raw)
    card = CalendarCard(
        id=uuid.uuid4(),
        title=data.title.strip(),
        start_date=data.start_date,
        end_date=data.end_date or data.start_date,
        notes=data.notes,
    )
    return ToolResult(
        {"status": "shown", "note": "The person taps the card to add it to their phone calendar."},
        cards=[card],
    )


# --------------------------------------------------------------------------- calculation tools


def _hosting(ctx: ToolContext, raw: dict[str, Any]) -> ToolResult:
    data = HostingInput.model_validate(raw)
    totals = ctx.inventory.totals(ctx.actor, ctx.household_id)
    chairs = data.chairs_available if data.chairs_available is not None else totals.get("seating")
    floor = (
        data.floor_seats_available
        if data.floor_seats_available is not None
        else totals.get("floor_seating", 0)
    )
    try:
        plan = plan_hosting(
            adults=data.adults,
            children=data.children,
            elders=data.elders,
            meal=data.meal,
            diet=data.diet,
            chairs=chairs,
            floor_seats=floor,
            plates=data.plates_available,
        )
    except ValueError as exc:
        return _error(str(exc))

    needs = [] if plan.seating else ["chairs_available (none recorded in the household inventory)"]
    if plan.plates_short is None:
        needs.append("plates_available (optional; ask only if plates may be short)")
    return ToolResult(
        _plan_for_model(plan, needs),
        cards=[_plan_card(plan)],
    )


def _plan_for_model(plan: HostingPlan, needs: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {
        "people": plan.adults + plan.children,
        "drop_in_allowance": plan.drop_ins,
        "plates_needed": plan.plates_needed,
        "plates_short": plan.plates_short,
        "food": [{"item": f.item, "quantity": f.quantity, "unit": f.unit} for f in plan.food],
        "needs": needs,
    }
    if plan.seating:
        s = plan.seating
        out["seating"] = {
            "seats_needed": s.needed,
            "chairs": s.chairs,
            "floor_seats": s.floor_seats,
            "shortfall": s.shortfall,
            "elders_without_chair": s.elders_without_chair,
            "enough": s.enough,
        }
    return out


def _qty(value: float, unit: str) -> str:
    return f"{value:g} {unit}"


def _plan_card(plan: HostingPlan) -> HostingPlanCard:
    cook = [f for f in plan.food if f.item not in RAW_ITEMS and not f.item.startswith("Atta")]
    shop = [f for f in plan.food if f.item in RAW_ITEMS or f.item.startswith("Atta")]
    sections = [
        PlanSection(
            heading="Food to make",
            lines=[Detail(label=f.item, value=_qty(f.quantity, f.unit)) for f in cook],
        ),
        PlanSection(
            heading="Raw ingredients to buy",
            lines=[Detail(label=f.item, value=_qty(f.quantity, f.unit)) for f in shop],
        ),
    ]
    headline = f"For {plan.adults + plan.children} people, plus {plan.drop_ins} drop-in"
    if plan.seating:
        s = plan.seating
        sections.append(
            PlanSection(
                heading="Seating",
                lines=[
                    Detail(label="Seats needed", value=str(s.needed)),
                    Detail(label="Chairs you have", value=str(s.chairs)),
                    Detail(label="Floor seats you have", value=str(s.floor_seats)),
                    Detail(label="Short by", value=str(s.shortfall)),
                    Detail(label="Elders without a chair", value=str(s.elders_without_chair)),
                ],
            )
        )
        headline += ": seating is enough" if s.enough else f": short of seating by {s.shortfall}"
    plates = [Detail(label="Plates needed", value=str(plan.plates_needed))]
    if plan.plates_short is not None:
        plates.append(Detail(label="Short by", value=str(plan.plates_short)))
    sections.append(PlanSection(heading="Plates", lines=plates))
    return HostingPlanCard(
        id=uuid.uuid4(), title="Hosting plan", headline=headline, sections=sections
    )


def _jugaad(_: ToolContext, raw: dict[str, Any]) -> ToolResult:
    data = JugaadInput.model_validate(raw)
    seating = jugaad.plan_seating(data.shortfall_seats, data.elders_without_chair, data.children)
    return ToolResult(
        {
            "seating": [
                {
                    "id": p.jugaad.id,
                    "title": p.jugaad.title,
                    "how": p.jugaad.how,
                    "cost": p.jugaad.cost,
                    "suitable_for": p.jugaad.suitable_for.value,
                    "covers_seats": p.seats,
                    "safety": p.jugaad.safety,
                }
                for p in seating.picks
            ],
            "uncovered_seats": seating.uncovered,
            "plates": [
                {"id": o.id, "title": o.title, "how": o.how, "cost": o.cost}
                for o in jugaad.FOOD_SERVICE
            ]
            if data.plates_short > 0 or data.shortfall_seats > 0
            else [],
        }
    )


# ------------------------------------------------------------------------- conversation tools


def _handoff(ctx: ToolContext, raw: dict[str, Any]) -> ToolResult:
    data = HandoffInput.model_validate(raw)
    if data.agent not in AGENTS or data.agent not in ctx.agent.handoffs:
        return _error(f"Cannot hand off to '{data.agent}'.", allowed=sorted(ctx.agent.handoffs))
    return ToolResult({"ok": True, "now": data.agent}, handoff_to=data.agent)


def _ask_user(_: ToolContext, raw: dict[str, Any]) -> ToolResult:
    content = QuestionContent.model_validate(raw)
    card = QuestionCard(id=uuid.uuid4(), **content.model_dump())
    return ToolResult(
        {"status": "waiting_for_user"}, cards=[card], pause=PendingCard("question", card)
    )


def _propose(ctx: ToolContext, raw: dict[str, Any]) -> ToolResult:
    data = ProposeInput.model_validate(raw)
    spec = ACTIONS.get(data.kind)
    if spec is None:
        return _error(f"Unknown action '{data.kind}'.", allowed=sorted(ACTIONS))
    params = spec.params.model_validate(data.params)
    card = ConfirmCard(
        id=uuid.uuid4(),
        title=spec.title,
        summary=spec.summary(params),
        details=spec.details(params),
    )
    payload = {"action": data.kind, "params": params.model_dump(mode="json")}
    return ToolResult(
        {"status": "waiting_for_user"}, cards=[card], pause=PendingCard("confirm", card, payload)
    )


HANDLERS: dict[str, Callable[[ToolContext, dict[str, Any]], ToolResult]] = {
    "get_household_context": _household_context,
    "list_inventory": _list_inventory,
    "list_festivals": _list_festivals,
    "find_events": _find_events,
    "add_to_calendar": _add_to_calendar,
    "play_music": _play_music,
    "check_recitation": _check_recitation,
    "calculate_hosting": _hosting,
    "jugaad_options": _jugaad,
    "ask_user": _ask_user,
    "propose_action": _propose,
    "handoff": _handoff,
}


def execute_action(ctx: ToolContext, action: str, params: dict[str, Any]) -> ToolResult:
    """Run an approved proposal as the person who approved it."""
    spec = ACTIONS[action]
    services = ActionServices(festivals=ctx.festivals, inventory=ctx.inventory)
    try:
        result = spec.execute(
            services, ctx.actor, ctx.household_id, spec.params.model_validate(params)
        )
    except DOMAIN_ERRORS as exc:
        return _error(f"The change was not made: {exc}")
    return ToolResult({"status": "done", **result})
