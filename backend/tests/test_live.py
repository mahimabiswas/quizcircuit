import asyncio
import time
from collections.abc import AsyncIterator, Callable

import pytest

from app.live import CLOSE_KICKED, CLOSE_REPLACED, LiveRoom, Member
from app.rooms import ErrorCode, Question, Room, RoomError, State
from tests.fakes import FakeClock, FakeConnection

QUESTIONS = [Question(f"Q{i}", ["a", "b", "c", "d"], correct=1) for i in range(2)]
LONG = 60.0  # a pause or limit that never elapses during a test

LiveFactory = Callable[..., LiveRoom]


@pytest.fixture
async def make_live() -> AsyncIterator[LiveFactory]:
    created: list[LiveRoom] = []

    def factory(
        time_limit: float = LONG,
        questions: list[Question] = QUESTIONS,
        clock: Callable[[], float] = time.time,
        on_empty: Callable[[], None] | None = None,
    ) -> LiveRoom:
        room = Room("QC-1", questions, time_limit, clock=clock)
        live = LiveRoom(room, on_empty=on_empty)
        created.append(live)
        return live

    yield factory
    for live in created:
        live.cancel_tasks()


async def join_host(live: LiveRoom) -> tuple[Member, FakeConnection]:
    conn = FakeConnection()
    return await live.join(conn, "Host", live.room.host_token), conn


async def join_player(live: LiveRoom, name: str) -> tuple[Member, FakeConnection]:
    conn = FakeConnection()
    return await live.join(conn, name, None), conn


