import json
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
import requests
from fastapi.testclient import TestClient

from festiveos.ai.agents import AGENTS, ORCHESTRATOR
from festiveos.ai.llm import LLMResponse, OpenAILLM, Usage, sse_events
from festiveos.ai.orchestrator import Orchestrator
from festiveos.ai.tools import ToolContext
from festiveos.config import Settings
from festiveos.core.errors import ConflictError, NotFoundError, ServiceUnavailableError
from festiveos.core.sse import frame, frames
from tests.ai.conftest import FakeLLM, text, use
from tests.ai.test_conversations import HOSTING, QUESTION
from tests.support import API, auth, setup_household

SETTINGS = Settings(jwt_secret="x" * 32, google_client_ids=("id",))


def parse(body: str) -> list[tuple[str, dict[str, Any]]]:
    """The (event name, data) pairs of a server-sent-event body."""
    events = []
    for block in body.strip().split("\n\n"):
        name, data = None, None
        for line in block.splitlines():
            if line.startswith("event: "):
                name = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        assert name is not None, block
        assert data is not None, block
        events.append((name, data))
    return events


def stream_start(client, user, household_id, message="plan my dinner"):
    return client.post(
        f"{API}/households/{household_id}/ai/conversations/stream",
        json={"message": message},
        headers=auth(user),
    )


def names(events) -> list[str]:
    return [name for name, _ in events]


def spoken(events, segment: int | None = None) -> str:
    return "".join(
        data["text"]
        for name, data in events
        if name == "text" and (segment is None or data["segment"] == segment)
    )


# ------------------------------------------------------------------------------- the HTTP stream


def test_an_answer_streams_in_pieces_and_ends_with_the_authoritative_turn(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text("Namaste! Diwali is on the 8th, so start shopping early."))

    response = stream_start(client, dad, household_id)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "no-cache" in response.headers["cache-control"]
    events = parse(response.text)
    assert names(events)[0] == "start"
    assert names(events)[-1] == "done"
    assert names(events).count("text") > 1  # in pieces, not one lump
    done = events[-1][1]
    assert spoken(events) == "Namaste! Diwali is on the 8th, so start shopping early."
    assert done["items"] == [{"type": "text", "text": spoken(events)}]
    assert done["conversation_id"] == events[0][1]["conversation_id"]
    assert done["pending_card"] is None


