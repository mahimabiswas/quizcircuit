"""In-memory room registry: room code -> Room."""

import secrets
from collections.abc import Callable, Sequence

from app.rooms import ErrorCode, Question, Room, RoomError

MAX_CODE_ATTEMPTS = 100


def random_code() -> str:
    return f"QC-{secrets.randbelow(10_000):04d}"


def normalize_code(code: str) -> str:
    """Codes are typed by people: accept ' qc-4821 ' as 'QC-4821'."""
    return code.strip().upper()


class RoomRegistry:
    def __init__(self, make_code: Callable[[], str] = random_code) -> None:
        self._rooms: dict[str, Room] = {}
        self._make_code = make_code

    def create(self, questions: Sequence[Question], time_limit: float) -> Room:
        """Create a room under a fresh code. Raises ValueError for invalid questions."""
        room = Room(self._free_code(), questions, time_limit)
        self._rooms[room.code] = room
        return room

    def get(self, code: str) -> Room:
        room = self._rooms.get(normalize_code(code))
        if room is None:
            raise RoomError(ErrorCode.ROOM_NOT_FOUND, "no room with that code")
        return room

    def remove(self, code: str) -> None:
        self._rooms.pop(normalize_code(code), None)

    def __len__(self) -> int:
        return len(self._rooms)

    def _free_code(self) -> str:
        for _ in range(MAX_CODE_ATTEMPTS):
            code = self._make_code()
            if code not in self._rooms:
                return code
        raise RuntimeError("could not find a free room code")
