import asyncio
import re
from collections.abc import Iterator

import pytest

from app.registry import RoomRegistry, normalize_code, random_code
from app.rooms import ErrorCode, Question, RoomError, State
from tests.fakes import FakeConnection

QUESTIONS = [Question("Q", ["a", "b"], correct=0)]


def codes(*values: str) -> Iterator[str]:
    return iter(values)


def test_random_code_format() -> None:
    for _ in range(200):
        assert re.fullmatch(r"QC-\d{4}", random_code())


def test_create_and_get() -> None:
    registry = RoomRegistry()
    live = registry.create(QUESTIONS, 20)
    assert registry.get(live.room.code) is live
    assert len(registry) == 1


def test_get_normalizes_code() -> None:
    registry = RoomRegistry(make_code=lambda: "QC-0042")
    live = registry.create(QUESTIONS, 20)
    assert registry.get("  qc-0042 ") is live
    assert normalize_code(" qc-1 ") == "QC-1"


def test_get_missing_room() -> None:
    with pytest.raises(RoomError) as exc:
        RoomRegistry().get("QC-0000")
    assert exc.value.code == ErrorCode.ROOM_NOT_FOUND


def test_code_collision_retries() -> None:
    generated = codes("QC-0001", "QC-0001", "QC-0002")
    registry = RoomRegistry(make_code=lambda: next(generated))
    first = registry.create(QUESTIONS, 20)
    second = registry.create(QUESTIONS, 20)
    assert (first.room.code, second.room.code) == ("QC-0001", "QC-0002")


def test_no_free_code_raises() -> None:
    registry = RoomRegistry(make_code=lambda: "QC-0001")
    registry.create(QUESTIONS, 20)
    with pytest.raises(RuntimeError):
        registry.create(QUESTIONS, 20)


def test_invalid_room_not_registered() -> None:
    registry = RoomRegistry()
    with pytest.raises(ValueError):
        registry.create([Question("Q", ["a", "b"], correct=5)], 20)
    assert len(registry) == 0


def test_remove() -> None:
    registry = RoomRegistry(make_code=lambda: "QC-0042")
    registry.create(QUESTIONS, 20)
    registry.remove("qc-0042")
    registry.remove("QC-0042")  # removing twice is harmless
    assert len(registry) == 0


def test_reveal_pause_passed_to_rooms() -> None:
    assert RoomRegistry(reveal_pause=0).create(QUESTIONS, 20).reveal_pause == 0


async def test_finished_room_removes_itself_when_empty() -> None:
    registry = RoomRegistry(make_code=lambda: "QC-0042", reveal_pause=0)
    live = registry.create(QUESTIONS, 20)
    player = await live.join(FakeConnection(), "Omar", None)
    host = await live.join(FakeConnection(), "Host", live.room.host_token)
    await live.start(host)
    await live.answer(player, 0, 0)  # everyone answered: reveal, then (pause 0) leaderboard
    await asyncio.sleep(0.05)
    assert live.room.state == State.FINISHED
    await live.leave(player)
    assert len(registry) == 1
    await live.leave(host)
    assert len(registry) == 0
