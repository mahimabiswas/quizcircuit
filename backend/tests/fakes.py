from typing import Any


class FakeClock:
    def __init__(self, now: float = 1_000_000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


class FakeConnection:
    """Records what LiveRoom sends. Set `broken` to make every send fail."""

    def __init__(self, broken: bool = False) -> None:
        self.sent: list[dict[str, Any]] = []
        self.closed_with: int | None = None
        self.broken = broken

    async def send_json(self, data: Any) -> None:
        if self.broken:
            raise ConnectionError("socket is gone")
        self.sent.append(data)

    async def close(self, code: int = 1000) -> None:
        self.closed_with = code

    def types(self) -> list[str]:
        return [m["type"] for m in self.sent]

    def last(self, type_: str) -> dict[str, Any]:
        return [m for m in self.sent if m["type"] == type_][-1]

    def clear(self) -> None:
        self.sent.clear()
