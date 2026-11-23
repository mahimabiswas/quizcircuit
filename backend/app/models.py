"""Pydantic schemas for every WebSocket message in docs/protocol.md.

Client messages are parsed with `parse_client_message`, which turns any
malformed input into a BAD_MESSAGE RoomError. Server messages are built from
the dataclasses Room returns (`from_attributes`), so field names live in one
place, and are sent with `.model_dump(mode="json")`.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, TypeAdapter, ValidationError

from app.rooms import ErrorCode, RoomError

# --- client -> server -------------------------------------------------------


class _ClientMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")


class JoinMessage(_ClientMessage):
    type: Literal["join"]
    name: str
    host_token: str | None = None


class StartMessage(_ClientMessage):
    type: Literal["start"]


class AnswerMessage(_ClientMessage):
    type: Literal["answer"]
    question_id: StrictInt
    choice: StrictInt


class KickMessage(_ClientMessage):
    type: Literal["kick"]
    name: str


class NextMessage(_ClientMessage):
    type: Literal["next"]


ClientMessage = Annotated[
    JoinMessage | StartMessage | AnswerMessage | KickMessage | NextMessage,
    Field(discriminator="type"),
]

_client_adapter: TypeAdapter[ClientMessage] = TypeAdapter(ClientMessage)


def parse_client_message(raw: str | bytes) -> ClientMessage:
    """Parse one raw WebSocket frame. Raises RoomError(BAD_MESSAGE) on any problem."""
    try:
        return _client_adapter.validate_json(raw)
    except ValidationError as exc:
        raise RoomError(ErrorCode.BAD_MESSAGE, _describe(exc)) from None


def _describe(exc: ValidationError) -> str:
    """First validation error, without echoing the client's input back."""
    error = exc.errors(include_input=False, include_url=False)[0]
    where = ".".join(str(part) for part in error["loc"])
    return f"{where}: {error['msg']}" if where else error["msg"]


# --- server -> client -------------------------------------------------------


class _ServerMessage(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class JoinedMessage(_ServerMessage):
    type: Literal["joined"] = "joined"
    role: Literal["host", "player"]
    name: str


class LobbyMessage(_ServerMessage):
    type: Literal["lobby"] = "lobby"
    players: list[str]


class QuestionMessage(_ServerMessage):
    """Built from QuestionView, so it cannot carry the correct answer."""

    type: Literal["question"] = "question"
    id: int
    index: int
    total: int
    text: str
    options: list[str]
    time_limit: float
    ends_at: float
    server_time: float


class AnswerAckMessage(_ServerMessage):
    type: Literal["answer_ack"] = "answer_ack"
    question_id: int


class AnswerCountMessage(_ServerMessage):
    type: Literal["answer_count"] = "answer_count"
    question_id: int
    answered: int
    total: int


class ResultEntry(_ServerMessage):
    name: str
    correct: bool
    points: int
    total: int


class RevealMessage(_ServerMessage):
    type: Literal["reveal"] = "reveal"
    question_id: int
    correct: int
    distribution: list[int]
    results: list[ResultEntry]


class RankingEntry(_ServerMessage):
    rank: int
    name: str
    score: int


class LeaderboardMessage(_ServerMessage):
    type: Literal["leaderboard"] = "leaderboard"
    rankings: list[RankingEntry]


class KickedMessage(_ServerMessage):
    type: Literal["kicked"] = "kicked"


class ErrorMessage(_ServerMessage):
    type: Literal["error"] = "error"
    code: ErrorCode
    message: str

    @classmethod
    def from_error(cls, error: RoomError) -> "ErrorMessage":
        return cls(code=error.code, message=error.message)
