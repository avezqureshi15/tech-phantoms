"""The agents, who may hand off to whom, and which tools each may use.

Every request sends the same tool list and the same system prompt (so the prompt cache is shared
by all agents); an agent is a short playbook the orchestrator appends to the conversation, plus
the allow-lists below, which the server enforces. A model that calls a tool it was not given gets
an error result, so a prompt-injected "call propose_action" in the wrong place goes nowhere.
"""

from dataclasses import dataclass

from festiveos.ai.prompts import playbook

ORCHESTRATOR = "sutradhar"
ELDER = "elder"
RECITE = "recite"


@dataclass(frozen=True)
class Agent:
    name: str
    tools: frozenset[str]
    handoffs: frozenset[str]

    @property
    def playbook(self) -> str:
        return playbook(self.name)


AGENTS: dict[str, Agent] = {
    agent.name: agent
    for agent in (
        Agent(
            "sutradhar",
            frozenset(
                {
                    "get_household_context",
                    "list_festivals",
                    "list_inventory",
                    "find_events",
                    "play_music",
                    "add_to_calendar",
                    "ask_user",
                    "propose_action",
                    "handoff",
                }
            ),
            frozenset({"requirements", "planner", "jugaad", RECITE}),
        ),
        Agent(
            # A spoken conversation for elders: no forms or buttons, only things a voice can do.
            ELDER,
            frozenset(
                {
                    "get_household_context",
                    "list_festivals",
                    "play_music",
                    "find_events",
                    "add_to_calendar",
                    "check_recitation",
                }
            ),
            frozenset(),
        ),
        Agent(
            # Practising a prayer by repeating it, line by line, with corrections.
            RECITE,
            frozenset({"get_household_context", "check_recitation", "play_music"}),
            frozenset(),
        ),
        Agent(
            "requirements",
            frozenset({"get_household_context", "list_inventory", "ask_user", "handoff"}),
            frozenset({"planner"}),
        ),
        Agent(
            "planner",
            frozenset({"get_household_context", "list_inventory", "calculate_hosting", "handoff"}),
            frozenset({"requirements", "jugaad"}),
        ),
        Agent(
            "jugaad",
            frozenset(
                {
                    "list_inventory",
                    "calculate_hosting",
                    "jugaad_options",
                    "ask_user",
                    "propose_action",
                    "handoff",
                }
            ),
            frozenset({ORCHESTRATOR}),
        ),
    )
}


@dataclass(frozen=True)
class Skill:
    """A slash command that jumps straight to a specialist. Installed skills are listed to the
    client (``GET /ai/skills``) so the chat can offer them in a ``/`` menu."""

    command: str
    agent: str
    title: str
    description: str
    example: str


SKILLS: dict[str, Skill] = {
    skill.command: skill
    for skill in (
        Skill(
            "/jugaad",
            "jugaad",
            "Jugaad",
            "Resourceful, safe fixes when you are short of chairs, plates or space.",
            "/jugaad I have 4 chairs for 9 guests",
        ),
    )
}


def parse_skill(text: str) -> tuple[str | None, str]:
    """('jugaad', 'rest of the message') for '/jugaad ...', else (None, text)."""
    command, _, rest = text.strip().partition(" ")
    skill = SKILLS.get(command.lower())
    return (skill.agent, rest.strip()) if skill else (None, text.strip())
