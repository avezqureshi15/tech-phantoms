import json
import logging
import re
import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from festiveos.core.errors import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError
from festiveos.core.log import (
    JsonFormatter,
    RequestContext,
    logged,
    logged_service,
    request_ctx_var,
)
from festiveos.main import create_app
from tests.support import auth

SERVICE_LOG = "festiveos.service"


@logged_service
class Demo:
    def ok(self, user_id: uuid.UUID, token: str, count: int) -> str:
        return "fine"

    def missing(self) -> None:
        raise NotFoundError("nope")

    def forbidden(self) -> None:
        raise ForbiddenError("no")

    def unauthorized(self) -> None:
        raise UnauthorizedError("who?")

    def conflict(self) -> None:
        raise ConflictError("dup")

    def explode(self) -> None:
        raise RuntimeError("kaboom")

    def _private(self) -> str:
        return "not woven"


@pytest.fixture
def service_logs(caplog: pytest.LogCaptureFixture):
    caplog.set_level(logging.DEBUG, logger="festiveos")
    return lambda: [r for r in caplog.records if r.name == SERVICE_LOG]


def test_successful_calls_are_logged_with_safe_arguments(service_logs) -> None:
    uid = uuid.uuid4()

    assert Demo().ok(uid, "super-secret-token", 3) == "fine"

    (record,) = service_logs()
    assert record.levelno == logging.INFO
    assert record.fields["call"] == "Demo.ok"
    assert record.fields["outcome"] == "ok"
    assert record.fields["duration_ms"] >= 0
    assert record.fields["args"] == {"user_id": str(uid), "token": "<str>", "count": 3}


def test_secrets_never_reach_the_logs(service_logs, caplog: pytest.LogCaptureFixture) -> None:
    Demo().ok(uuid.uuid4(), "google:sub:someone@example.com", 1)

    assert "someone@example.com" not in caplog.text
    assert "google:sub" not in caplog.text


@pytest.mark.parametrize(
    ("method", "level"),
    [
        ("missing", logging.INFO),
        ("conflict", logging.INFO),
        ("forbidden", logging.WARNING),
        ("unauthorized", logging.WARNING),
    ],
)
def test_expected_rejections_are_logged_without_a_traceback(
    service_logs, method: str, level: int
) -> None:
    with pytest.raises((NotFoundError, ConflictError, ForbiddenError, UnauthorizedError)):
        getattr(Demo(), method)()

    (record,) = service_logs()
    assert record.levelno == level
    assert record.fields["outcome"] == "rejected"
    assert record.exc_info is None


def test_unexpected_errors_are_logged_with_a_traceback_and_reraised(service_logs) -> None:
    with pytest.raises(RuntimeError, match="kaboom"):
        Demo().explode()

    (record,) = service_logs()
    assert record.levelno == logging.ERROR
    assert record.fields["outcome"] == "error"
    assert record.exc_info is not None


def test_private_methods_are_not_woven(service_logs) -> None:
    assert Demo()._private() == "not woven"
    assert service_logs() == []


def test_the_aspect_preserves_function_metadata() -> None:
    @logged
    def documented(self) -> None:
        """Docstring."""

    assert documented.__name__ == "documented"
    assert documented.__doc__ == "Docstring."


def test_json_formatter_emits_parseable_lines_with_request_context() -> None:
    token = request_ctx_var.set(RequestContext(request_id="req-1234", user_id="u-1"))
    try:
        record = logging.LogRecord(
            "festiveos.x", logging.INFO, __file__, 1, "hello %s", ("world",), None
        )
        record.fields = {"duration_ms": 4.2}
        line = json.loads(JsonFormatter().format(record))
    finally:
        request_ctx_var.reset(token)

    assert line["message"] == "hello world"
    assert line["level"] == "INFO"
    assert line["request_id"] == "req-1234"
    assert line["user_id"] == "u-1"
    assert line["duration_ms"] == 4.2
    datetime.fromisoformat(line["ts"])


def test_every_response_carries_a_request_id_and_server_time(client: TestClient) -> None:
    response = client.get("/health")

    assert re.fullmatch(r"[0-9a-f]{32}", response.headers["x-request-id"])
    datetime.fromisoformat(response.headers["x-server-time"])


def test_a_sane_inbound_request_id_is_reused_and_a_hostile_one_replaced(client: TestClient) -> None:
    reused = client.get("/health", headers={"X-Request-ID": "trace-abc_123.xyz"})
    replaced = client.get("/health", headers={"X-Request-ID": "x\r\nInjected: header"})

    assert reused.headers["x-request-id"] == "trace-abc_123.xyz"
    assert "Injected" not in replaced.headers["x-request-id"]
    assert re.fullmatch(r"[0-9a-f]{32}", replaced.headers["x-request-id"])


def test_requests_are_logged_with_route_template_status_and_user(
    client: TestClient, make_user, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="festiveos")
    user = make_user("dad@example.com")
    hid = client.post("/api/v1/households", json={"name": "Raju"}, headers=auth(user)).json()["id"]
    caplog.clear()

    client.get(f"/api/v1/households/{hid}", headers=auth(user))

    (record,) = [r for r in caplog.records if r.name == "festiveos.http"]
    assert record.fields["method"] == "GET"
    assert record.fields["path"] == "/api/v1/households/{household_id}"  # template, not the raw id
    assert record.fields["status"] == 200
    assert record.fields["user_id"] == str(user.id)
    assert record.fields["duration_ms"] >= 0
    assert hid not in caplog.text.replace(str(user.id), "")  # raw ids stay out of the path field


def test_unhandled_errors_return_a_clean_500_with_the_request_id(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = create_app()

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("database password is hunter2")

    caplog.set_level(logging.INFO, logger="festiveos")
    response = TestClient(app).get("/boom")

    assert response.status_code == 500
    body = response.json()
    assert body["detail"] == "Internal server error"
    assert body["request_id"] == response.headers["x-request-id"]
    assert "hunter2" not in response.text  # internals are not leaked to the caller
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert errors  # ...but they are logged for operators
    assert errors[0].exc_info is not None
