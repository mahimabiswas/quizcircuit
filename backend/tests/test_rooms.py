from dataclasses import fields

import pytest

from app.rooms import (
    MAX_PLAYERS,
    ErrorCode,
    PlayerResult,
    Question,
    QuestionView,
    Ranking,
    Room,
    RoomError,
    State,
)

TIME_LIMIT = 20
START = 1_000_000.0


class FakeClock:
    def __init__(self) -> None:
        self.now = START

    def __call__(self) -> float:
        return self.now


def make_questions(n: int = 2) -> list[Question]:
    return [Question(f"Q{i}", ["a", "b", "c", "d"], correct=1) for i in range(n)]


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def room(clock: FakeClock) -> Room:
    return Room("QC-1234", make_questions(), TIME_LIMIT, clock=clock)


def started(room: Room, *names: str) -> Room:
    for name in names:
        room.add_player(name)
    room.start(room.host_token)
    return room


def assert_error(code: ErrorCode, fn, *args) -> None:
    with pytest.raises(RoomError) as exc:
        fn(*args)
    assert exc.value.code == code


# --- construction -----------------------------------------------------------


@pytest.mark.parametrize(
    ("questions", "time_limit"),
    [
        ([], TIME_LIMIT),
        ([Question("Q", ["only"], 0)], TIME_LIMIT),
        ([Question("Q", ["a", "b"], 2)], TIME_LIMIT),
        ([Question("Q", ["a", "b"], -1)], TIME_LIMIT),
        (make_questions(1), 0),
    ],
)
def test_invalid_room_rejected(questions: list[Question], time_limit: float) -> None:
    with pytest.raises(ValueError):
        Room("QC-1", questions, time_limit)


def test_new_room_is_lobby_with_host_token(room: Room) -> None:
    assert room.state == State.LOBBY
    assert room.host_token
    assert room.lobby_names() == []


# --- joining ----------------------------------------------------------------


def test_add_player_trims_name(room: Room) -> None:
    assert room.add_player("  Omar  ").name == "Omar"
    assert room.lobby_names() == ["Omar"]


@pytest.mark.parametrize("name", ["", "   ", "x" * 21, "bad\nname", "tab\tname"])
def test_invalid_names_rejected(room: Room, name: str) -> None:
    assert_error(ErrorCode.NAME_INVALID, room.add_player, name)


def test_twenty_character_name_allowed(room: Room) -> None:
    room.add_player("x" * 20)


def test_duplicate_name_is_case_insensitive(room: Room) -> None:
    room.add_player("Omar")
    assert_error(ErrorCode.NAME_TAKEN, room.add_player, " omar ")


def test_room_full_at_cap(room: Room) -> None:
    for i in range(MAX_PLAYERS):
        room.add_player(f"p{i}")
    assert_error(ErrorCode.ROOM_FULL, room.add_player, "late")


def test_name_reusable_after_leaving_lobby(room: Room) -> None:
    room.add_player("Omar")
    room.remove_player("Omar")
    room.add_player("Omar")
    assert room.lobby_names() == ["Omar"]


def test_join_after_start_rejected(room: Room) -> None:
    started(room, "Omar")
    assert_error(ErrorCode.GAME_STARTED, room.add_player, "Late")


def test_lobby_keeps_join_order(room: Room) -> None:
    for name in ["C", "A", "B"]:
        room.add_player(name)
    assert room.lobby_names() == ["C", "A", "B"]


# --- host -------------------------------------------------------------------


@pytest.mark.parametrize("token", [None, "", "wrong"])
def test_start_requires_host(room: Room, token: str | None) -> None:
    room.add_player("Omar")
    assert_error(ErrorCode.NOT_HOST, room.start, token)
    assert room.state == State.LOBBY


def test_kick_requires_host(room: Room) -> None:
    room.add_player("Omar")
    assert_error(ErrorCode.NOT_HOST, room.kick, "wrong", "Omar")


def test_kick_removes_player(room: Room) -> None:
    room.add_player("Omar")
    room.add_player("Mahima")
    assert room.kick(room.host_token, "omar") is True
    assert room.lobby_names() == ["Mahima"]


def test_kick_unknown_name_is_noop(room: Room) -> None:
    assert room.kick(room.host_token, "Nobody") is False


def test_kick_after_start_rejected(room: Room) -> None:
    started(room, "Omar")
    assert_error(ErrorCode.WRONG_STATE, room.kick, room.host_token, "Omar")


