"""End-to-end protocol tests over real WebSocket connections (TestClient).

The client is used as a context manager so every socket shares one event loop,
like a real server. Each test only reads messages it knows will arrive, since
receive_json() blocks.
"""

import time
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

import app.ws
from app.live import CLOSE_KICKED, CLOSE_REPLACED
from app.main import create_app
from app.ws import CLOSE_JOIN_TIMEOUT, CLOSE_ROOM_NOT_FOUND

QUESTION = {"text": "2+2?", "options": ["3", "4", "5", "6"], "correct": 1}


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app(reveal_pause=0)) as client:
        yield client


def create_room(client: TestClient, questions: int = 2, time_limit: float = 20) -> dict[str, str]:
    body = {"time_limit": time_limit, "questions": [QUESTION] * questions}
    return client.post("/rooms", json=body).json()


def join(ws: WebSocketTestSession, name: str, host_token: str | None = None) -> dict[str, Any]:
    message: dict[str, Any] = {"type": "join", "name": name}
    if host_token is not None:
        message["host_token"] = host_token
    ws.send_json(message)
    return ws.receive_json()


def expect(ws: WebSocketTestSession, *types: str) -> list[dict[str, Any]]:
    messages = [ws.receive_json() for _ in types]
    assert [m["type"] for m in messages] == list(types)
    return messages


def expect_error(ws: WebSocketTestSession, code: str) -> None:
    message = ws.receive_json()
    assert message["type"] == "error", message
    assert message["code"] == code
    assert message["message"]


def expect_closed(ws: WebSocketTestSession, code: int) -> None:
    with pytest.raises(WebSocketDisconnect) as exc:
        ws.receive_json()
    assert exc.value.code == code


# --- full game ----------------------------------------------------------------


def test_full_game(client: TestClient) -> None:
    room = create_room(client, questions=2)
    url = f"/ws/{room['code']}"
    with (
        client.websocket_connect(url) as host,
        client.websocket_connect(url) as a,
        client.websocket_connect(url) as b,
    ):
        assert join(host, "Host", room["host_token"]) == {
            "type": "joined",
            "role": "host",
            "name": "Host",
        }
        assert expect(host, "lobby")[0]["players"] == []

        assert join(a, "Mahima") == {"type": "joined", "role": "player", "name": "Mahima"}
        expect(a, "lobby")
        expect(host, "lobby")
        join(b, "Omar")
        for ws in (host, a, b):
            assert expect(ws, "lobby")[0]["players"] == ["Mahima", "Omar"]

        for question_id in (0, 1):
            if question_id == 0:
                host.send_json({"type": "start"})
            for ws in (host, a, b):
                question = expect(ws, "question")[0]
                assert question["id"] == question_id
                assert question["total"] == 2
                assert question["ends_at"] - question["server_time"] == pytest.approx(20, abs=1)
                assert "correct" not in question

            a.send_json({"type": "answer", "question_id": question_id, "choice": 1})
            assert expect(a, "answer_ack", "answer_count")[1]["answered"] == 1
            for ws in (host, b):
                expect(ws, "answer_count")
            b.send_json({"type": "answer", "question_id": question_id, "choice": 0})
            expect(b, "answer_ack")
            for ws in (host, a, b):
                count, reveal = expect(ws, "answer_count", "reveal")
                assert count == {
                    "type": "answer_count",
                    "question_id": question_id,
                    "answered": 2,
                    "total": 2,
                }
                assert reveal["correct"] == 1
                assert reveal["distribution"] == [1, 1, 0, 0]
                results = {r["name"]: r for r in reveal["results"]}
                assert results["Mahima"]["correct"] is True
                assert results["Mahima"]["points"] > 900  # answered within a second
                assert results["Omar"] == {
                    "name": "Omar",
                    "correct": False,
                    "points": 0,
                    "total": 0,
                }

        for ws in (host, a, b):
            rankings = expect(ws, "leaderboard")[0]["rankings"]
            assert [(r["rank"], r["name"]) for r in rankings] == [(1, "Mahima"), (2, "Omar")]
            assert rankings[1]["score"] == 0


def test_finished_room_is_removed_after_everyone_leaves(client: TestClient) -> None:
    room = create_room(client, questions=1)
    url = f"/ws/{room['code']}"
    with client.websocket_connect(url) as host, client.websocket_connect(url) as a:
        join(host, "Host", room["host_token"])
        join(a, "A")
        host.send_json({"type": "start"})
        a.send_json({"type": "answer", "question_id": 0, "choice": 1})
        expect(a, "lobby", "question", "answer_ack", "answer_count", "reveal", "leaderboard")
    deadline = time.monotonic() + 2
    while client.get(f"/rooms/{room['code']}").status_code != 404:
        assert time.monotonic() < deadline, "room was not cleaned up"
        time.sleep(0.01)


