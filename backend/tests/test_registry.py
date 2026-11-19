import re
from collections.abc import Iterator

import pytest

from app.registry import RoomRegistry, normalize_code, random_code
from app.rooms import ErrorCode, Question, RoomError

QUESTIONS = [Question("Q", ["a", "b"], correct=0)]


def codes(*values: str) -> Iterator[str]:
    return iter(values)


def test_random_code_format() -> None:
    for _ in range(200):
        assert re.fullmatch(r"QC-\d{4}", random_code())


def test_create_and_get() -> None:
    registry = RoomRegistry()
    room = registry.create(QUESTIONS, 20)
    assert registry.get(room.code) is room
    assert len(registry) == 1


def test_get_normalizes_code() -> None:
    registry = RoomRegistry(make_code=lambda: "QC-0042")
    room = registry.create(QUESTIONS, 20)
    assert registry.get("  qc-0042 ") is room
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
    assert (first.code, second.code) == ("QC-0001", "QC-0002")


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