# --- start ------------------------------------------------------------------


def test_start_needs_a_player(room: Room) -> None:
    assert_error(ErrorCode.WRONG_STATE, room.start, room.host_token)


def test_start_twice_rejected(room: Room) -> None:
    started(room, "Omar")
    assert_error(ErrorCode.WRONG_STATE, room.start, room.host_token)


def test_start_returns_first_question(room: Room) -> None:
    room.add_player("Omar")
    view = room.start(room.host_token)
    assert room.state == State.QUESTION
    assert (view.id, view.index, view.total) == (0, 0, 2)
    assert view.ends_at == START + TIME_LIMIT
    assert view.server_time == START


def test_question_view_never_has_correct_answer() -> None:
    assert "correct" not in {f.name for f in fields(QuestionView)}


# --- answers ----------------------------------------------------------------


def test_correct_answer_scored_by_server_time(room: Room, clock: FakeClock) -> None:
    started(room, "Omar")
    clock.now += 4
    room.submit_answer("Omar", 0, 1)
    reveal = room.end_question()
    assert reveal.results == [PlayerResult("Omar", True, 900, 900)]


def test_wrong_answer_scores_zero(room: Room) -> None:
    started(room, "Omar")
    room.submit_answer("Omar", 0, 0)
    assert room.end_question().results == [PlayerResult("Omar", False, 0, 0)]


def test_duplicate_answer_rejected_and_first_stands(room: Room) -> None:
    started(room, "Omar")
    room.submit_answer("Omar", 0, 1)
    assert_error(ErrorCode.ALREADY_ANSWERED, room.submit_answer, "Omar", 0, 0)
    assert room.end_question().results[0].correct is True


def test_answer_at_deadline_accepted(room: Room, clock: FakeClock) -> None:
    started(room, "Omar")
    clock.now += TIME_LIMIT
    room.submit_answer("Omar", 0, 1)
    assert room.end_question().results[0].points == 500


def test_answer_after_deadline_rejected(room: Room, clock: FakeClock) -> None:
    started(room, "Omar")
    clock.now += TIME_LIMIT + 0.001
    assert_error(ErrorCode.TIME_UP, room.submit_answer, "Omar", 0, 1)
    assert room.end_question().results == [PlayerResult("Omar", False, 0, 0)]


def test_late_duplicate_gets_already_answered(room: Room, clock: FakeClock) -> None:
    started(room, "Omar")
    room.submit_answer("Omar", 0, 1)
    clock.now += TIME_LIMIT + 1
    assert_error(ErrorCode.ALREADY_ANSWERED, room.submit_answer, "Omar", 0, 1)


def test_answer_during_reveal_is_time_up(room: Room) -> None:
    started(room, "Omar")
    room.end_question()
    assert_error(ErrorCode.TIME_UP, room.submit_answer, "Omar", 0, 1)


def test_answer_for_previous_question_is_time_up(room: Room) -> None:
    started(room, "Omar")
    room.end_question()
    room.advance()
    assert_error(ErrorCode.TIME_UP, room.submit_answer, "Omar", 0, 1)


@pytest.mark.parametrize("question_id", [1, 99, -1, "0", True, None])
def test_bad_question_id(room: Room, question_id: object) -> None:
    started(room, "Omar")
    assert_error(ErrorCode.BAD_MESSAGE, room.submit_answer, "Omar", question_id, 1)


@pytest.mark.parametrize("choice", [-1, 4, "1", True, 1.0, None])
def test_bad_choice(room: Room, choice: object) -> None:
    started(room, "Omar")
    assert_error(ErrorCode.BAD_MESSAGE, room.submit_answer, "Omar", 0, choice)


def test_answer_in_lobby_or_finished_is_wrong_state(room: Room) -> None:
    room.add_player("Omar")
    assert_error(ErrorCode.WRONG_STATE, room.submit_answer, "Omar", 0, 1)


def test_unknown_player_cannot_answer(room: Room) -> None:
    started(room, "Omar")
    assert_error(ErrorCode.WRONG_STATE, room.submit_answer, "Ghost", 0, 1)


def test_disconnected_player_cannot_answer(room: Room) -> None:
    started(room, "Omar", "Mahima")
    room.remove_player("Omar")
    assert_error(ErrorCode.WRONG_STATE, room.submit_answer, "Omar", 0, 1)


