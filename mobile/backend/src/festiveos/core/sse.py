"""Server-sent events: framing, and turning a stream that fails midway into a final error event.

Once the first byte of a streamed response is sent the status code is fixed at 200, so a failure
after that point can only be reported inside the stream. Checks that can fail before it starts
(authorisation, validation, a busy server) should run first so they still get a real status code;
see the AI service.
"""

import json
import logging
from collections.abc import Iterator
from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse

from festiveos.core.errors import ERROR_STATUS

LOGGER = logging.getLogger("festiveos.sse")
HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",  # tell nginx-style proxies not to hold the stream back
}
GENERIC_ERROR = "Something went wrong. Please try again."


def frame(event: dict[str, Any]) -> str:
    """``{"type": "text", "text": "hi"}`` becomes ``event: text`` then ``data: {"text":"hi"}``."""
    payload = {key: value for key, value in event.items() if key != "type"}
    data = json.dumps(jsonable_encoder(payload), ensure_ascii=False, separators=(",", ":"))
    return f"event: {event['type']}\ndata: {data}\n\n"


def frames(events: Iterator[dict[str, Any]]) -> Iterator[str]:
    try:
        for event in events:
            yield frame(event)
    except Exception as exc:
        status = ERROR_STATUS.get(type(exc))
        if status is None:
            LOGGER.exception("stream failed")
            status, message = 500, GENERIC_ERROR
        else:
            message = str(exc)
        yield frame({"type": "error", "status": status, "message": message})
    finally:
        close = getattr(events, "close", None)
        if close is not None:
            close()  # the person left: let the work behind the stream clean up


def sse_response(events: Iterator[dict[str, Any]]) -> StreamingResponse:
    return StreamingResponse(frames(events), media_type="text/event-stream", headers=HEADERS)
