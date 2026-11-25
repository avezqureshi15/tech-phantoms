"""The real Flagsmith SDK, talking to a small local server that speaks Flagsmith's HTTP API.

The wrapper's other tests use a fake client; this one proves the wrapper reads the real SDK's
answers correctly (in particular how it reports a flag that exists versus one that was never
created), which a fake can never show.
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import ClassVar

import pytest
from flagsmith import Flagsmith

from festiveos.integrations.flags import DEFAULTS, FeatureFlags, _default_handler


def flag(name: str, enabled: bool, value=None, id_: int = 1) -> dict:
    return {
        "id": id_,
        "feature": {"id": id_, "name": name, "type": "STANDARD"},
        "enabled": enabled,
        "feature_state_value": value,
    }


FLAGS = [
    flag("elder_mode", False, id_=1),
    flag("utsav", True, id_=2),
    flag("ai_model", True, "gpt-6-luna", id_=3),
    flag("ai_effort", True, "high", id_=4),
    flag("announcement", True, "Back at 10pm", id_=5),
]


class Handler(BaseHTTPRequestHandler):
    seen: ClassVar[list[dict]] = []

    def _send(self, body) -> None:
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        Handler.seen.append(
            {"method": "GET", "path": self.path, "key": self.headers.get("X-Environment-Key")}
        )
        self._send(FLAGS)

    def do_POST(self) -> None:
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        Handler.seen.append({"method": "POST", "path": self.path, "body": json.loads(raw or b"{}")})
        self._send({"flags": FLAGS, "traits": []})

    def log_message(self, *_args) -> None:  # keep test output quiet
        pass


@pytest.fixture
def server():
    Handler.seen = []
    httpd = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_port}/api/v1/"
    httpd.shutdown()


def real_flags(url: str) -> FeatureFlags:
    client = Flagsmith(
        environment_key="test-key",
        api_url=url,
        request_timeout_seconds=3,
        default_flag_handler=_default_handler,
    )
    return FeatureFlags(client)


def test_the_real_sdk_reports_what_flagsmith_says_and_keeps_defaults_for_flags_never_created(
    server,
) -> None:
    seen = real_flags(server).for_user("user-1")

    assert seen.enabled("elder_mode") is False  # switched off in Flagsmith
    assert seen.enabled("utsav") is True
    assert (
        seen.enabled("recite_mode") is DEFAULTS["recite_mode"]
    )  # never created: the code's default
    assert seen.enabled("receipt_scan") is DEFAULTS["receipt_scan"]


def test_remote_settings_come_through_the_real_sdk(server) -> None:
    flags = real_flags(server)

    assert flags.ai_model() == "gpt-6-luna"
    assert flags.ai_effort() == "high"
    assert flags.for_user("user-1").value("announcement") == "Back at 10pm"


def test_only_the_user_id_is_sent_to_flagsmith_with_no_traits(server) -> None:
    real_flags(server).for_user("7355b4d2-95a1-4cc9-81f2-abd7b50afa79")

    posts = [r for r in Handler.seen if r["method"] == "POST"]
    assert posts
    assert posts[-1]["body"]["identifier"] == "7355b4d2-95a1-4cc9-81f2-abd7b50afa79"
    assert not posts[-1]["body"].get("traits")
    assert "email" not in json.dumps(posts[-1]["body"]).lower()


def test_an_unreachable_flagsmith_means_defaults_not_errors() -> None:
    flags = real_flags("http://127.0.0.1:9/api/v1/")  # nothing listens here

    assert flags.for_user("user-1").features == DEFAULTS
