"""The only module that talks to OpenAI.

It uses the Responses API. Chat Completions is not an option for the default model: with function
tools and reasoning on, gpt-6.2-sol answers HTTP 400 there ("use /v1/responses").

The rest of the AI layer keeps one internal conversation format (text, tool_use and tool_result
blocks, as stored in the database); this module translates to and from the provider at the edge, so
swapping providers again touches nothing else.

Privacy: requests are stateless (``store: false``), so nothing about a family is retained by the
provider. Reasoning comes back encrypted and is replayed with the tool results, which is what lets
the model keep its train of thought across a tool call without server-side state.

Prompt caching is automatic for a prefix of 1024 tokens or more and matches on the exact prefix:
tools (sorted by name), then instructions, then the conversation, which only ever grows. Nothing
per-user, per-request or time-dependent may appear in the first two; tests/ai/test_llm.py fails if
they change between two different conversations.
"""

import json
import logging
import random
import time
from collections.abc import Callable, Generator, Iterable, Iterator, Sequence
from dataclasses import dataclass, replace
from typing import Any, Protocol

import requests

from festiveos.config import Settings, openai_api_key
from festiveos.core.errors import ServiceUnavailableError
from festiveos.integrations.flags import FeatureFlags
from festiveos.integrations.nudgebee import IncidentReporter

LOGGER = logging.getLogger("festiveos.ai.llm")

RESPONSES_URL = "https://api.openai.com/v1/responses"
# One key for every request: the shared prefix (tools + instructions) is the same for everybody, so
# routing them together is what makes the cache hit.
PROMPT_CACHE_KEY = "festiveos-utsav-v1"
RETRYABLE_STATUSES = frozenset({408, 409, 429, 500, 502, 503, 504})
MAX_RETRIES = 2
MAX_RETRY_WAIT_SECONDS = 8.0
UNAVAILABLE = "Utsav is unavailable right now. Please try again."


@dataclass(frozen=True)
class Usage:
    """``input_tokens`` is the fresh (uncached) part of the prompt, as the cost tables count it."""

    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

    @property
    def cache_hit_ratio(self) -> float:
        prompt = self.input_tokens + self.cache_read_tokens + self.cache_write_tokens
        return round(self.cache_read_tokens / prompt, 3) if prompt else 0.0


@dataclass(frozen=True)
class LLMResponse:
    content: list[dict[str, Any]]  # blocks to be stored and replayed unchanged
    stop_reason: str  # end_turn | tool_use | max_tokens | refusal | filtered
    usage: Usage
    request_id: str | None = None


# What a streaming call reports while it runs: {"type": "text", "text": ...} for each piece of the
# answer, and {"type": "tool", "name": ...} when the model starts calling a tool.
LLMEvent = dict[str, Any]


class LLM(Protocol):
    def complete(
        self, *, system: str, tools: Sequence[dict[str, Any]], messages: list[dict[str, Any]]
    ) -> LLMResponse: ...

    def stream(
        self, *, system: str, tools: Sequence[dict[str, Any]], messages: list[dict[str, Any]]
    ) -> Generator[LLMEvent, None, LLMResponse]:
        """Like ``complete``, but yields events as they arrive and returns the final response.
        Closing the generator early stops the call."""
        ...

    def search(self, *, prompt: str, domains: Sequence[str]) -> str:
        """Answer ``prompt`` using live web search restricted to ``domains``; returns the text."""
        ...


# ------------------------------------------------------------------------------ request building


