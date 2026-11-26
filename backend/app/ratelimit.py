"""A small in-memory rate limit: at most `limit` uses per key in any rolling `window`.

Used to cap AI quiz generation per IP address. Like rooms, it lives in this one process,
so the counts reset when the server restarts.
"""

import time
from collections.abc import Callable


class RateLimiter:
    def __init__(
        self, limit: int, window: float, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.limit = limit
        self.window = window  # seconds
        self._clock = clock
        self._uses: dict[str, list[float]] = {}  # key -> times of recent uses, oldest first

    def take(self, key: str) -> float | None:
        """Use one of `key`'s turns. Returns None if allowed, else seconds until the next turn."""
        now = self._clock()
        self._forget_before(now - self.window)
        uses = self._uses.setdefault(key, [])
        if len(uses) >= self.limit:
            return uses[0] + self.window - now
        uses.append(now)
        return None

    def give_back(self, key: str) -> None:
        """Undo the latest take(), e.g. when the work it allowed failed."""
        uses = self._uses.get(key)
        if uses:
            uses.pop()
            if not uses:
                del self._uses[key]

    def _forget_before(self, cutoff: float) -> None:
        # Drop old uses for every key, so IPs that never come back don't pile up.
        for key in list(self._uses):
            recent = [t for t in self._uses[key] if t > cutoff]
            if recent:
                self._uses[key] = recent
            else:
                del self._uses[key]