def test_answer_count(room: Room) -> None:
    started(room, "Omar", "Mahima")
    count = room.submit_answer("Omar", 0, 1)
    assert (count.question_id, count.answered, count.total) == (0, 1, 2)


def test_totals_hidden_until_reveal(room: Room) -> None:
    started(room, "Omar")
    room.submit_answer("Omar", 0, 1)
    assert room._players["omar"].score == 0


# --- all_answered -------------------------------------------------------------


def test_all_answered(room: Room) -> None:
    started(room, "Omar", "Mahima")
    room.submit_answer("Omar", 0, 1)
    assert not room.all_answered()
    room.submit_answer("Mahima", 0, 2)
    assert room.all_answered()


def test_all_answered_ignores_disconnected(room: Room) -> None:
    started(room, "Omar", "Mahima")
    room.submit_answer("Omar", 0, 1)
    room.remove_player("Mahima")
    assert room.all_answered()


def test_all_answered_false_when_nobody_connected(room: Room) -> None:
    started(room, "Omar")
    room.remove_player("Omar")
    assert not room.all_answered()


# --- reveal -------------------------------------------------------------------


def test_reveal_distribution_and_non_answerers(room: Room) -> None:
    started(room, "A", "B", "C")
    room.submit_answer("A", 0, 1)
    room.submit_answer("B", 0, 1)
    reveal = room.end_question()
    assert reveal.question_id == 0
    assert reveal.correct == 1
    assert reveal.distribution == [0, 2, 0, 0]
    assert [r.name for r in reveal.results] == ["A", "B", "C"]
    assert reveal.results[2] == PlayerResult("C", False, 0, 0)


def test_totals_accumulate(room: Room, clock: FakeClock) -> None:
    started(room, "Omar")
    room.submit_answer("Omar", 0, 1)  # 1000
    room.end_question()
    room.advance()
    clock.now += 4
    room.submit_answer("Omar", 1, 1)  # 900
    assert room.end_question().results[0].total == 1900


def test_disconnected_player_keeps_score(room: Room) -> None:
    started(room, "Omar", "Mahima")
    room.submit_answer("Omar", 0, 1)
    room.remove_player("Omar")
    assert room.end_question().results[0] == PlayerResult("Omar", True, 1000, 1000)


def test_end_question_twice_rejected(room: Room) -> None:
    started(room, "Omar")
    room.end_question()
    assert_error(ErrorCode.WRONG_STATE, room.end_question)


# --- flow ---------------------------------------------------------------------


def test_full_game_reaches_finished(room: Room, clock: FakeClock) -> None:
    started(room, "Omar")
    room.end_question()
    view = room.advance()
    assert isinstance(view, QuestionView)
    assert (view.id, view.ends_at) == (1, clock.now + TIME_LIMIT)
    room.end_question()
    rankings = room.advance()
    assert room.state == State.FINISHED
    assert rankings == [Ranking(1, "Omar", 0)]


def test_out_of_order_calls_rejected(room: Room) -> None:
    room.add_player("Omar")
    for fn in (room.end_question, room.advance, room.current_question, room.leaderboard):
        assert_error(ErrorCode.WRONG_STATE, fn)
    room.start(room.host_token)
    assert_error(ErrorCode.WRONG_STATE, room.advance)
    assert_error(ErrorCode.WRONG_STATE, room.leaderboard)
    room.end_question()
    assert_error(ErrorCode.WRONG_STATE, room.current_question)
    room.advance()
    room.end_question()
    room.advance()
    for fn in (room.end_question, room.advance, room.current_question):
        assert_error(ErrorCode.WRONG_STATE, fn)
    assert_error(ErrorCode.WRONG_STATE, room.submit_answer, "Omar", 1, 1)


# --- leaderboard --------------------------------------------------------------


def test_leaderboard_ties_share_rank(clock: FakeClock) -> None:
    room = Room("QC-1", make_questions(1), TIME_LIMIT, clock=clock)
    started(room, "A", "B", "C", "D")
    room.submit_answer("B", 0, 1)  # 1000
    room.submit_answer("C", 0, 1)  # 1000
    clock.now += 4
    room.submit_answer("A", 0, 1)  # 900
    room.remove_player("D")
    room.end_question()
    assert room.advance() == [
        Ranking(1, "B", 1000),
        Ranking(1, "C", 1000),
        Ranking(3, "A", 900),
        Ranking(4, "D", 0),
    ]
