import pytest
from fastapi.testclient import TestClient

from app.main import create_app

VALID_BODY = {
    "time_limit": 20,
    "questions": [{"text": "What is 2+2?", "options": ["3", "4", "5", "6"], "correct": 1}],
}


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_room(client: TestClient) -> None:
    response = client.post("/rooms", json=VALID_BODY)
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"code", "host_token"}
    assert body["code"].startswith("QC-")
    assert body["host_token"]


def test_each_room_gets_its_own_code_and_token(client: TestClient) -> None:
    first = client.post("/rooms", json=VALID_BODY).json()
    second = client.post("/rooms", json=VALID_BODY).json()
    assert first["code"] != second["code"]
    assert first["host_token"] != second["host_token"]


def with_question(**changes) -> dict:
    return {**VALID_BODY, "questions": [{**VALID_BODY["questions"][0], **changes}]}


@pytest.mark.parametrize(
    "body",
    [
        {},
        {**VALID_BODY, "time_limit": 0},
        {**VALID_BODY, "time_limit": -5},
        {**VALID_BODY, "time_limit": "soon"},
        {**VALID_BODY, "questions": []},
        with_question(text=""),
        with_question(options=["only"]),
        with_question(options=["a", ""]),
        with_question(correct=4),
        with_question(correct=-1),
        with_question(correct="1"),
        with_question(correct=True),
    ],
)
def test_create_room_invalid(client: TestClient, body: dict) -> None:
    assert client.post("/rooms", json=body).status_code == 422


def test_get_room(client: TestClient) -> None:
    code = client.post("/rooms", json=VALID_BODY).json()["code"]
    response = client.get(f"/rooms/{code}")
    assert response.status_code == 200
    assert response.json() == {"code": code, "state": "LOBBY", "player_count": 0}


def test_get_room_counts_players(client: TestClient) -> None:
    code = client.post("/rooms", json=VALID_BODY).json()["code"]
    room = client.app.state.registry.get(code).room
    room.add_player("Omar")
    room.add_player("Mahima")
    assert client.get(f"/rooms/{code}").json()["player_count"] == 2


def test_get_room_accepts_lowercase_code(client: TestClient) -> None:
    code = client.post("/rooms", json=VALID_BODY).json()["code"]
    assert client.get(f"/rooms/{code.lower()}").status_code == 200


def test_get_room_shows_started_state(client: TestClient) -> None:
    created = client.post("/rooms", json=VALID_BODY).json()
    room = client.app.state.registry.get(created["code"]).room
    room.add_player("Omar")
    room.start(created["host_token"])
    assert client.get(f"/rooms/{created['code']}").json()["state"] == "QUESTION"


def test_get_missing_room(client: TestClient) -> None:
    assert client.get("/rooms/QC-0000").status_code == 404


VERCEL = "https://quizcircuit.vercel.app"


def preflight(client: TestClient, origin: str):
    """What the browser asks before a cross-site POST /rooms."""
    return client.options(
        "/rooms",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )


def test_cors_allows_the_frontend(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRONTEND_ORIGIN", f"{VERCEL}/")  # a trailing slash is fine
    client = TestClient(create_app())
    assert preflight(client, VERCEL).headers["access-control-allow-origin"] == VERCEL
    response = client.get("/health", headers={"Origin": VERCEL})
    assert response.headers["access-control-allow-origin"] == VERCEL


def test_cors_rejects_other_sites(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRONTEND_ORIGIN", VERCEL)
    client = TestClient(create_app())
    response = preflight(client, "https://evil.example")
    assert "access-control-allow-origin" not in response.headers


def test_no_cors_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FRONTEND_ORIGIN", raising=False)
    response = TestClient(create_app()).get("/health", headers={"Origin": VERCEL})
    assert "access-control-allow-origin" not in response.headers
