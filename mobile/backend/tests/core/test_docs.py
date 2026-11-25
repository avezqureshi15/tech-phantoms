from fastapi.testclient import TestClient

from festiveos.main import create_app


def paths(client: TestClient) -> dict[str, int]:
    return {p: client.get(p).status_code for p in ("/docs", "/redoc", "/openapi.json")}


def test_api_docs_are_not_public_by_default() -> None:
    assert paths(TestClient(create_app())) == {"/docs": 404, "/redoc": 404, "/openapi.json": 404}


def test_api_docs_can_be_enabled_explicitly() -> None:
    assert paths(TestClient(create_app(enable_docs=True))) == {
        "/docs": 200,
        "/redoc": 200,
        "/openapi.json": 200,
    }


def test_environment_flag_controls_docs(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_API_DOCS", "true")
    assert TestClient(create_app()).get("/openapi.json").status_code == 200
    monkeypatch.setenv("ENABLE_API_DOCS", "false")
    assert TestClient(create_app()).get("/openapi.json").status_code == 404