def test_the_streamed_result_is_exactly_what_the_plain_endpoint_returns(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    script = [use(("get_household_context", {})), text("All set.")]
    llm.will(*script)
    plain = client.post(
        f"{API}/households/{household_id}/ai/conversations",
        json={"message": "hi"},
        headers=auth(dad),
    ).json()
    llm.will(*script)

    done = parse(stream_start(client, dad, household_id, "hi").text)[-1][1]

    assert {k: v for k, v in done.items() if k != "conversation_id"} == {
        k: v for k, v in plain.items() if k != "conversation_id"
    }


def test_each_model_call_is_its_own_text_segment_and_tools_are_announced(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(
        use(("get_household_context", {}), lead="Let me check."),
        text("You are all set."),
    )

    events = parse(stream_start(client, dad, household_id).text)

    assert spoken(events, segment=1) == "Let me check."
    assert spoken(events, segment=2) == "You are all set."
    assert ("tool", {"name": "get_household_context"}) in events
    # The tool announcement comes after the lead-in and before the final answer.
    order = names(events)
    assert order.index("tool") > order.index("text")
    assert [i["text"] for i in events[-1][1]["items"]] == ["Let me check.", "You are all set."]


def test_a_question_card_arrives_as_pending_and_answering_it_streams_the_rest(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("ask_user", QUESTION)))

    first = parse(stream_start(client, dad, household_id).text)

    assert names(first)[-2:] == ["pending_card", "done"]
    card = first[-1][1]["pending_card"]
    assert card["kind"] == "question"
    assert dict(first)["pending_card"]["card"] == card

    llm.will(text("Thanks, planning that."))
    answered = client.post(
        f"{API}/ai/conversations/{first[-1][1]['conversation_id']}/cards/{card['id']}/response/stream",
        json={"answers": {"adults": 3, "elders": 1, "diet": "veg"}},
        headers=auth(dad),
    )

    events = parse(answered.text)
    assert spoken(events) == "Thanks, planning that."
    assert events[-1][1]["pending_card"] is None


def test_a_result_card_is_streamed_before_the_closing_words(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(
        use(("handoff", {"agent": "planner", "brief": "dinner"})),
        use(("calculate_hosting", HOSTING)),
        text("Cook the dal first."),
    )

    events = parse(stream_start(client, dad, household_id).text)

    order = names(events)
    assert order.index("card") < order.index("text")
    assert dict(events)["card"]["card"]["kind"] == "hosting_plan"


# ------------------------------------------------------------- failing before and during a stream


def test_failures_that_can_be_known_up_front_keep_their_real_status_code(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, mum, household_id = setup_household(client, make_user)
    llm.will(use(("ask_user", QUESTION)))
    turn = parse(stream_start(client, dad, household_id).text)[-1][1]
    conversation = f"{API}/ai/conversations/{turn['conversation_id']}"

    waiting = client.post(
        f"{conversation}/messages/stream", json={"message": "hi"}, headers=auth(dad)
    )
    stranger = client.post(
        f"{conversation}/messages/stream", json={"message": "hi"}, headers=auth(mum)
    )
    empty = client.post(f"{conversation}/messages/stream", json={"message": ""}, headers=auth(dad))
    bad_answers = client.post(
        f"{conversation}/cards/{turn['pending_card']['id']}/response/stream",
        json={"answers": {"adults": 999}},
        headers=auth(dad),
    )

    assert [r.status_code for r in (waiting, stranger, empty, bad_answers)] == [409, 404, 422, 422]
    for r in (waiting, stranger, empty, bad_answers):
        assert not r.headers["content-type"].startswith("text/event-stream")


def test_without_a_provider_key_streaming_answers_503_not_an_empty_stream(
    client: TestClient, make_user
) -> None:
    dad, _, household_id = setup_household(client, make_user)

    response = stream_start(client, dad, household_id)

    assert response.status_code == 503
    assert not response.headers["content-type"].startswith("text/event-stream")


class _FailsHalfway(FakeLLM):
    def stream(self, *, system, tools, messages):
        yield {"type": "text", "text": "Let me think abo", "segment": 1}
        raise ServiceUnavailableError("Utsav is unavailable right now. Please try again.")


def test_a_failure_mid_stream_becomes_an_error_event_and_frees_the_conversation(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    from festiveos.ai.dependencies import get_llm
    from festiveos.main import app

    dad, _, household_id = setup_household(client, make_user)
    app.dependency_overrides[get_llm] = lambda: _FailsHalfway()

    failed = stream_start(client, dad, household_id)

    assert failed.status_code == 200  # the status was already sent
    events = parse(failed.text)
    assert names(events) == ["start", "text", "error"]
    assert events[-1][1] == {
        "status": 503,
        "message": "Utsav is unavailable right now. Please try again.",
    }

    app.dependency_overrides[get_llm] = lambda: llm
    llm.will(text("Back again."))
    again = client.post(
        f"{API}/ai/conversations/{events[0][1]['conversation_id']}/messages/stream",
        json={"message": "hello?"},
        headers=auth(dad),
    )
    assert parse(again.text)[-1][0] == "done"  # the claim was released, nothing is stuck


def test_a_busy_conversation_reports_409_inside_the_stream_without_leaking(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    # frames() is what turns exceptions into events; the service tests cover when they are raised.
    body = "".join(
        frames(_raises(ConflictError("Utsav is still working on the previous message.")))
    )

    assert parse(body) == [
        ("error", {"status": 409, "message": "Utsav is still working on the previous message."})
    ]


# ------------------------------------------------------------------------------------ SSE framing


def _raises(exc: Exception) -> Iterator[dict[str, Any]]:
    raise exc
    yield  # pragma: no cover  (makes this a generator)


def test_a_frame_is_a_single_data_line_even_when_the_text_has_newlines() -> None:
    out = frame({"type": "text", "segment": 1, "text": "line one\n\nline two • नमस्ते"})

    assert out.startswith("event: text\ndata: ")
    assert out.endswith("\n\n")
    assert out.count("\n") == 3  # event line, data line, blank line: nothing leaked into the frame
    assert parse(out) == [("text", {"segment": 1, "text": "line one\n\nline two • नमस्ते"})]


def test_known_errors_keep_their_message_and_unknown_ones_are_generic() -> None:
    known = parse("".join(frames(_raises(NotFoundError("Conversation not found")))))
    unknown = parse("".join(frames(_raises(RuntimeError("db password is hunter2")))))

    assert known == [("error", {"status": 404, "message": "Conversation not found"})]
    assert unknown[0][1]["status"] == 500
    assert "hunter2" not in json.dumps(unknown)


def test_closing_the_frames_closes_the_work_behind_them() -> None:
    closed = []

    def work() -> Iterator[dict[str, Any]]:
        try:
            yield {"type": "text", "segment": 1, "text": "a"}
            yield {"type": "text", "segment": 1, "text": "b"}
        finally:
            closed.append(True)

    stream = frames(work())
    next(stream)
    stream.close()

    assert closed == [True]


# ------------------------------------------------- stopping early never corrupts the conversation


class _Journal:
    def __init__(self) -> None:
        self.records: list[tuple[str, Any]] = []
        self.cards = 0

    def record(self, role, content, ui=None) -> None:
        self.records.append((role, content))

    def set_agent(self, name) -> None:
        pass

    def open_card(self, tool_use_id, pending, payload) -> None:
        self.cards += 1


def _orchestrator(llm: FakeLLM) -> tuple[Orchestrator, _Journal]:
    journal = _Journal()
    ctx = ToolContext(
        session=SimpleNamespace(commit=lambda: None),
        actor=None,
        household_id=None,
        agent=AGENTS[ORCHESTRATOR],
    )
    return Orchestrator(llm, SETTINGS, journal, [], ctx), journal


def _dangling_tool_calls(journal: _Journal) -> set[str]:
    """Tool calls in the stored history that never got a result."""
    asked, answered = set(), set()
    for role, content in journal.records:
        if not isinstance(content, list):
            continue
        for block in content:
            if role == "assistant" and block["type"] == "tool_use":
                asked.add(block["id"])
            if role == "user" and block["type"] == "tool_result":
                answered.add(block["tool_use_id"])
    return asked - answered


def test_stopping_while_the_model_is_talking_records_nothing_from_that_call() -> None:
    llm = FakeLLM()
    llm.will(text("Namaste, how can I hel"))
    orchestrator, journal = _orchestrator(llm)

    run = orchestrator.start_events("hi", first_message=True)
    first = next(run)
    run.close()  # the person closed the app mid-answer

    assert first["type"] == "text"
    assert [role for role, _ in journal.records] == ["user", "system"]  # no half assistant message
    assert _dangling_tool_calls(journal) == set()


def test_stopping_after_a_tool_step_never_leaves_a_call_without_its_result() -> None:
    llm = FakeLLM()
    llm.will(use(("handoff", {"agent": "planner", "brief": "dinner"})), text("Planning now."))
    orchestrator, journal = _orchestrator(llm)

    run = orchestrator.start_events("hi", first_message=True)
    events = []
    for event in run:
        events.append(event)
        if event["type"] == "tool":
            break  # stop right as the model starts its tool call
    run.close()

    assert _dangling_tool_calls(journal) == set()


# ------------------------------------------------------------------ the OpenAI stream, end to end


class _StreamResponse:
    def __init__(self, lines: list[str], status: int = 200) -> None:
        self.status_code = status
        self.headers = {"x-request-id": "req_s"}
        self.encoding = None
        self._lines = lines
        self.closed = False

    def iter_lines(self, decode_unicode=False) -> Iterator[str]:
        yield from self._lines

    def close(self) -> None:
        self.closed = True


class _Session:
    def __init__(self, *responses) -> None:
        self.responses, self.calls = list(responses), []

    def post(self, url, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


def _sse(*events: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    for event in events:
        lines += [f"event: {event['type']}", f"data: {json.dumps(event)}", ""]
    return lines


COMPLETED = {
    "type": "response.completed",
    "response": {
        "status": "completed",
        "output": [
            {"type": "message", "content": [{"type": "output_text", "text": "Hello there"}]},
            {"type": "function_call", "call_id": "c1", "name": "list_inventory", "arguments": "{}"},
        ],
        "usage": {"input_tokens": 100, "output_tokens": 9, "input_tokens_details": {}},
    },
}


def _llm(*responses) -> tuple[OpenAILLM, _Session]:
    session = _Session(*responses)
    return OpenAILLM(SETTINGS, api_key="sk-test", session=session, sleep=lambda _s: None), session


def _consume(generator):
    events = []
    try:
        while True:
            events.append(next(generator))
    except StopIteration as done:
        return events, done.value


def test_the_provider_stream_becomes_text_and_tool_events_then_the_final_response() -> None:
    lines = _sse(
        {"type": "response.created", "response": {}},
        {"type": "response.output_text.delta", "delta": "Hello "},
        {"type": "response.output_text.delta", "delta": ""},
        {"type": "response.output_text.delta", "delta": "there"},
        {
            "type": "response.output_item.added",
            "item": {"type": "function_call", "name": "list_inventory"},
        },
        COMPLETED,
    )
    llm, session = _llm(_StreamResponse(lines))

    events, final = _consume(llm.stream(system="s", tools=[], messages=[]))

    assert events == [
        {"type": "text", "text": "Hello "},
        {"type": "text", "text": "there"},
        {"type": "tool", "name": "list_inventory"},
    ]
    assert session.calls[0]["stream"] is True
    assert session.calls[0]["json"]["stream"] is True
    assert isinstance(final, LLMResponse)
    assert final.stop_reason == "tool_use"
    assert final.content[0] == {"type": "text", "text": "Hello there"}
    assert final.usage == Usage(input_tokens=100, output_tokens=9)
    assert final.request_id == "req_s"


@pytest.mark.parametrize("failure", ["response.failed", "error"])
def test_a_failure_event_in_the_stream_becomes_unavailable(failure) -> None:
    llm, _ = _llm(_StreamResponse(_sse({"type": failure, "message": "secret prompt text"})))

    with pytest.raises(ServiceUnavailableError) as raised:
        _consume(llm.stream(system="s", tools=[], messages=[]))

    assert "secret" not in str(raised.value)


def test_a_stream_that_ends_before_completing_is_an_error_not_a_silent_cut() -> None:
    lines = _sse({"type": "response.output_text.delta", "delta": "Half an ans"})
    llm, _ = _llm(_StreamResponse(lines))

    with pytest.raises(ServiceUnavailableError):
        _consume(llm.stream(system="s", tools=[], messages=[]))


def test_the_connection_is_retried_before_any_text_but_never_after() -> None:
    retried, _ = _llm(_StreamResponse([], status=503), _StreamResponse(_sse(COMPLETED)))
    _events, final = _consume(retried.stream(system="s", tools=[], messages=[]))
    assert final.stop_reason == "tool_use"

    class Breaks(_StreamResponse):
        def iter_lines(self, decode_unicode=False):
            yield from _sse({"type": "response.output_text.delta", "delta": "Hi"})
            raise requests.ConnectionError("dropped")

    broken, session = _llm(Breaks([]), _StreamResponse(_sse(COMPLETED)))
    with pytest.raises(ServiceUnavailableError):
        _consume(broken.stream(system="s", tools=[], messages=[]))
    assert len(session.calls) == 1  # words had already reached the person: no repeat


def test_closing_the_stream_early_closes_the_provider_connection() -> None:
    response = _StreamResponse(
        _sse(
            {"type": "response.output_text.delta", "delta": "a"},
            {"type": "response.output_text.delta", "delta": "b"},
            COMPLETED,
        )
    )
    llm, _ = _llm(response)

    generator = llm.stream(system="s", tools=[], messages=[])
    next(generator)
    generator.close()

    assert response.closed is True


def test_server_sent_events_tolerate_comments_crlf_keepalives_and_junk() -> None:
    lines = [
        ": keep-alive",
        "event: x",
        'data: {"a": 1}',
        "",
        "data: not json",
        "",
        'data: {"b":',
        "data: 2}",
        "",
    ]

    assert list(sse_events(lines)) == [{"a": 1}, {"b": 2}]
    assert list(sse_events([b'data: {"c": 3}', b""])) == [{"c": 3}]
    assert list(sse_events(['data: {"d": 4}'])) == [{"d": 4}]  # no trailing blank line
