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

export type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'answer'; question_id: number; choice: number } // choice: 0-based option index

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

/**
 * A new question. Never contains the correct answer.
 * Times are Unix seconds on the server's clock: `ends_at - server_time` is the time left.
 */
export interface QuestionMessage {
  type: 'question'
  id: number
  index: number // 0-based position: index 3 is "Question 4"
  total: number
  text: string
  options: string[]
  time_limit: number
  ends_at: number
  server_time: number
}

/** The server got this player's answer (it does not say whether it was right). */
export interface AnswerAckMessage {
  type: 'answer_ack'
  question_id: number
}

/** How many connected players have answered so far. Sent to everyone after each answer. */
export interface AnswerCountMessage {
  type: 'answer_count'
  question_id: number
  answered: number
  total: number
}

export interface ErrorMessage {
  type: 'error'
  code: ErrorCode
  message: string
}

export type ServerMessage =
  | JoinedMessage
  | LobbyMessage
  | QuestionMessage
  | AnswerAckMessage
  | AnswerCountMessage
  | ErrorMessage
