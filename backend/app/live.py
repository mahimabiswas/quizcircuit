"""LiveRoom: a Room plus its connections, broadcasts and timers.

Concurrency model: one asyncio event loop. Room's methods never await, and
every LiveRoom operation that changes state holds the room's lock across the
change *and* the broadcasts that follow, so every client sees messages in the
same order. Timer and reveal-pause tasks sleep outside the lock, then take it
and re-check that the game is still where they left it before acting.

Deadlines are enforced by Room's server clock, not by the timer: the timer
only decides when `reveal` is sent.
"""

import asyncio
import logging
from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from pydantic import BaseModel

from app.models import (
    AnswerAckMessage,
    AnswerCountMessage,
    JoinedMessage,
    KickedMessage,
    LeaderboardMessage,
    LobbyMessage,
    QuestionMessage,
    RevealMessage,
)
from app.rooms import ErrorCode, QuestionView, Room, RoomError, State, name_key

log = logging.getLogger(__name__)

REVEAL_PAUSE = 5.0
CLOSE_KICKED = 4000
CLOSE_REPLACED = 4001


class Connection(Protocol):
    """What LiveRoom needs from a socket. Starlette's WebSocket satisfies it."""

    async def send_json(self, data: Any) -> None: ...

    async def close(self, code: int = 1000) -> None: ...


@dataclass(frozen=True, eq=False)
class Member:
    """One joined connection. Compared by identity, so a stale handle never matches."""

    role: Literal["host", "player"]
    name: str
    conn: Connection


