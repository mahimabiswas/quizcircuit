"""WebSocket endpoint: /ws/{code}. Parses frames and routes them to the LiveRoom.

All game rules live in Room and LiveRoom; this module only handles the
connection lifecycle (join handshake, message loop, cleanup on disconnect)
and turns RoomError into protocol `error` messages.
"""

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.live import LiveRoom, Member
from app.models import (
    AnswerMessage,
    ClientMessage,
    ErrorMessage,
    JoinMessage,
    KickMessage,
    StartMessage,
    parse_client_message,
)
from app.registry import RoomRegistry
from app.rooms import ErrorCode, RoomError

log = logging.getLogger(__name__)

JOIN_TIMEOUT = 30.0
CLOSE_ROOM_NOT_FOUND = 4404
CLOSE_JOIN_TIMEOUT = 4408

router = APIRouter()


@router.websocket("/ws/{code}")
async def room_socket(websocket: WebSocket, code: str) -> None:
    await websocket.accept()
    registry: RoomRegistry = websocket.app.state.registry
    try:
        live = registry.get(code)
    except RoomError as error:
        await _send_error(websocket, error)
        await _close(websocket, CLOSE_ROOM_NOT_FOUND)
        return

    try:
        async with asyncio.timeout(JOIN_TIMEOUT):
            member = await _join_handshake(websocket, live)
    except TimeoutError:
        await _close(websocket, CLOSE_JOIN_TIMEOUT)
        return
    except WebSocketDisconnect:
        return

    try:
        await _message_loop(websocket, live, member)
    except WebSocketDisconnect:
        pass
    finally:
        await live.leave(member)


async def _join_handshake(websocket: WebSocket, live: LiveRoom) -> Member:
    """Wait for a successful `join`. Failed attempts get an error and may retry."""
    while True:
        raw = await _receive(websocket)
        try:
            message = parse_client_message(raw)
            if not isinstance(message, JoinMessage):
                raise RoomError(ErrorCode.BAD_MESSAGE, "the first message must be join")
            return await live.join(websocket, message.name, message.host_token)
        except RoomError as error:
            await _send_error(websocket, error)


async def _message_loop(websocket: WebSocket, live: LiveRoom, member: Member) -> None:
    while True:
        raw = await _receive(websocket)
        try:
            await _dispatch(live, member, parse_client_message(raw))
        except RoomError as error:
            await _send_error(websocket, error)


async def _dispatch(live: LiveRoom, member: Member, message: ClientMessage) -> None:
    match message:
        case JoinMessage():
            raise RoomError(ErrorCode.WRONG_STATE, "already joined")
        case StartMessage():
            await live.start(member)
        case AnswerMessage(question_id=question_id, choice=choice):
            await live.answer(member, question_id, choice)
        case KickMessage(name=name):
            await live.kick(member, name)


async def _receive(websocket: WebSocket) -> str | bytes:
    """Next text or binary frame. Raises WebSocketDisconnect when the client leaves."""
    message = await websocket.receive()
    if message["type"] == "websocket.disconnect":
        raise WebSocketDisconnect(message.get("code", 1000))
    return message.get("text") or message.get("bytes") or ""


async def _send_error(websocket: WebSocket, error: RoomError) -> None:
    try:
        await websocket.send_json(ErrorMessage.from_error(error).model_dump(mode="json"))
    except Exception:
        log.info("could not send error", exc_info=True)


async def _close(websocket: WebSocket, code: int) -> None:
    try:
        await websocket.close(code=code)
    except Exception:
        log.info("could not close socket", exc_info=True)
