import json

import pytest
import requests

from festiveos.ai.agents import AGENTS
from festiveos.ai.llm import (
    PROMPT_CACHE_KEY,
    OpenAILLM,
    Usage,
    build_params,
    parse_response,
    to_input,
)
from festiveos.ai.prompts import base_prompt
from festiveos.ai.tools import TOOL_DEFINITIONS
from festiveos.config import Settings
from festiveos.core.errors import ServiceUnavailableError

SETTINGS = Settings(jwt_secret="x" * 32, google_client_ids=("id",))
TOOLS = TOOL_DEFINITIONS
MESSAGES = [{"role": "user", "content": [{"type": "text", "text": "hi"}]}]


def params(settings=SETTINGS, messages=MESSAGES):
    return build_params(settings, system=base_prompt(), tools=TOOLS, messages=messages)


# ----------------------------------------------------------------------------- the cached prefix


def test_the_cached_prefix_is_identical_for_different_conversations() -> None:
    first = params(messages=MESSAGES)
    second = params(messages=[{"role": "user", "content": "something else entirely"}])

    assert json.dumps([first["tools"], first["instructions"]]) == json.dumps(
        [second["tools"], second["instructions"]]
    )
    assert first["prompt_cache_key"] == second["prompt_cache_key"] == PROMPT_CACHE_KEY


def test_tools_are_sorted_and_use_the_function_shape() -> None:
    tools = params()["tools"]

    assert [tool["name"] for tool in tools] == sorted(tool["name"] for tool in TOOLS)
    assert all(tool["type"] == "function" and "parameters" in tool for tool in tools)


def test_instructions_are_free_of_volatile_values() -> None:
    text = params()["instructions"]

    assert "20" not in text.replace("2000", "")  # no years or dates
    assert "{" not in text  # no unfilled template placeholders


def test_requests_are_stateless_pin_effort_and_keep_reasoning() -> None:
    result = params()

    assert result["model"] == "gpt-6.2-sol"
    assert result["store"] is False  # nothing about a family is kept by the provider
    assert result["reasoning"] == {"effort": "medium"}
    assert result["include"] == ["reasoning.encrypted_content"]
    assert result["max_output_tokens"] == SETTINGS.ai_max_tokens


def test_the_shared_prefix_is_long_enough_to_be_cacheable() -> None:
    tokens_estimate = (len(base_prompt()) + len(json.dumps(TOOLS))) / 4
    assert tokens_estimate > 1024  # OpenAI caches prefixes of 1024 tokens or more


def test_every_agent_only_names_tools_that_exist() -> None:
    defined = {tool["name"] for tool in TOOLS}
    for agent in AGENTS.values():
        assert agent.tools <= defined, agent.name
        assert agent.handoffs <= set(AGENTS), agent.name


# ------------------------------------------------------------------- stored messages -> provider


def test_a_tool_round_trip_becomes_call_and_output_items_sharing_one_id() -> None:
    items = to_input(
        [
            {"role": "user", "content": "plan Diwali"},
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Checking."},
                    {
                        "type": "tool_use",
                        "id": "call_1",
                        "name": "list_inventory",
                        "input": {"a": 1},
                    },
                ],
            },
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "call_1", "content": '{"ok":1}'}
                ],
            },
        ]
    )

    assert items[0] == {"role": "user", "content": [{"type": "input_text", "text": "plan Diwali"}]}
    assert items[1]["content"] == [{"type": "output_text", "text": "Checking."}]
    assert items[2] == {
        "type": "function_call",
        "call_id": "call_1",
        "name": "list_inventory",
        "arguments": '{"a":1}',
    }
    assert items[3] == {"type": "function_call_output", "call_id": "call_1", "output": '{"ok":1}'}


def test_system_notes_become_developer_items() -> None:
    items = to_input([*MESSAGES, {"role": "system", "content": "You are now PLANNER"}])

    assert items[-1] == {"role": "developer", "content": "You are now PLANNER"}


def test_reasoning_items_are_replayed_untouched_and_unknown_blocks_are_dropped() -> None:
    reasoning = {"type": "reasoning", "id": "rs_1", "encrypted_content": "abc", "summary": []}
    items = to_input(
        [
            {
                "role": "assistant",
                "content": [
                    {"type": "thinking", "thinking": "left by an earlier provider"},
                    reasoning,
                ],
            }
        ]
    )

    assert items == [reasoning]


# ------------------------------------------------------------------- provider -> stored messages


def message(text: str) -> dict:
    return {"type": "message", "content": [{"type": "output_text", "text": text}]}


