"""In-memory room registry: room code -> LiveRoom."""

import secrets
from collections.abc import Callable, Sequence

from app.live import LiveRoom
from app.rooms import ErrorCode, Question, Room, RoomError

MAX_CODE_ATTEMPTS = 100


def random_code() -> str:
    return f"QC-{secrets.randbelow(10_000):04d}"


def normalize_code(code: str) -> str:
    """Codes are typed by people: accept ' qc-4821 ' as 'QC-4821'."""
    return code.strip().upper()


class RoomRegistry:
    def __init__(self, make_code: Callable[[], str] = random_code) -> None:
        self._rooms: dict[str, LiveRoom] = {}
        self._make_code = make_code

    def create(self, questions: Sequence[Question], time_limit: float) -> LiveRoom:
        """Create a room under a fresh code. Raises ValueError for invalid questions.

        A room removes itself once it is FINISHED and its last connection closes.
        """
        room = Room(self._free_code(), questions, time_limit)
        live = LiveRoom(room, on_empty=lambda: self.remove(room.code))
        self._rooms[room.code] = live
        return live

    def get(self, code: str) -> LiveRoom:
        live = self._rooms.get(normalize_code(code))
        if live is None:
            raise RoomError(ErrorCode.ROOM_NOT_FOUND, "no room with that code")
        return live

    def remove(self, code: str) -> None:
        live = self._rooms.pop(normalize_code(code), None)
        if live is not None:
            live.cancel_tasks()

    def __len__(self) -> int:
        return len(self._rooms)

    def _free_code(self) -> str:
        for _ in range(MAX_CODE_ATTEMPTS):
            code = self._make_code()
            if code not in self._rooms:
                return code
        raise RuntimeError("could not find a free room code")