# --- connecting and joining ---------------------------------------------------


def test_unknown_room(client: TestClient) -> None:
    with client.websocket_connect("/ws/QC-0000") as ws:
        expect_error(ws, "ROOM_NOT_FOUND")
        expect_closed(ws, CLOSE_ROOM_NOT_FOUND)


def test_lowercase_code_works(client: TestClient) -> None:
    room = create_room(client)
    with client.websocket_connect(f"/ws/{room['code'].lower()}") as ws:
        assert join(ws, "A")["type"] == "joined"


@pytest.mark.parametrize(
    "first",
    ["not json", '{"type": "start"}', '{"type": "answer", "question_id": 0, "choice": 0}'],
)
def test_must_join_first_and_can_then_join(client: TestClient, first: str) -> None:
    room = create_room(client)
    with client.websocket_connect(f"/ws/{room['code']}") as ws:
        ws.send_text(first)
        expect_error(ws, "BAD_MESSAGE")
        assert join(ws, "A")["type"] == "joined"


def test_binary_frames_accepted(client: TestClient) -> None:
    room = create_room(client)
    with client.websocket_connect(f"/ws/{room['code']}") as ws:
        ws.send_bytes(b'{"type": "join", "name": "A"}')
        assert ws.receive_json()["type"] == "joined"


def test_failed_join_can_retry(client: TestClient) -> None:
    room = create_room(client)
    url = f"/ws/{room['code']}"
    with client.websocket_connect(url) as a, client.websocket_connect(url) as b:
        join(a, "Omar")
        assert join(b, "omar")["code"] == "NAME_TAKEN"
        assert join(b, "   ")["code"] == "NAME_INVALID"
        assert join(b, "x" * 21)["code"] == "NAME_INVALID"
        assert join(b, "Mahima") == {"type": "joined", "role": "player", "name": "Mahima"}


def test_wrong_host_token_is_not_host(client: TestClient) -> None:
    room = create_room(client)
    with client.websocket_connect(f"/ws/{room['code']}") as ws:
        assert join(ws, "Host", "wrong")["code"] == "NOT_HOST"
        assert join(ws, "Host", room["host_token"])["role"] == "host"


def test_join_after_start(client: TestClient) -> None:
    room = create_room(client)
    url = f"/ws/{room['code']}"
    with client.websocket_connect(url) as host, client.websocket_connect(url) as a:
        join(host, "Host", room["host_token"])
        join(a, "A")
        host.send_json({"type": "start"})
        expect(host, "lobby", "lobby", "question")
        with client.websocket_connect(url) as late:
            assert join(late, "Late")["code"] == "GAME_STARTED"


