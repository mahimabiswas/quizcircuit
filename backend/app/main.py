from typing import Annotated

from fastapi import FastAPI, HTTPException, Request, status
from pydantic import BaseModel, Field, StrictInt

from app.registry import RoomRegistry
from app.rooms import Question, RoomError, State
from app.ws import router as ws_router


class QuestionIn(BaseModel):
    text: Annotated[str, Field(min_length=1)]
    options: Annotated[list[Annotated[str, Field(min_length=1)]], Field(min_length=2)]
    correct: StrictInt


class CreateRoomRequest(BaseModel):
    time_limit: Annotated[float, Field(gt=0)]
    questions: Annotated[list[QuestionIn], Field(min_length=1)]


class CreateRoomResponse(BaseModel):
    code: str
    host_token: str


class RoomInfo(BaseModel):
    code: str
    state: State
    player_count: int


def create_app() -> FastAPI:
    app = FastAPI(title="QuizCircuit")
    app.state.registry = RoomRegistry()
    app.include_router(ws_router)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/rooms", status_code=status.HTTP_201_CREATED)
    def create_room(body: CreateRoomRequest, request: Request) -> CreateRoomResponse:
        questions = [Question(q.text, q.options, q.correct) for q in body.questions]
        try:
            room = _registry(request).create(questions, body.time_limit).room
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from None
        return CreateRoomResponse(code=room.code, host_token=room.host_token)

    @app.get("/rooms/{code}")
    def get_room(code: str, request: Request) -> RoomInfo:
        try:
            room = _registry(request).get(code).room
        except RoomError:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "room not found") from None
        return RoomInfo(code=room.code, state=room.state, player_count=len(room.lobby_names()))

    return app


def _registry(request: Request) -> RoomRegistry:
    return request.app.state.registry


app = create_app()