class LiveRoom:
    def __init__(
        self,
        room: Room,
        reveal_pause: float = REVEAL_PAUSE,
        on_empty: Callable[[], None] | None = None,
    ) -> None:
        self.room = room
        self.reveal_pause = reveal_pause
        self._on_empty = on_empty
        self._lock = asyncio.Lock()
        self._host: Member | None = None
        self._players: dict[str, Member] = {}  # name_key -> Member
        self._task: asyncio.Task[None] | None = None  # question timer or reveal pause
        self._last_reveal: RevealMessage | None = None

    # --- public operations (each takes the lock) ----------------------------

    async def join(self, conn: Connection, name: str, host_token: str | None) -> Member:
        async with self._lock:
            if host_token is not None:
                return await self._join_host(conn, name, host_token)
            return await self._join_player(conn, name)

    async def start(self, member: Member) -> None:
        async with self._lock:
            self._require_host(member)
            await self._open_question(self.room.start(self.room.host_token))

    async def answer(self, member: Member, question_id: int, choice: int) -> None:
        async with self._lock:
            if member.role == "host":
                raise RoomError(ErrorCode.WRONG_STATE, "the host cannot answer")
            count = self.room.submit_answer(member.name, question_id, choice)
            await _send(member.conn, AnswerAckMessage(question_id=question_id))
            await self._broadcast(AnswerCountMessage.model_validate(count))
            if self.room.all_answered():
                await self._end_question()

    async def kick(self, member: Member, name: str) -> None:
        async with self._lock:
            self._require_host(member)
            if not self.room.kick(self.room.host_token, name):
                return
            target = self._players.pop(name_key(name), None)
            if target is not None:
                await _send(target.conn, KickedMessage())
                await _close(target.conn, CLOSE_KICKED)
            await self._broadcast(self._lobby())

    async def leave(self, member: Member) -> None:
        """The member's connection closed. Safe to call more than once."""
        async with self._lock:
            if member.role == "host":
                if self._host is member:
                    self._host = None
            elif self._players.get(name_key(member.name)) is member:
                del self._players[name_key(member.name)]
                self.room.remove_player(member.name)
                await self._after_player_left()
            self._check_empty()

    def cancel_tasks(self) -> None:
        """Cancel the pending timer or reveal pause. A task never cancels itself
        (the timer calls this on its way to sending the reveal)."""
        if self._task is not None and self._task is not asyncio.current_task():
            self._task.cancel()
        self._task = None

    @property
    def connection_count(self) -> int:
        return len(self._players) + (self._host is not None)

    # --- joining ------------------------------------------------------------

    async def _join_host(self, conn: Connection, name: str, token: str) -> Member:
        if not self.room.is_host(token):
            raise RoomError(ErrorCode.NOT_HOST, "invalid host token")
        previous, member = self._host, Member("host", name.strip(), conn)
        self._host = member
        if previous is not None:
            await _close(previous.conn, CLOSE_REPLACED)
        await _send(conn, JoinedMessage(role="host", name=member.name))
        await self._send_snapshot(conn)
        return member

    async def _join_player(self, conn: Connection, name: str) -> Member:
        player = self.room.add_player(name)
        member = Member("player", player.name, conn)
        self._players[name_key(player.name)] = member
        await _send(conn, JoinedMessage(role="player", name=player.name))
        await self._broadcast(self._lobby())
        return member

    async def _send_snapshot(self, conn: Connection) -> None:
        """Bring a (re)joining host up to date with the current state."""
        match self.room.state:
            case State.LOBBY:
                await _send(conn, self._lobby())
            case State.QUESTION:
                await _send(conn, QuestionMessage.model_validate(self.room.current_question()))
                await _send(conn, AnswerCountMessage.model_validate(self.room.answer_count()))
            case State.REVEAL if self._last_reveal is not None:
                await _send(conn, self._last_reveal)
            case State.FINISHED:
                await _send(conn, LeaderboardMessage(rankings=self.room.leaderboard()))

    # --- game flow (lock already held) --------------------------------------

    async def _open_question(self, view: QuestionView) -> None:
        await self._broadcast(QuestionMessage.model_validate(view))
        delay = max(0.0, view.ends_at - self.room.clock())
        self._schedule(self._question_timer(view.index, delay))

    async def _end_question(self) -> None:
        self.cancel_tasks()
        self._last_reveal = RevealMessage.model_validate(self.room.end_question())
        await self._broadcast(self._last_reveal)
        self._schedule(self._advance_after_pause(self.room.question_index))

    async def _after_player_left(self) -> None:
        if self.room.state == State.LOBBY:
            await self._broadcast(self._lobby())
        elif self.room.state == State.QUESTION:
            await self._broadcast(AnswerCountMessage.model_validate(self.room.answer_count()))
            if self.room.all_answered():
                await self._end_question()

    def _check_empty(self) -> None:
        if self.room.state == State.FINISHED and self.connection_count == 0:
            self.cancel_tasks()
            if self._on_empty is not None:
                self._on_empty()

    # --- background tasks ---------------------------------------------------

    async def _question_timer(self, index: int, delay: float) -> None:
        await asyncio.sleep(delay)
        async with self._lock:
            if self.room.state == State.QUESTION and self.room.question_index == index:
                await self._end_question()

    async def _advance_after_pause(self, index: int) -> None:
        await asyncio.sleep(self.reveal_pause)
        async with self._lock:
            if self.room.state != State.REVEAL or self.room.question_index != index:
                return
            result = self.room.advance()
            if isinstance(result, QuestionView):
                await self._open_question(result)
            else:
                await self._broadcast(LeaderboardMessage(rankings=result))
                self._check_empty()

    def _schedule(self, coro: Coroutine[Any, Any, None]) -> None:
        """Replace the pending task with a new one."""
        self.cancel_tasks()
        self._task = asyncio.create_task(coro)
        self._task.add_done_callback(_log_task_error)

    # --- helpers --------------------------------------------------------------

    def _require_host(self, member: Member) -> None:
        if member.role != "host" or self._host is not member:
            raise RoomError(ErrorCode.NOT_HOST, "only the host can do that")

    def _lobby(self) -> LobbyMessage:
        return LobbyMessage(players=self.room.lobby_names())

    async def _broadcast(self, message: BaseModel) -> None:
        data = message.model_dump(mode="json")
        members = list(self._players.values())
        if self._host is not None:
            members.append(self._host)
        for member in members:
            await _send_data(member.conn, data)


async def _send(conn: Connection, message: BaseModel) -> None:
    await _send_data(conn, message.model_dump(mode="json"))


async def _send_data(conn: Connection, data: dict[str, Any]) -> None:
    """A failed send is not fatal: that socket's own receive loop will see the
    disconnect and call leave()."""
    try:
        await conn.send_json(data)
    except Exception:
        log.info("send failed; waiting for the connection to close", exc_info=True)


async def _close(conn: Connection, code: int) -> None:
    try:
        await conn.close(code=code)
    except Exception:
        log.info("close failed", exc_info=True)


def _log_task_error(task: asyncio.Task[None]) -> None:
    if not task.cancelled() and task.exception() is not None:
        log.error("room task failed", exc_info=task.exception())
