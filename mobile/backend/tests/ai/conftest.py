import copy
import itertools
from typing import Any

import pytest
from fastapi.testclient import TestClient

from festiveos.ai.dependencies import get_llm
from festiveos.ai.llm import LLMResponse, Usage
from festiveos.main import app

_ids = itertools.count(1)


@pytest.fixture(autouse=True)
def no_real_provider_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """A developer's real key (loaded from .env) must never switch tests onto the live provider."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPEN_AI_API_KEY", raising=False)


def text(body: str, stop: str = "end_turn") -> LLMResponse:
    return LLMResponse([{"type": "text", "text": body}], stop, Usage(10, 5, 0, 0), "req_fake")


def use(*calls: tuple[str, dict[str, Any]], lead: str = "") -> LLMResponse:
    content: list[dict[str, Any]] = [{"type": "text", "text": lead}] if lead else []
    content += [
        {"type": "tool_use", "id": f"toolu_{next(_ids)}", "name": name, "input": args}
        for name, args in calls
    ]
    return LLMResponse(content, "tool_use", Usage(10, 5, 0, 0), "req_fake")


class FakeLLM:
    """Plays back scripted model replies and records every request it was sent."""

    def __init__(self) -> None:
        self.script: list[LLMResponse] = []
        self.requests: list[dict[str, Any]] = []

    def will(self, *responses: LLMResponse) -> None:
        self.script.extend(responses)

    def complete(self, *, system, tools, messages) -> LLMResponse:
        self.requests.append(
            copy.deepcopy({"system": system, "tools": list(tools), "messages": messages})
        )
        assert self.script, "the model was called more times than the test scripted"
        return self.script.pop(0)

    def stream(self, *, system, tools, messages):
        """Plays the same script, but as events: the text in small pieces, then each tool start."""
        response = self.complete(system=system, tools=tools, messages=messages)
        for block in response.content:
            if block["type"] == "text":
                text = block["text"]
                for i in range(0, len(text), 5):
                    yield {"type": "text", "text": text[i : i + 5]}
            elif block["type"] == "tool_use":
                yield {"type": "tool", "name": block["name"]}
        return response


@pytest.fixture
def llm(client: TestClient) -> FakeLLM:
    fake = FakeLLM()
    app.dependency_overrides[get_llm] = lambda: fake
    return fake
