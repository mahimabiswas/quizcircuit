import os
from pathlib import PurePath
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, StrictInt

from app import quizgen
from app.ratelimit import RateLimiter
from app.registry import RoomRegistry
from app.rooms import Question, RoomError, State
from app.ws import router as ws_router

# Uploads for quiz generation.
MAX_FILES = 3
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
FILE_TYPES = {".pdf": quizgen.PDF, ".txt": "text/plain", ".md": "text/markdown"}

# Each generation costs an OpenAI call, so each IP gets a few per rolling 24 hours.
GENERATIONS_PER_IP = 3
GENERATION_WINDOW_SECONDS = 24 * 60 * 60


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


class GeneratedQuiz(BaseModel):
    questions: list[quizgen.Question]


def create_app() -> FastAPI:
    app = FastAPI(title="QuizCircuit")
    app.state.registry = RoomRegistry()
    app.state.generate_limiter = RateLimiter(GENERATIONS_PER_IP, GENERATION_WINDOW_SECONDS)
    app.include_router(ws_router)

    # The frontend is on another domain in production (Vercel), so browsers need
    # permission to call this API from it. Unset in dev: Vite's proxy makes it one origin.
    if origins := frontend_origins():
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type"],
        )

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

    @app.post("/quizzes/generate")
    async def generate_quiz(
        request: Request,
        files: Annotated[list[UploadFile], File()] = [],  # noqa: B006 (FastAPI form default)
        count: Annotated[int, Form(ge=quizgen.MIN_QUESTIONS, le=quizgen.MAX_QUESTIONS)] = 10,
        true_false: Annotated[int | None, Form(ge=0)] = None,
    ) -> GeneratedQuiz:
        """Generate questions from 1-3 uploaded documents. Nothing is stored."""
        if true_false is not None and true_false > count:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "true_false can't be more than count"
            )
        documents = await _read_documents(files)  # bad uploads don't use up a turn

        limiter: RateLimiter = request.app.state.generate_limiter
        ip = request.client.host if request.client else "unknown"
        wait = limiter.take(ip)
        if wait is not None:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"You've used your {limiter.limit} quiz generations for today. "
                f"Try again in {_how_long(wait)}.",
                headers={"Retry-After": str(int(wait) + 1)},
            )
        try:
            questions = await quizgen.generate_quiz(documents, count, true_false)
        except quizgen.QuizGenError as exc:
            limiter.give_back(ip)  # the AI failed, so the host gets this turn back
            raise HTTPException(exc.status, exc.message) from None
        return GeneratedQuiz(questions=questions)

    return app


def frontend_origins() -> list[str]:
    """FRONTEND_ORIGIN, e.g. "https://quizcircuit.vercel.app" (comma-separate several)."""
    raw = os.environ.get("FRONTEND_ORIGIN", "")
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


def _how_long(seconds: float) -> str:
    """3600 -> "1 hour", 300 -> "5 minutes" (rounded up; at least 1 minute)."""
    minutes = max(1, -(-int(seconds) // 60))
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    hours = -(-minutes // 60)
    return f"{hours} hour{'s' if hours != 1 else ''}"


def _registry(request: Request) -> RoomRegistry:
    return request.app.state.registry


async def _read_documents(files: list[UploadFile]) -> list[quizgen.Document]:
    """Check the uploads before spending a model call on them."""
    if not files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Upload at least one file.")
    if len(files) > MAX_FILES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Upload at most {MAX_FILES} files.")

    documents: list[quizgen.Document] = []
    taken: set[str] = set()
    for upload in files:
        name = _unique_name(_clean_name(upload.filename), taken)
        mime_type = FILE_TYPES.get(PurePath(name).suffix.lower())
        if mime_type is None:
            raise HTTPException(
                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                f'"{name}" isn\'t a PDF, TXT or MD file. Export slides as PDF first.',
            )
        data = await upload.read(MAX_FILE_BYTES + 1)  # never read more than we accept
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(
                status.HTTP_413_CONTENT_TOO_LARGE, f'"{name}" is larger than 10 MB.'
            )
        if not data.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f'"{name}" is empty.')
        if mime_type == quizgen.PDF and not data.startswith(b"%PDF-"):
            raise HTTPException(
                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f'"{name}" isn\'t a valid PDF.'
            )
        documents.append(quizgen.Document(name, mime_type, data))
    return documents


def _clean_name(filename: str | None) -> str:
    """Just the file name (no folders), at most 100 characters."""
    name = PurePath((filename or "").replace("\\", "/")).name.strip()
    return (name or "document")[:100]


def _unique_name(name: str, taken: set[str]) -> str:
    """Sources cite files by name, so two uploads can't share one: "notes (2).pdf"."""
    path, n, candidate = PurePath(name), 2, name
    while candidate.casefold() in taken:
        candidate = f"{path.stem} ({n}){path.suffix}"
        n += 1
    taken.add(candidate.casefold())
    return candidate


app = create_app()
