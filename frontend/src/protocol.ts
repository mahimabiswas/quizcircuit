// Message types from docs/protocol.md (mirrors backend/app/models.py).
// Only what the screens built so far need; each new screen adds its messages here.

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'NAME_TAKEN'
  | 'NAME_INVALID'
  | 'ROOM_FULL'
  | 'GAME_STARTED'
  | 'NOT_HOST'
  | 'WRONG_STATE'
  | 'ALREADY_ANSWERED'
  | 'TIME_UP'
  | 'BAD_MESSAGE'

// --- client -> server ---------------------------------------------------------

export type ClientMessage = { type: 'join'; name: string }

// --- server -> client ---------------------------------------------------------

export interface JoinedMessage {
  type: 'joined'
  role: 'host' | 'player'
  name: string
}

/** Everyone in the room, in join order. Sent on every join, leave and kick. */
export interface LobbyMessage {
  type: 'lobby'
  players: string[]
}

export interface ErrorMessage {
  type: 'error'
  code: ErrorCode
  message: string
}

export type ServerMessage = JoinedMessage | LobbyMessage | ErrorMessage