def test_join_timeout(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(app.ws, "JOIN_TIMEOUT", 0.05)
    room = create_room(client)
    with client.websocket_connect(f"/ws/{room['code']}") as ws:
        expect_closed(ws, CLOSE_JOIN_TIMEOUT)


def test_second_join_is_wrong_state(client: TestClient) -> None:
    room = create_room(client)
    with client.websocket_connect(f"/ws/{room['code']}") as ws:
        join(ws, "A")
        expect(ws, "lobby")
        assert join(ws, "B")["code"] == "WRONG_STATE"


# --- roles and state ----------------------------------------------------------


def test_player_cannot_use_host_actions(client: TestClient) -> None:
    room = create_room(client)
    url = f"/ws/{room['code']}"
    with client.websocket_connect(url) as a, client.websocket_connect(url) as b:
        join(a, "A")
        join(b, "B")
        expect(a, "lobby", "lobby")
        a.send_json({"type": "start"})
        expect_error(a, "NOT_HOST")
        a.send_json({"type": "kick", "name": "B"})
        expect_error(a, "NOT_HOST")


def test_host_errors(client: TestClient) -> None:
    room = create_room(client)
    url = f"/ws/{room['code']}"
    with client.websocket_connect(url) as host, client.websocket_connect(url) as a:
        join(host, "Host", room["host_token"])
        host.send_json({"type": "start"})
        expect(host, "lobby")
        expect_error(host, "WRONG_STATE")  # no players yet
        join(a, "A")
        host.send_json({"type": "start"})
        expect(host, "lobby", "question")
        host.send_json({"type": "start"})
        expect_error(host, "WRONG_STATE")
        host.send_json({"type": "answer", "question_id": 0, "choice": 1})
        expect_error(host, "WRONG_STATE")
        host.send_json({"type": "kick", "name": "A"})
        expect_error(host, "WRONG_STATE")


def test_answer_errors(client: TestClient) -> None:
    room = create_room(client)
    url = f"/ws/{room['code']}"
    with (
        client.websocket_connect(url) as host,
        client.websocket_connect(url) as a,
        client.websocket_connect(url) as b,
    ):
        join(host, "Host", room["host_token"])
        join(a, "A")
        join(b, "B")
        a.send_json({"type": "answer", "question_id": 0, "choice": 1})
        expect(a, "lobby", "lobby")
        expect_error(a, "WRONG_STATE")  # still in lobby
        host.send_json({"type": "start"})
        expect(a, "question")
        for bad in ({"choice": "1"}, {"choice": 4}, {"choice": True}, {"question_id": 1}):
            a.send_json({"type": "answer", "question_id": 0, "choice": 1, **bad})
            expect_error(a, "BAD_MESSAGE")
        a.send_json({"type": "answer", "question_id": 0, "choice": 1})
        expect(a, "answer_ack", "answer_count")
        a.send_json({"type": "answer", "question_id": 0, "choice": 2})
        expect_error(a, "ALREADY_ANSWERED")


def test_late_answer_is_time_up(client: TestClient) -> None:
    room = create_room(client, questions=2, time_limit=0.1)
    url = f"/ws/{room['code']}"
    with client.websocket_connect(url) as host, client.websocket_connect(url) as a:
        join(host, "Host", room["host_token"])
        join(a, "A")
        host.send_json({"type": "start"})
        expect(a, "lobby", "question")
        time.sleep(0.15)  # past the deadline
        a.send_json({"type": "answer", "question_id": 0, "choice": 1})
        expect_error_skipping(a, "TIME_UP")


def expect_error_skipping(ws: WebSocketTestSession, code: str) -> None:
    """The timer may send reveal/question first; skip those until the error."""
    for _ in range(5):
        message = ws.receive_json()
        if message["type"] == "error":
            assert message["code"] == code
            return
        assert message["type"] in ("reveal", "question", "leaderboard")
    raise AssertionError("no error received")


def test_unknown_message_type(client: TestClient) -> None:
    room = create_room(client)
    with client.websocket_connect(f"/ws/{room['code']}") as ws:
        join(ws, "A")
        expect(ws, "lobby")
        ws.send_json({"type": "dance"})
        expect_error(ws, "BAD_MESSAGE")


# --- kick, leave, rejoin --------------------------------------------------------


def test_kick(client: TestClient) -> None:
    room = create_room(client)
    url = f"/ws/{room['code']}"
    with (
        client.websocket_connect(url) as host,
        client.websocket_connect(url) as a,
        client.websocket_connect(url) as b,
    ):
        join(host, "Host", room["host_token"])
        join(a, "A")
        join(b, "B")
        expect(host, "lobby", "lobby", "lobby")
        expect(a, "lobby", "lobby")
        host.send_json({"type": "kick", "name": "A"})
        expect(a, "kicked")
        expect_closed(a, CLOSE_KICKED)
        assert expect(host, "lobby")[0]["players"] == ["B"]


def test_player_leaving_lobby_updates_host(client: TestClient) -> None:
    room = create_room(client)
    url = f"/ws/{room['code']}"
    with client.websocket_connect(url) as host:
        join(host, "Host", room["host_token"])
        expect(host, "lobby")
        with client.websocket_connect(url) as a:
            join(a, "A")
            expect(host, "lobby")
        assert expect(host, "lobby")[0]["players"] == []


def test_host_rejoin_mid_game(client: TestClient) -> None:
    room = create_room(client)
    url = f"/ws/{room['code']}"
    with client.websocket_connect(url) as a, client.websocket_connect(url) as b:
        join(a, "A")
        join(b, "B")
        with client.websocket_connect(url) as host:
            join(host, "Host", room["host_token"])
            host.send_json({"type": "start"})
            expect(host, "lobby", "question")
        a.send_json({"type": "answer", "question_id": 0, "choice": 1})
        expect(a, "lobby", "lobby", "question", "answer_ack", "answer_count")
        with client.websocket_connect(url) as host:
            join(host, "Host", room["host_token"])
            question, count = expect(host, "question", "answer_count")
            assert "correct" not in question
            assert count["answered"] == 1


def test_new_host_connection_replaces_old(client: TestClient) -> None:
    room = create_room(client)
    url = f"/ws/{room['code']}"
    with client.websocket_connect(url) as old, client.websocket_connect(url) as new:
        join(old, "Host", room["host_token"])
        expect(old, "lobby")
        join(new, "Host", room["host_token"])
        expect_closed(old, CLOSE_REPLACED)
        expect(new, "lobby")
