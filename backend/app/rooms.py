"""In-memory Room: players, host, and the game state machine.

LOBBY -> QUESTION -> REVEAL -> (QUESTION | FINISHED). No I/O and no timers:
callers (WebSocket layer, timer tasks) drive transitions and turn RoomError
into protocol `error` messages. The server clock is injected; no method takes
a client-supplied time.
"""

import secrets
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from enum import StrEnum

from app.scoring import is_late, score_answer

MAX_PLAYERS = 50
MAX_NAME_LENGTH = 20


class State(StrEnum):
    LOBBY = "LOBBY"
    QUESTION = "QUESTION"
    REVEAL = "REVEAL"
    FINISHED = "FINISHED"


class ErrorCode(StrEnum):
    ROOM_NOT_FOUND = "ROOM_NOT_FOUND"
    NAME_TAKEN = "NAME_TAKEN"
    NAME_INVALID = "NAME_INVALID"
    ROOM_FULL = "ROOM_FULL"
    GAME_STARTED = "GAME_STARTED"
    NOT_HOST = "NOT_HOST"
    WRONG_STATE = "WRONG_STATE"
    ALREADY_ANSWERED = "ALREADY_ANSWERED"
    TIME_UP = "TIME_UP"
    BAD_MESSAGE = "BAD_MESSAGE"


class RoomError(Exception):
    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Question:
    """A question as passed in at room creation. Its id is its 0-based position."""

    text: str
    options: list[str]
    correct: int


@dataclass
class Player:
    name: str
    score: int = 0
    connected: bool = True


@dataclass(frozen=True)
class Answer:
    choice: int
    time_used: float
    points: int


@dataclass(frozen=True)
class QuestionView:
    """What players see. Deliberately has no `correct` field."""

    id: int
    index: int
    total: int
    text: str
    options: list[str]
    time_limit: float
    ends_at: float
    server_time: float


@dataclass(frozen=True)
class AnswerCount:
    question_id: int
    answered: int
    total: int


@dataclass(frozen=True)
class PlayerResult:
    name: str
    correct: bool
    points: int
    total: int


@dataclass(frozen=True)
class Reveal:
    question_id: int
    correct: int
    distribution: list[int]
    results: list[PlayerResult]


@dataclass(frozen=True)
class Ranking:
    rank: int
    name: str
    score: int


def name_key(name: str) -> str:
    """Names are unique case-insensitively: 'Omar' and ' omar ' are the same player."""
    return name.strip().casefold()


def _validate_questions(questions: Sequence[Question], time_limit: float) -> None:
    if time_limit <= 0:
        raise ValueError("time_limit must be positive")
    if not questions:
        raise ValueError("a room needs at least one question")
    for i, q in enumerate(questions):
        if len(q.options) < 2:
            raise ValueError(f"question {i} needs at least 2 options")
        if not 0 <= q.correct < len(q.options):
            raise ValueError(f"question {i} has correct index out of range")