async def eventually(check: Callable[[], bool], timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while not check():
        if time.monotonic() > deadline:
            raise AssertionError("condition not met in time")
        await asyncio.sleep(0.005)


async def assert_error(code: ErrorCode, coro) -> None:
    with pytest.raises(RoomError) as exc:
        await coro
    assert exc.value.code == code


# --- joining ----------------------------------------------------------------


async def test_player_join_sends_joined_and_lobby_to_everyone(make_live: LiveFactory) -> None:
    live = make_live()
    _, host = await join_host(live)
    _, a = await join_player(live, "A")
    _, b = await join_player(live, "  B ")
    assert a.sent[0] == {"type": "joined", "role": "player", "name": "A"}
    assert b.sent[0] == {"type": "joined", "role": "player", "name": "B"}
    assert a.types() == ["joined", "lobby", "lobby"]
    for conn in (host, a, b):
        assert conn.last("lobby") == {"type": "lobby", "players": ["A", "B"]}


async def test_host_join_gets_lobby_snapshot(make_live: LiveFactory) -> None:
    live = make_live()
    await join_player(live, "A")
    _, host = await join_host(live)
    assert host.sent == [
        {"type": "joined", "role": "host", "name": "Host"},
        {"type": "lobby", "players": ["A"]},
    ]


async def test_failed_player_join_sends_nothing(make_live: LiveFactory) -> None:
    live = make_live()
    await join_player(live, "Omar")
    conn = FakeConnection()
    await assert_error(ErrorCode.NAME_TAKEN, live.join(conn, "omar", None))
    assert conn.sent == []
    assert live.connection_count == 1


async def test_wrong_host_token_rejected(make_live: LiveFactory) -> None:
    live = make_live()
    conn = FakeConnection()
    await assert_error(ErrorCode.NOT_HOST, live.join(conn, "Host", "wrong"))
    assert conn.sent == []
    assert live.connection_count == 0


async def test_second_host_replaces_first(make_live: LiveFactory) -> None:
    live = make_live()
    await join_player(live, "A")
    old, old_conn = await join_host(live)
    new, _ = await join_host(live)
    assert old_conn.closed_with == CLOSE_REPLACED
    await assert_error(ErrorCode.NOT_HOST, live.start(old))
    await live.start(new)
    assert live.room.state == State.QUESTION


# --- starting ---------------------------------------------------------------


async def test_only_host_can_start(make_live: LiveFactory) -> None:
    live = make_live()
    player, _ = await join_player(live, "A")
    await assert_error(ErrorCode.NOT_HOST, live.start(player))


async def test_start_broadcasts_question_without_answer(make_live: LiveFactory) -> None:
    live = make_live()
    host, host_conn = await join_host(live)
    _, a = await join_player(live, "A")
    await live.start(host)
    for conn in (host_conn, a):
        question = conn.last("question")
        assert question["id"] == 0
        assert "correct" not in question


# --- answering --------------------------------------------------------------


async def test_answer_acks_player_and_counts_everyone(make_live: LiveFactory) -> None:
    live = make_live()
    host, host_conn = await join_host(live)
    a, a_conn = await join_player(live, "A")
    _, b_conn = await join_player(live, "B")
    await live.start(host)
    await live.answer(a, 0, 1)
    count = {"type": "answer_count", "question_id": 0, "answered": 1, "total": 2}
    assert a_conn.sent[-2:] == [{"type": "answer_ack", "question_id": 0}, count]
    assert b_conn.sent[-1] == count
    assert host_conn.sent[-1] == count
    assert "answer_ack" not in b_conn.types() + host_conn.types()
    assert "reveal" not in a_conn.types()


async def test_host_cannot_answer(make_live: LiveFactory) -> None:
    live = make_live()
    host, _ = await join_host(live)
    await join_player(live, "A")
    await live.start(host)
    await assert_error(ErrorCode.WRONG_STATE, live.answer(host, 0, 1))


async def test_room_errors_propagate(make_live: LiveFactory) -> None:
    live = make_live()
    host, _ = await join_host(live)
    a, _ = await join_player(live, "A")
    await join_player(live, "B")
    await live.start(host)
    await live.answer(a, 0, 1)
    await assert_error(ErrorCode.ALREADY_ANSWERED, live.answer(a, 0, 2))


async def test_late_answer_before_timer_fires_is_time_up(make_live: LiveFactory) -> None:
    clock = FakeClock()
    live = make_live(time_limit=20, clock=clock)
    host, _ = await join_host(live)
    a, _ = await join_player(live, "A")
    await live.start(host)
    clock.now += 20.001  # deadline passed, but the (real-time) timer has not fired
    await assert_error(ErrorCode.TIME_UP, live.answer(a, 0, 1))
    assert live.room.state == State.QUESTION


# --- ending questions -------------------------------------------------------


async def test_full_game_when_everyone_answers(make_live: LiveFactory) -> None:
    live = make_live()
    host, host_conn = await join_host(live)
    a, a_conn = await join_player(live, "A")
    await live.start(host)

    await live.answer(a, 0, 1)
    assert a_conn.last("reveal")["question_id"] == 0  # sent before answer() returns
    await live.next_question(host)
    assert live.room.state == State.QUESTION
    await live.answer(a, 1, 0)
    await live.next_question(host)
    assert live.room.state == State.FINISHED

    assert host_conn.types() == [
        "joined", "lobby", "lobby",
        "question", "answer_count", "reveal",
        "question", "answer_count", "reveal",
        "leaderboard",
    ]  # fmt: skip
    # After joining, every client sees the same broadcasts in the same order.
    player_view = [t for t in a_conn.types() if t != "answer_ack"]
    assert player_view[1:] == host_conn.types()[2:]  # skip joined (+ host's lobby snapshot)
    assert a_conn.last("leaderboard")["rankings"][0]["name"] == "A"


async def test_early_end_cancels_timer(make_live: LiveFactory) -> None:
    live = make_live(time_limit=0.05)
    host, host_conn = await join_host(live)
    a, _ = await join_player(live, "A")
    await live.start(host)
    await live.answer(a, 0, 1)
    await asyncio.sleep(0.15)  # well past the time limit
    assert host_conn.types().count("reveal") == 1
    assert live.room.state == State.REVEAL


async def test_timer_ends_question_when_nobody_answers(make_live: LiveFactory) -> None:
    live = make_live(time_limit=0.05)
    host, host_conn = await join_host(live)
    await join_player(live, "A")
    await live.start(host)
    await eventually(lambda: "reveal" in host_conn.types())
    assert host_conn.last("reveal")["results"] == [
        {"name": "A", "correct": False, "points": 0, "total": 0}
    ]


async def test_reveal_waits_for_the_host(make_live: LiveFactory) -> None:
    live = make_live(time_limit=0.05)
    host, host_conn = await join_host(live)
    await join_player(live, "A")
    await live.start(host)
    await eventually(lambda: "reveal" in host_conn.types())
    await asyncio.sleep(0.15)  # nothing moves on by itself
    assert live.room.state == State.REVEAL
    assert host_conn.types().count("question") == 1


async def test_next_opens_the_next_question_with_a_fresh_timer(make_live: LiveFactory) -> None:
    live = make_live(time_limit=0.05)
    host, host_conn = await join_host(live)
    _, a_conn = await join_player(live, "A")
    await live.start(host)
    await eventually(lambda: "reveal" in host_conn.types())
    await live.next_question(host)
    assert a_conn.last("question")["id"] == 1
    assert "correct" not in a_conn.last("question")
    await eventually(lambda: host_conn.types().count("reveal") == 2)  # its timer ran


async def test_next_after_last_question_sends_leaderboard(make_live: LiveFactory) -> None:
    live = make_live(questions=QUESTIONS[:1])
    host, host_conn = await join_host(live)
    a, a_conn = await join_player(live, "A")
    await live.start(host)
    await live.answer(a, 0, 1)
    await live.next_question(host)
    assert live.room.state == State.FINISHED
    for conn in (host_conn, a_conn):
        assert conn.last("leaderboard")["rankings"][0] == {"rank": 1, "name": "A", "score": 1000}


async def test_stale_timer_does_nothing(make_live: LiveFactory) -> None:
    live = make_live()
    host, host_conn = await join_host(live)
    a, _ = await join_player(live, "A")
    await live.start(host)
    await live.answer(a, 0, 1)  # question 0 already revealed
    await live._question_timer(0, 0)  # the timer that lost the race wakes up
    assert host_conn.types().count("reveal") == 1


async def test_only_host_can_send_next(make_live: LiveFactory) -> None:
    live = make_live()
    host, _ = await join_host(live)
    a, _ = await join_player(live, "A")
    await live.start(host)
    await live.answer(a, 0, 1)
    await assert_error(ErrorCode.NOT_HOST, live.next_question(a))
    assert live.room.state == State.REVEAL


async def test_replaced_host_cannot_send_next(make_live: LiveFactory) -> None:
    live = make_live()
    old, _ = await join_host(live)
    a, _ = await join_player(live, "A")
    await live.start(old)
    await live.answer(a, 0, 1)
    await join_host(live)
    await assert_error(ErrorCode.NOT_HOST, live.next_question(old))


async def test_next_outside_reveal_is_wrong_state(make_live: LiveFactory) -> None:
    live = make_live()
    host, _ = await join_host(live)
    await join_player(live, "A")
    await assert_error(ErrorCode.WRONG_STATE, live.next_question(host))  # lobby
    await live.start(host)
    await assert_error(ErrorCode.WRONG_STATE, live.next_question(host))  # question open


async def test_double_next_does_not_skip_a_question(make_live: LiveFactory) -> None:
    live = make_live()
    host, host_conn = await join_host(live)
    a, _ = await join_player(live, "A")
    await live.start(host)
    await live.answer(a, 0, 1)
    await live.next_question(host)
    await assert_error(ErrorCode.WRONG_STATE, live.next_question(host))
    assert live.room.question_index == 1
    assert host_conn.types().count("question") == 2


async def test_concurrent_next_taps_advance_once(make_live: LiveFactory) -> None:
    live = make_live()
    host, host_conn = await join_host(live)
    a, _ = await join_player(live, "A")
    await live.start(host)
    await live.answer(a, 0, 1)
    results = await asyncio.gather(
        live.next_question(host), live.next_question(host), return_exceptions=True
    )
    assert sum(isinstance(r, RoomError) for r in results) == 1
    assert host_conn.types().count("question") == 2


async def test_concurrent_answers_are_serialised(make_live: LiveFactory) -> None:
    live = make_live()
    host, host_conn = await join_host(live)
    players = [(await join_player(live, name))[0] for name in ("A", "B", "C")]
    await live.start(host)
    await asyncio.gather(*(live.answer(p, 0, 1) for p in players))
    counts = [m["answered"] for m in host_conn.sent if m["type"] == "answer_count"]
    assert counts == [1, 2, 3]
    assert host_conn.types().count("reveal") == 1
    assert host_conn.types()[-1] == "reveal"


# --- kicking ----------------------------------------------------------------


async def test_kick(make_live: LiveFactory) -> None:
    live = make_live()
    host, _ = await join_host(live)
    a, a_conn = await join_player(live, "A")
    _, b_conn = await join_player(live, "B")
    await live.kick(host, "a")
    assert a_conn.sent[-1] == {"type": "kicked"}
    assert a_conn.closed_with == CLOSE_KICKED
    assert b_conn.last("lobby")["players"] == ["B"]
    b_conn.clear()
    await live.leave(a)  # the kicked socket's handler then cleans up: a no-op
    assert b_conn.sent == []


async def test_kick_unknown_name_sends_nothing(make_live: LiveFactory) -> None:
    live = make_live()
    host, host_conn = await join_host(live)
    host_conn.clear()
    await live.kick(host, "Nobody")
    assert host_conn.sent == []


async def test_only_host_can_kick(make_live: LiveFactory) -> None:
    live = make_live()
    a, _ = await join_player(live, "A")
    await join_player(live, "B")
    await assert_error(ErrorCode.NOT_HOST, live.kick(a, "B"))


# --- leaving ----------------------------------------------------------------


async def test_leave_in_lobby_updates_everyone(make_live: LiveFactory) -> None:
    live = make_live()
    a, _ = await join_player(live, "A")
    _, b_conn = await join_player(live, "B")
    await live.leave(a)
    await live.leave(a)  # twice is harmless
    assert b_conn.last("lobby")["players"] == ["B"]
    assert b_conn.types() == ["joined", "lobby", "lobby"]  # own join, then A leaving once


async def test_leave_mid_question_updates_count(make_live: LiveFactory) -> None:
    live = make_live()
    host, host_conn = await join_host(live)
    await join_player(live, "A")
    await join_player(live, "B")
    c, _ = await join_player(live, "C")
    await live.start(host)
    await live.leave(c)
    assert host_conn.sent[-1] == {
        "type": "answer_count",
        "question_id": 0,
        "answered": 0,
        "total": 2,
    }


async def test_last_unanswered_player_leaving_ends_question(make_live: LiveFactory) -> None:
    live = make_live()
    host, _ = await join_host(live)
    a, a_conn = await join_player(live, "A")
    b, _ = await join_player(live, "B")
    await live.start(host)
    await live.answer(a, 0, 1)
    await live.leave(b)
    results = a_conn.last("reveal")["results"]
    assert [r["name"] for r in results] == ["A", "B"]  # B keeps a row
    assert results[1]["correct"] is False


async def test_without_host_game_waits_on_reveal_until_host_returns(
    make_live: LiveFactory,
) -> None:
    live = make_live(time_limit=0.03)
    host, _ = await join_host(live)
    _, a_conn = await join_player(live, "A")
    await live.start(host)
    await live.leave(host)
    await eventually(lambda: "reveal" in a_conn.types())  # the timer still ends the question
    await asyncio.sleep(0.1)
    assert live.room.state == State.REVEAL
    host, conn = await join_host(live)
    assert conn.types() == ["joined", "reveal"]
    await live.next_question(host)
    assert a_conn.last("question")["id"] == 1


async def test_host_rejoins_mid_question(make_live: LiveFactory) -> None:
    live = make_live()
    host, _ = await join_host(live)
    a, _ = await join_player(live, "A")
    await join_player(live, "B")
    await live.start(host)
    await live.answer(a, 0, 1)
    await live.leave(host)
    _, conn = await join_host(live)
    assert conn.types() == ["joined", "question", "answer_count"]
    assert "correct" not in conn.last("question")
    assert conn.last("answer_count")["answered"] == 1


async def test_host_rejoins_during_reveal(make_live: LiveFactory) -> None:
    live = make_live()
    host, _ = await join_host(live)
    a, a_conn = await join_player(live, "A")
    await live.start(host)
    await live.answer(a, 0, 1)
    _, conn = await join_host(live)
    assert conn.types() == ["joined", "reveal"]
    assert conn.last("reveal") == a_conn.last("reveal")


async def test_host_rejoins_after_finish(make_live: LiveFactory) -> None:
    live = make_live(questions=QUESTIONS[:1])
    host, _ = await join_host(live)
    a, _ = await join_player(live, "A")
    await live.start(host)
    await live.answer(a, 0, 1)
    await live.next_question(host)
    _, conn = await join_host(live)
    assert conn.types() == ["joined", "leaderboard"]


# --- robustness and cleanup -------------------------------------------------


async def test_broken_connection_does_not_stop_broadcast(make_live: LiveFactory) -> None:
    live = make_live()
    host, host_conn = await join_host(live)
    a, _ = await join_player(live, "A")
    b, b_conn = await join_player(live, "B")
    await live.start(host)
    b_conn.broken = True
    await live.answer(a, 0, 1)
    assert host_conn.last("answer_count")["answered"] == 1


async def test_on_empty_after_finish_and_last_leave(make_live: LiveFactory) -> None:
    emptied: list[bool] = []
    live = make_live(questions=QUESTIONS[:1], on_empty=lambda: emptied.append(True))
    host, _ = await join_host(live)
    a, _ = await join_player(live, "A")
    await live.start(host)
    await live.answer(a, 0, 1)
    await live.next_question(host)
    await live.leave(a)
    assert emptied == []
    await live.leave(host)
    assert emptied == [True]


async def test_abandoned_game_is_not_cleaned_up_yet(make_live: LiveFactory) -> None:
    # Known gap (protocol.md, open questions): with no host to press Next, a game
    # everyone has left stays on its reveal and is never removed.
    emptied: list[bool] = []
    live = make_live(time_limit=0.03, on_empty=lambda: emptied.append(True))
    host, _ = await join_host(live)
    a, _ = await join_player(live, "A")
    await live.start(host)
    await live.leave(a)
    await live.leave(host)
    await eventually(lambda: live.room.state == State.REVEAL)
    assert emptied == []


async def test_on_empty_not_called_before_finish(make_live: LiveFactory) -> None:
    emptied: list[bool] = []
    live = make_live(on_empty=lambda: emptied.append(True))
    a, _ = await join_player(live, "A")
    await live.leave(a)
    assert emptied == []