def to_input(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Our stored conversation as Responses API input items, in order."""
    items: list[dict[str, Any]] = []
    for message in messages:
        role, content = message["role"], message["content"]
        if role == "system":
            # A note from the system mid-conversation (the specialist now speaking). The developer
            # role outranks anything a person or a tool result says.
            items.append({"role": "developer", "content": content})
            continue
        blocks = [{"type": "text", "text": content}] if isinstance(content, str) else content
        for block in blocks:
            item = _input_item(role, block)
            if item is not None:
                items.append(item)
    return items


def _input_item(role: str, block: dict[str, Any]) -> dict[str, Any] | None:
    kind = block["type"]
    if role == "user":
        if kind == "text":
            return {"role": "user", "content": [{"type": "input_text", "text": block["text"]}]}
        if kind == "tool_result":
            return {
                "type": "function_call_output",
                "call_id": block["tool_use_id"],
                "output": block["content"],
            }
        return None
    if kind == "text":
        return {"role": "assistant", "content": [{"type": "output_text", "text": block["text"]}]}
    if kind == "tool_use":
        return {
            "type": "function_call",
            "call_id": block["id"],
            "name": block["name"],
            "arguments": json.dumps(block["input"], ensure_ascii=False, separators=(",", ":")),
        }
    if kind == "reasoning":
        return block  # the provider's own item, returned to it untouched
    return None  # anything else (e.g. blocks stored by an earlier provider) is not replayed


def to_tool(definition: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "function",
        "name": definition["name"],
        "description": definition.get("description", ""),
        "parameters": definition["input_schema"],
    }


def build_params(
    settings: Settings,
    *,
    system: str,
    tools: Sequence[dict[str, Any]],
    messages: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "model": settings.ai_model,
        "instructions": system,
        "input": to_input(messages),
        "tools": [to_tool(tool) for tool in sorted(tools, key=lambda tool: tool["name"])],
        # Effort is part of the cached prefix's behaviour: pin it, never vary it per request.
        "reasoning": {"effort": settings.ai_effort},
        "max_output_tokens": settings.ai_max_tokens,  # counts reasoning tokens too
        "store": False,
        "include": ["reasoning.encrypted_content"],
        "prompt_cache_key": PROMPT_CACHE_KEY,
    }


# ------------------------------------------------------------------------------ response parsing


def parse_response(body: dict[str, Any], request_id: str | None) -> LLMResponse:
    blocks: list[dict[str, Any]] = []
    refused = False
    for item in body.get("output", []):
        kind = item.get("type")
        if kind == "message":
            for part in item.get("content", []):
                if part.get("type") == "output_text" and part.get("text"):
                    blocks.append({"type": "text", "text": part["text"]})
                elif part.get("type") == "refusal":
                    refused = True
        elif kind == "function_call":
            blocks.append(
                {
                    "type": "tool_use",
                    "id": item["call_id"],
                    "name": item["name"],
                    "input": _arguments(item.get("arguments")),
                }
            )
        elif kind == "reasoning":
            blocks.append(item)

    incomplete = (body.get("incomplete_details") or {}).get("reason")
    if refused:
        stop_reason = "refusal"  # the model itself declined
    elif incomplete == "content_filter":
        # An automated filter cut the answer off (typically a long word-for-word recitation).
        # That is not a refusal: what was written so far stays in ``content``.
        stop_reason = "filtered"
    elif body.get("status") == "incomplete":
        stop_reason = "max_tokens"
    elif any(block["type"] == "tool_use" for block in blocks):
        stop_reason = "tool_use"
    else:
        stop_reason = "end_turn"

    return LLMResponse(
        content=blocks,
        stop_reason=stop_reason,
        usage=_usage(body.get("usage")),
        request_id=request_id,
    )


def _arguments(raw: str | None) -> dict[str, Any]:
    """The model's tool arguments. Anything that is not a JSON object becomes empty input, which the
    tool then rejects with a message the model can read and correct."""
    try:
        value = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def _usage(raw: dict[str, Any] | None) -> Usage:
    raw = raw or {}
    details = raw.get("input_tokens_details") or {}
    cached = details.get("cached_tokens") or 0
    written = details.get("cache_write_tokens") or 0
    total_in = raw.get("input_tokens") or 0
    return Usage(
        input_tokens=max(total_in - cached - written, 0),
        output_tokens=raw.get("output_tokens") or 0,
        cache_read_tokens=cached,
        cache_write_tokens=written,
    )


def sse_events(lines: Iterable[str | bytes]) -> Iterator[dict[str, Any]]:
    """The JSON payload of each server-sent event, in order. Comments, keep-alives and anything that
    is not a JSON object are skipped; an event is complete at a blank line."""
    data: list[str] = []
    for raw in lines:
        line = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        if line:
            if line.startswith("data:"):
                data.append(line[5:].lstrip())
            continue  # "event:", "id:", ":comment" lines carry nothing we use
        if data:
            event = _json_object("\n".join(data))
            data = []
            if event is not None:
                yield event
    if data:  # a stream that ends without the final blank line
        event = _json_object("\n".join(data))
        if event is not None:
            yield event


def _json_object(text: str) -> dict[str, Any] | None:
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


# ------------------------------------------------------------------------------------- the client


class OpenAILLM:
    def __init__(
        self,
        settings: Settings,
        *,
        api_key: str | None = None,
        session: requests.Session | None = None,
        sleep: Callable[[float], None] = time.sleep,
        overrides: Callable[[], tuple[str | None, str | None]] | None = None,
        incidents: IncidentReporter | None = None,
    ) -> None:
        self._settings = settings
        self._incidents = incidents
        self._overrides = overrides
        self._api_key = api_key if api_key is not None else openai_api_key()
        self._session = session or requests.Session()
        self._sleep = sleep

    def _current_settings(self) -> Settings:
        """The configured settings, with the model and effort a feature flag may have changed.
        Read on every call, so a swap in Flagsmith takes effect within a minute with no release."""
        model, effort = self._overrides() if self._overrides else (None, None)
        if not model and not effort:
            return self._settings
        return replace(
            self._settings,
            ai_model=model or self._settings.ai_model,
            ai_effort=effort or self._settings.ai_effort,
        )

    def complete(
        self, *, system: str, tools: Sequence[dict[str, Any]], messages: list[dict[str, Any]]
    ) -> LLMResponse:
        params = build_params(
            self._current_settings(), system=system, tools=tools, messages=messages
        )
        response = self._post(params)
        try:
            body = response.json()
        except ValueError as exc:
            self._log_failure(exc, status=response.status_code, request_id=None)
            raise ServiceUnavailableError(UNAVAILABLE) from exc
        return parse_response(body, response.headers.get("x-request-id"))

    def stream(
        self, *, system: str, tools: Sequence[dict[str, Any]], messages: list[dict[str, Any]]
    ) -> Generator[LLMEvent, None, LLMResponse]:
        """Yields text and tool-start events as the model produces them, then returns the same
        LLMResponse ``complete`` would have. Only the connection is retried (before the first byte);
        once words have reached the person, a failure ends the call rather than repeating them."""
        current = self._current_settings()
        params = {**build_params(current, system=system, tools=tools, messages=messages)}
        params["stream"] = True
        response = self._post(params, stream=True)
        request_id = response.headers.get("x-request-id")
        response.encoding = "utf-8"  # requests would otherwise leave the lines as bytes
        final: dict[str, Any] | None = None
        try:
            for event in sse_events(response.iter_lines(decode_unicode=True)):
                kind = event.get("type")
                if kind == "response.output_text.delta":
                    if event.get("delta"):
                        yield {"type": "text", "text": event["delta"]}
                elif kind == "response.output_item.added":
                    item = event.get("item") or {}
                    if item.get("type") == "function_call":
                        yield {"type": "tool", "name": item.get("name", "")}
                elif kind in ("response.completed", "response.incomplete"):
                    final = event.get("response")
                elif kind in ("response.failed", "error"):
                    self._log_failure(
                        RuntimeError(kind), status=response.status_code, request_id=request_id
                    )
                    raise ServiceUnavailableError(UNAVAILABLE)
        except requests.RequestException as exc:  # the connection broke mid-stream
            self._log_failure(exc, status=None, request_id=request_id)
            raise ServiceUnavailableError(UNAVAILABLE) from exc
        finally:
            response.close()
        if final is None:
            self._log_failure(
                RuntimeError("stream ended early"), status=None, request_id=request_id
            )
            raise ServiceUnavailableError(UNAVAILABLE)
        return parse_response(final, request_id)

    def search(self, *, prompt: str, domains: Sequence[str]) -> str:
        """A web search through the model, limited to ``domains``. Separate from the conversation:
        its result is handed back to the caller as untrusted text, never added to the history."""
        params = {
            "model": self._current_settings().ai_model,
            "input": prompt,
            "tools": [{"type": "web_search", "filters": {"allowed_domains": list(domains)}}],
            "tool_choice": "required",
            "reasoning": {"effort": "low"},
            "max_output_tokens": 2000,
            "store": False,
        }
        body = self._post(params).json()
        texts = [
            part.get("text", "")
            for item in body.get("output", [])
            if item.get("type") == "message"
            for part in item.get("content", [])
            if part.get("type") == "output_text"
        ]
        return "\n".join(texts)

    def _post(self, params: dict[str, Any], *, stream: bool = False) -> requests.Response:
        """One request, retried a bounded number of times with backoff and jitter. A completion
        changes nothing on our side, so repeating it is safe."""
        attempt = 0
        while True:
            retry_after: float | None = None
            try:
                response = self._session.post(
                    RESPONSES_URL,
                    json=params,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    timeout=(10, self._settings.ai_timeout_seconds),
                    stream=stream,
                )
            except requests.RequestException as exc:
                if attempt >= MAX_RETRIES:
                    self._log_failure(exc, status=None, request_id=None)
                    raise ServiceUnavailableError(UNAVAILABLE) from exc
            else:
                if response.status_code == 200:
                    if self._incidents is not None:  # every model call costs: watch the rate
                        self._incidents.record("utsav", "ai_usage_spike")
                    return response
                request_id = response.headers.get("x-request-id")
                if stream:
                    response.close()
                if response.status_code not in RETRYABLE_STATUSES or attempt >= MAX_RETRIES:
                    self._log_failure(
                        requests.HTTPError(f"HTTP {response.status_code}"),
                        status=response.status_code,
                        request_id=request_id,
                    )
                    raise ServiceUnavailableError(UNAVAILABLE)
                retry_after = _retry_after(response)
            attempt += 1
            backoff = min(2.0**attempt, MAX_RETRY_WAIT_SECONDS) * random.uniform(0.5, 1.0)  # noqa: S311  (jitter, not security)
            self._sleep(
                min(retry_after if retry_after is not None else backoff, MAX_RETRY_WAIT_SECONDS)
            )

    def _log_failure(self, exc: Exception, *, status: int | None, request_id: str | None) -> None:
        # Type, status and the provider's request id only: a message can echo prompt text.
        if self._incidents is not None:
            self._incidents.record("utsav", "ai_provider_errors")
        LOGGER.error(
            "ai provider call failed",
            extra={
                "fields": {
                    "error": type(exc).__name__,
                    "status": status,
                    "provider_request_id": request_id,
                }
            },
        )


def _retry_after(response: requests.Response) -> float | None:
    try:
        return max(float(response.headers.get("retry-after", "")), 0.0)
    except ValueError:
        return None


def build_llm(
    settings: Settings,
    flags: FeatureFlags | None = None,
    incidents: IncidentReporter | None = None,
) -> LLM:
    overrides = (lambda: (flags.ai_model(), flags.ai_effort())) if flags else None
    return OpenAILLM(settings, overrides=overrides, incidents=incidents)
