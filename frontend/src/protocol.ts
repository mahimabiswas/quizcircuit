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
  | { type: 'join'; name: string; host_token?: string } // with host_token: join as host
  | { type: 'answer'; question_id: number; choice: number } // choice: 0-based option index
  // Host only:
  | { type: 'start' } // in the lobby: start the game
  | { type: 'kick'; name: string } // in the lobby: remove a player
  | { type: 'next' } // after a reveal: next question, or the final leaderboard

// --- REST -----------------------------------------------------------------------

export interface QuestionInput {
  text: string
  options: string[]
  correct: number // index of the right option
}

export interface CreateRoomRequest {
  time_limit: number // seconds per question
  questions: QuestionInput[]
}

export interface CreateRoomResponse {
  code: string
  host_token: string // secret: whoever has it can run the game
}

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

export interface PlayerResult {
  name: string
  correct: boolean
  points: number // scored on this question
  total: number // score so far, including this question
}

/** Sent when a question ends. The first time the correct answer is revealed. */
export interface RevealMessage {
  type: 'reveal'
  question_id: number
  correct: number // index of the correct option
  distribution: number[] // distribution[i] = how many players picked option i
  results: PlayerResult[] // one per player, including players who did not answer
}

export interface Ranking {
  rank: number // ties share a rank: 1, 1, 3
  name: string
  score: number
}

/** Sent after the last reveal, when the host moves on. The game is over. */
export interface LeaderboardMessage {
  type: 'leaderboard'
  rankings: Ranking[] // best first
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
  | RevealMessage
  | LeaderboardMessage
  | ErrorMessage
