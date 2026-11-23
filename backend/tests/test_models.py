import json

import pytest

from app.models import (
    AnswerAckMessage,
    AnswerCountMessage,
    AnswerMessage,
    ErrorMessage,
    JoinedMessage,
    JoinMessage,
    KickedMessage,
    KickMessage,
    LeaderboardMessage,
    LobbyMessage,
    NextMessage,
    QuestionMessage,
    RevealMessage,
    StartMessage,
    parse_client_message,
)
from app.rooms import (
    AnswerCount,
    ErrorCode,
    PlayerResult,
    Question,
    QuestionView,
    Ranking,
    Reveal,
    Room,
    RoomError,
)

# --- client -> server -------------------------------------------------------


def test_parse_join_player() -> None:
    msg = parse_client_message('{"type": "join", "name": "Omar"}')
    assert msg == JoinMessage(type="join", name="Omar", host_token=None)


def test_parse_join_host() -> None:
    msg = parse_client_message('{"type": "join", "name": "Host", "host_token": "abc"}')
    assert isinstance(msg, JoinMessage)
    assert msg.host_token == "abc"


def test_parse_start() -> None:
    assert parse_client_message('{"type": "start"}') == StartMessage(type="start")


def test_parse_answer() -> None:
    msg = parse_client_message('{"type": "answer", "question_id": 3, "choice": 1}')
    assert msg == AnswerMessage(type="answer", question_id=3, choice=1)


def test_parse_kick() -> None:
    msg = parse_client_message('{"type": "kick", "name": "Omar"}')
    assert msg == KickMessage(type="kick", name="Omar")


def test_parse_next() -> None:
    assert parse_client_message('{"type": "next"}') == NextMessage(type="next")


def test_parse_accepts_bytes() -> None:
    assert isinstance(parse_client_message(b'{"type": "start"}'), StartMessage)


def test_extra_fields_ignored() -> None:
    msg = parse_client_message('{"type": "start", "future_field": 1}')
    assert msg == StartMessage(type="start")


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        "",
        "[]",
        '"join"',
        "{}",
        '{"type": "dance"}',
        '{"type": 1}',
        '{"type": "join"}',
        '{"type": "join", "name": 5}',
        '{"type": "kick"}',
        '{"type": "answer", "choice": 1}',
        '{"type": "answer", "question_id": 0}',
        '{"type": "answer", "question_id": 0, "choice": "1"}',
        '{"type": "answer", "question_id": 0, "choice": true}',
        '{"type": "answer", "question_id": 0, "choice": 1.5}',
        '{"type": "answer", "question_id": 0, "choice": null}',
        '{"type": "answer", "question_id": "0", "choice": 1}',
    ],
)
def test_malformed_messages_are_bad_message(raw: str) -> None:
    with pytest.raises(RoomError) as exc:
        parse_client_message(raw)
    assert exc.value.code == ErrorCode.BAD_MESSAGE
    assert exc.value.message


def test_bad_message_does_not_echo_input() -> None:
    with pytest.raises(RoomError) as exc:
        parse_client_message('{"type": "answer", "question_id": 0, "choice": "SECRET"}')
    assert "SECRET" not in exc.value.message


# --- server -> client -------------------------------------------------------


def dump(msg) -> dict:
    """Serialise exactly as the WebSocket layer will, via a real JSON round trip."""
    return json.loads(json.dumps(msg.model_dump(mode="json")))


def test_joined() -> None:
    msg = JoinedMessage(role="player", name="Omar")
    assert dump(msg) == {"type": "joined", "role": "player", "name": "Omar"}


def test_lobby() -> None:
    assert dump(LobbyMessage(players=["A", "B"])) == {"type": "lobby", "players": ["A", "B"]}


def test_question_from_view_has_no_correct_answer() -> None:
    view = QuestionView(
        id=0,
        index=0,
        total=5,
        text="What is 2+2?",
        options=["3", "4", "5", "6"],
        time_limit=20,
        ends_at=1020.5,
        server_time=1000.5,
    )
    assert dump(QuestionMessage.model_validate(view)) == {
        "type": "question",
        "id": 0,
        "index": 0,
        "total": 5,
        "text": "What is 2+2?",
        "options": ["3", "4", "5", "6"],
        "time_limit": 20,
        "ends_at": 1020.5,
        "server_time": 1000.5,
    }


def test_answer_ack_and_count() -> None:
    assert dump(AnswerAckMessage(question_id=2)) == {"type": "answer_ack", "question_id": 2}
    count = AnswerCountMessage.model_validate(AnswerCount(question_id=2, answered=1, total=3))
    assert dump(count) == {"type": "answer_count", "question_id": 2, "answered": 1, "total": 3}


def test_reveal_matches_protocol_example() -> None:
    reveal = Reveal(
        question_id=3,
        correct=1,
        distribution=[2, 9, 1, 0],
        results=[
            PlayerResult("Mahima", True, 900, 2700),
            PlayerResult("Omar", False, 0, 1800),
        ],
    )
    assert dump(RevealMessage.model_validate(reveal)) == {
        "type": "reveal",
        "question_id": 3,
        "correct": 1,
        "distribution": [2, 9, 1, 0],
        "results": [
            {"name": "Mahima", "correct": True, "points": 900, "total": 2700},
            {"name": "Omar", "correct": False, "points": 0, "total": 1800},
        ],
    }


def test_leaderboard_matches_protocol_example() -> None:
    rankings = [Ranking(1, "Mahima", 7400), Ranking(2, "Omar", 6900)]
    assert dump(LeaderboardMessage(rankings=rankings)) == {
        "type": "leaderboard",
        "rankings": [
            {"rank": 1, "name": "Mahima", "score": 7400},
            {"rank": 2, "name": "Omar", "score": 6900},
        ],
    }


def test_kicked() -> None:
    assert dump(KickedMessage()) == {"type": "kicked"}


def test_error_from_room_error() -> None:
    msg = ErrorMessage.from_error(RoomError(ErrorCode.TIME_UP, "time is up"))
    assert dump(msg) == {"type": "error", "code": "TIME_UP", "message": "time is up"}


def test_messages_from_a_real_room() -> None:
    room = Room("QC-1", [Question("Q", ["a", "b"], correct=0)], 20, clock=lambda: 100.0)
    room.add_player("Omar")
    question = dump(QuestionMessage.model_validate(room.start(room.host_token)))
    assert "correct" not in question
    room.submit_answer("Omar", 0, 0)
    reveal = dump(RevealMessage.model_validate(room.end_question()))
    assert reveal["results"] == [{"name": "Omar", "correct": True, "points": 1000, "total": 1000}]
    board = dump(LeaderboardMessage(rankings=room.advance()))
    assert board["rankings"] == [{"rank": 1, "name": "Omar", "score": 1000}]