def test_text_becomes_a_text_block_and_usage_is_split_into_fresh_cached_and_written() -> None:
    response = parse_response(
        {
            "status": "completed",
            "output": [message("namaste")],
            "usage": {
                "input_tokens": 1000,
                "output_tokens": 7,
                "input_tokens_details": {"cached_tokens": 800, "cache_write_tokens": 100},
            },
        },
        "req_1",
    )

    assert response.content == [{"type": "text", "text": "namaste"}]
    assert response.stop_reason == "end_turn"
    assert response.usage == Usage(
        input_tokens=100, output_tokens=7, cache_read_tokens=800, cache_write_tokens=100
    )
    assert response.usage.cache_hit_ratio == 0.8
    assert response.request_id == "req_1"


def test_function_calls_become_tool_use_blocks() -> None:
    response = parse_response(
        {
            "status": "completed",
            "output": [
                {"type": "reasoning", "id": "rs_1", "encrypted_content": "abc", "summary": []},
                {
                    "type": "function_call",
                    "call_id": "call_9",
                    "name": "get_household_context",
                    "arguments": "{}",
                },
            ],
        },
        None,
    )

    assert response.stop_reason == "tool_use"
    assert response.content[0]["type"] == "reasoning"  # kept so it can be replayed
    assert response.content[1] == {
        "type": "tool_use",
        "id": "call_9",
        "name": "get_household_context",
        "input": {},
    }


@pytest.mark.parametrize("arguments", ["not json", "[1, 2]", "", None])
def test_unusable_tool_arguments_become_empty_input_not_a_crash(arguments) -> None:
    response = parse_response(
        {
            "output": [
                {"type": "function_call", "call_id": "c", "name": "t", "arguments": arguments}
            ]
        },
        None,
    )

    assert response.content[0]["input"] == {}


def test_a_refusal_and_a_truncated_answer_are_reported_as_such() -> None:
    refused = parse_response(
        {"output": [{"type": "message", "content": [{"type": "refusal", "refusal": "no"}]}]}, None
    )
    truncated = parse_response(
        {
            "status": "incomplete",
            "incomplete_details": {"reason": "max_output_tokens"},
            "output": [message("half an ans")],
        },
        None,
    )

    assert refused.stop_reason == "refusal"
    assert truncated.stop_reason == "max_tokens"


# ------------------------------------------------------------------------------- the HTTP client


class FakeResponse:
    def __init__(self, status: int, body: dict | None = None, headers: dict | None = None) -> None:
        self.status_code = status
        self._body = body if body is not None else {}
        self.headers = headers or {"x-request-id": "req_x"}

    def json(self) -> dict:
        return self._body


class FakeSession:
    """Returns (or raises) each queued outcome in turn and remembers what it was sent."""

    def __init__(self, *outcomes) -> None:
        self.outcomes, self.calls = list(outcomes), []

    def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


OK = FakeResponse(200, {"status": "completed", "output": [message("hello")]})


def client(*outcomes, sleeps=None) -> tuple[OpenAILLM, FakeSession]:
    session = FakeSession(*outcomes)
    llm = OpenAILLM(
        SETTINGS,
        api_key="sk-test-secret",
        session=session,
        sleep=(sleeps.append if sleeps is not None else lambda _s: None),
    )
    return llm, session


def complete(llm: OpenAILLM):
    return llm.complete(system="s", tools=TOOLS, messages=MESSAGES)


def test_a_request_goes_to_the_responses_endpoint_with_the_key_and_a_timeout() -> None:
    llm, session = client(OK)

    assert complete(llm).content == [{"type": "text", "text": "hello"}]

    call = session.calls[0]
    assert call["url"] == "https://api.openai.com/v1/responses"
    assert call["headers"] == {"Authorization": "Bearer sk-test-secret"}
    assert call["timeout"] == (10, SETTINGS.ai_timeout_seconds)
    assert "sk-test-secret" not in json.dumps(call["json"])  # the key is never in the body


@pytest.mark.parametrize("status", [400, 401, 403, 404])
def test_client_errors_are_not_retried_and_do_not_leak_provider_text(status) -> None:
    llm, session = client(FakeResponse(status, {"error": {"message": "secret prompt text"}}))

    with pytest.raises(ServiceUnavailableError) as raised:
        complete(llm)

    assert "secret" not in str(raised.value)
    assert len(session.calls) == 1


@pytest.mark.parametrize("status", [429, 500, 503])
def test_transient_errors_are_retried_with_backoff_then_succeed(status) -> None:
    sleeps: list[float] = []
    llm, session = client(FakeResponse(status), OK, sleeps=sleeps)

    assert complete(llm).stop_reason == "end_turn"
    assert len(session.calls) == 2
    assert len(sleeps) == 1
    assert 0 < sleeps[0] <= 8


def test_retries_are_bounded() -> None:
    llm, session = client(FakeResponse(503), FakeResponse(503), FakeResponse(503), OK)

    with pytest.raises(ServiceUnavailableError):
        complete(llm)

    assert len(session.calls) == 3  # the first try and two retries, never a fourth