@dataclass
class Room:
    code: str
    questions: Sequence[Question]
    time_limit: float
    clock: Callable[[], float] = time.time
    host_token: str = field(init=False, default_factory=lambda: secrets.token_urlsafe(24))
    state: State = field(init=False, default=State.LOBBY)
    # key -> Player, in join order
    _players: dict[str, Player] = field(init=False, default_factory=dict)
    _index: int = field(init=False, default=0)
    _started_at: float = field(init=False, default=0.0)
    # answers to the current question only, by player key
    _answers: dict[str, Answer] = field(init=False, default_factory=dict)

    def __post_init__(self) -> None:
        _validate_questions(self.questions, self.time_limit)
        self.questions = list(self.questions)

    @property
    def question_index(self) -> int:
        """Index of the current (or just revealed) question. 0 while in LOBBY."""
        return self._index

    # --- host -------------------------------------------------------------

    def is_host(self, token: str | None) -> bool:
        return token is not None and secrets.compare_digest(token, self.host_token)

    def _require_host(self, token: str | None) -> None:
        if not self.is_host(token):
            raise RoomError(ErrorCode.NOT_HOST, "only the host can do that")

    def _require_state(self, *states: State) -> None:
        if self.state not in states:
            raise RoomError(ErrorCode.WRONG_STATE, f"not allowed in {self.state}")

    # --- lobby ------------------------------------------------------------

    def add_player(self, name: str) -> Player:
        if self.state != State.LOBBY:
            raise RoomError(ErrorCode.GAME_STARTED, "the game has already started")
        display = name.strip() if isinstance(name, str) else ""
        if not 1 <= len(display) <= MAX_NAME_LENGTH or not display.isprintable():
            raise RoomError(
                ErrorCode.NAME_INVALID, f"name must be 1-{MAX_NAME_LENGTH} printable characters"
            )
        if name_key(display) in self._players:
            raise RoomError(ErrorCode.NAME_TAKEN, "that name is already taken")
        if len(self._players) >= MAX_PLAYERS:
            raise RoomError(ErrorCode.ROOM_FULL, "the room is full")
        player = Player(display)
        self._players[name_key(display)] = player
        return player

    def remove_player(self, name: str) -> None:
        """Player left or disconnected. In LOBBY they are removed; later they keep their score."""
        key = name_key(name)
        if key not in self._players:
            return
        if self.state == State.LOBBY:
            del self._players[key]
        else:
            self._players[key].connected = False

    def kick(self, token: str | None, name: str) -> bool:
        self._require_host(token)
        self._require_state(State.LOBBY)
        return self._players.pop(name_key(name), None) is not None

    def lobby_names(self) -> list[str]:
        return [p.name for p in self._players.values()]

    # --- game -------------------------------------------------------------

    def start(self, token: str | None) -> QuestionView:
        self._require_host(token)
        self._require_state(State.LOBBY)
        if not self._players:
            raise RoomError(ErrorCode.WRONG_STATE, "need at least one player")
        return self._open_question(0)

    def _open_question(self, index: int) -> QuestionView:
        self.state = State.QUESTION
        self._index = index
        self._started_at = self.clock()
        self._answers = {}
        return self.current_question()

    def current_question(self) -> QuestionView:
        self._require_state(State.QUESTION)
        q = self.questions[self._index]
        return QuestionView(
            id=self._index,
            index=self._index,
            total=len(self.questions),
            text=q.text,
            options=list(q.options),
            time_limit=self.time_limit,
            ends_at=self._started_at + self.time_limit,
            server_time=self.clock(),
        )

    def submit_answer(self, name: str, question_id: int, choice: int) -> AnswerCount:
        self._require_state(State.QUESTION, State.REVEAL)
        self._check_question_id(question_id)
        player = self._players.get(name_key(name))
        if player is None or not player.connected:
            raise RoomError(ErrorCode.WRONG_STATE, "not a player in this game")
        options = self.questions[self._index].options
        if not _is_int(choice) or not 0 <= choice < len(options):
            raise RoomError(ErrorCode.BAD_MESSAGE, "choice is not a valid option index")
        key = name_key(name)
        if key in self._answers:
            raise RoomError(ErrorCode.ALREADY_ANSWERED, "you already answered this question")
        time_used = self.clock() - self._started_at
        if is_late(time_used, self.time_limit):
            raise RoomError(ErrorCode.TIME_UP, "time is up for this question")
        correct = choice == self.questions[self._index].correct
        points = score_answer(correct, time_used, self.time_limit)
        self._answers[key] = Answer(choice, time_used, points)
        return self.answer_count()

    def _check_question_id(self, question_id: int) -> None:
        if not _is_int(question_id) or not 0 <= question_id < len(self.questions):
            raise RoomError(ErrorCode.BAD_MESSAGE, "unknown question_id")
        past = question_id < self._index or (
            question_id == self._index and self.state == State.REVEAL
        )
        if past:
            raise RoomError(ErrorCode.TIME_UP, "time is up for this question")
        if question_id > self._index:
            raise RoomError(ErrorCode.BAD_MESSAGE, "that question has not started")

    def answer_count(self) -> AnswerCount:
        connected = [k for k, p in self._players.items() if p.connected]
        answered = sum(1 for k in connected if k in self._answers)
        return AnswerCount(question_id=self._index, answered=answered, total=len(connected))

    def all_answered(self) -> bool:
        self._require_state(State.QUESTION)
        count = self.answer_count()
        return count.total > 0 and count.answered == count.total

    def end_question(self) -> Reveal:
        self._require_state(State.QUESTION)
        self.state = State.REVEAL
        q = self.questions[self._index]
        distribution = [0] * len(q.options)
        results = []
        for key, player in self._players.items():
            answer = self._answers.get(key)
            if answer is not None:
                distribution[answer.choice] += 1
            points = answer.points if answer else 0
            player.score += points
            correct = answer is not None and answer.choice == q.correct
            results.append(PlayerResult(player.name, correct, points, player.score))
        return Reveal(self._index, q.correct, distribution, results)

    def advance(self) -> QuestionView | list[Ranking]:
        self._require_state(State.REVEAL)
        if self._index + 1 < len(self.questions):
            return self._open_question(self._index + 1)
        self.state = State.FINISHED
        return self.leaderboard()

    def leaderboard(self) -> list[Ranking]:
        self._require_state(State.FINISHED)
        ordered = sorted(self._players.values(), key=lambda p: -p.score)  # stable: join order
        rankings: list[Ranking] = []
        for position, player in enumerate(ordered, start=1):
            tied = rankings and rankings[-1].score == player.score
            rank = rankings[-1].rank if tied else position
            rankings.append(Ranking(rank, player.name, player.score))
        return rankings


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)
