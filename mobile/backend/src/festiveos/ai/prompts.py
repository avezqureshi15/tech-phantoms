"""Prompt text, loaded once from versioned files.

The files are the single source of truth; nothing here builds prompt text from runtime values.
That is what keeps the cached prefix byte-identical across every user and conversation: no dates,
names, ids or flags ever reach the system prompt. Changing a prompt means a new ``v<N>`` folder,
so a deploy that edits one is visible in review and in the ``prompt_version`` log field.
"""

from functools import lru_cache
from importlib import resources

PROMPT_VERSION = "v6"


@lru_cache
def _read(name: str) -> str:
    path = resources.files("festiveos.ai").joinpath("prompts", PROMPT_VERSION, f"{name}.md")
    return path.read_text(encoding="utf-8").strip()


def base_prompt() -> str:
    return _read("base")


def playbook(agent: str) -> str:
    return _read(agent)