def test_retry_after_is_honoured_but_capped() -> None:
    sleeps: list[float] = []
    llm, _ = client(
        FakeResponse(429, headers={"retry-after": "3"}),
        FakeResponse(429, headers={"retry-after": "9999"}),
        OK,
        sleeps=sleeps,
    )

    complete(llm)

    assert sleeps == [3.0, 8.0]


def test_connection_problems_are_retried_then_become_unavailable() -> None:
    llm, session = client(requests.ConnectionError("boom"), OK)
    assert complete(llm).stop_reason == "end_turn"
    assert len(session.calls) == 2

    always_down = client(*[requests.Timeout("slow")] * 3)[0]
    with pytest.raises(ServiceUnavailableError):
        complete(always_down)


def test_a_body_that_is_not_json_becomes_unavailable() -> None:
    class Broken(FakeResponse):
        def json(self):
            raise ValueError("not json")

    llm, _ = client(Broken(200))

    with pytest.raises(ServiceUnavailableError):
        complete(llm)


# ------------------------------------------------------------ model and effort from a flag


def overridden(model, effort, *outcomes) -> tuple[OpenAILLM, FakeSession]:
    session = FakeSession(*outcomes)
    llm = OpenAILLM(
        SETTINGS,
        api_key="sk-test-secret",
        session=session,
        sleep=lambda _s: None,
        overrides=lambda: (model, effort),
    )
    return llm, session


def test_a_model_and_effort_set_in_a_flag_are_used_on_the_very_next_call() -> None:
    llm, session = overridden("gpt-6-luna", "high", OK)

    complete(llm)

    body = session.calls[0]["json"]
    assert body["model"] == "gpt-6-luna"
    assert body["reasoning"] == {"effort": "high"}


def test_with_nothing_set_the_configured_model_and_effort_are_kept() -> None:
    llm, session = overridden(None, None, OK)

    complete(llm)

    assert session.calls[0]["json"]["model"] == SETTINGS.ai_model
    assert session.calls[0]["json"]["reasoning"] == {"effort": SETTINGS.ai_effort}


def test_only_the_model_can_be_overridden_leaving_the_effort_alone() -> None:
    llm, session = overridden("gpt-6-luna", None, OK)

    complete(llm)

    assert session.calls[0]["json"]["model"] == "gpt-6-luna"
    assert session.calls[0]["json"]["reasoning"] == {"effort": SETTINGS.ai_effort}


def test_the_override_also_applies_to_web_search() -> None:
    llm, session = overridden("gpt-6-luna", "low", OK)

    llm.search(prompt="events", domains=["district.in"])

    assert session.calls[0]["json"]["model"] == "gpt-6-luna"


def test_the_override_also_applies_to_streaming() -> None:
    from tests.ai.test_streaming import COMPLETED, _Session, _sse, _StreamResponse

    session = _Session(_StreamResponse(_sse(COMPLETED)))
    llm = OpenAILLM(
        SETTINGS,
        api_key="sk-test-secret",
        session=session,
        sleep=lambda _s: None,
        overrides=lambda: ("gpt-6-luna", "high"),
    )

    generator = llm.stream(system="s", tools=TOOLS, messages=MESSAGES)
    while True:
        try:
            next(generator)
        except StopIteration:
            break

    assert session.calls[0]["json"]["model"] == "gpt-6-luna"
    assert session.calls[0]["json"]["reasoning"] == {"effort": "high"}


# ------------------------------------------------------------------------------ NudgeBee incidents


class Incidents:
    def __init__(self) -> None:
        self.recorded: list[tuple[str, str]] = []

    def record(self, feature: str, reason: str) -> None:
        self.recorded.append((feature, reason))


def reporting(*outcomes) -> tuple[OpenAILLM, Incidents]:
    incidents = Incidents()
    llm = OpenAILLM(
        SETTINGS,
        api_key="sk-test-secret",
        session=FakeSession(*outcomes),
        sleep=lambda _s: None,
        incidents=incidents,
    )
    return llm, incidents


def test_every_successful_model_call_is_counted_for_usage_spikes() -> None:
    llm, incidents = reporting(OK, OK)

    complete(llm)
    complete(llm)

    assert incidents.recorded == [("utsav", "ai_usage_spike")] * 2


def test_a_failed_model_call_is_reported_once_after_its_retries() -> None:
    llm, incidents = reporting(*[FakeResponse(503)] * 3)

    with pytest.raises(ServiceUnavailableError):
        complete(llm)

    assert incidents.recorded == [("utsav", "ai_provider_errors")]


def test_a_retried_call_that_succeeds_is_not_a_failure() -> None:
    llm, incidents = reporting(FakeResponse(503), OK)

    complete(llm)

    assert incidents.recorded == [("utsav", "ai_usage_spike")]
