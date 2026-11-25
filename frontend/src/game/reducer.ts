// The player's game state. A pure function of what has happened so far:
// no sockets, no React. useGame.ts feeds it events.

import type {
  AnswerCountMessage,
  ErrorCode,
  QuestionMessage,
  Ranking,
  RevealMessage,
  ServerMessage,
} from '../protocol'

export type Phase =
  | 'idle' // showing the join form
  | 'connecting' // Join pressed, waiting for the server to accept
  | 'lobby' // joined, waiting for the host to start
  | 'question' // a question is open
  | 'reveal' // the question ended: showing the right answer and scores
  | 'finished' // the game is over: showing the final leaderboard
  | 'disconnected' // the connection dropped after joining

/** Server error codes, plus two the client detects itself. */
export type JoinErrorCode = ErrorCode | 'CONNECTION_FAILED' | 'CONNECTION_LOST'

export interface GameState {
  phase: Phase
  role: 'host' | 'player' | null // set by the server's `joined`
  name: string | null // as the server accepted it (trimmed)
  players: string[] // everyone in the lobby, in join order
  error: JoinErrorCode | null

  // --- the current question ---
  question: QuestionMessage | null
  /** Server clock minus this device's clock, in seconds. Keeps the countdown honest
   *  even if the device's clock is wrong. */
  clockOffset: number
  /** The option this player tapped (0-based), as soon as they tap it. */
  myChoice: number | null
  /** True once the server confirms it has the answer. */
  answered: boolean
  answerCount: AnswerCountMessage | null
  /** The results of the question that just ended. */
  reveal: RevealMessage | null
  /** The final leaderboard, once the game is over. */
  rankings: Ranking[] | null
}

export type GameAction =
  | { type: 'connecting' } // the player pressed Join
  | { type: 'server'; message: ServerMessage; receivedAt: number } // receivedAt: Date.now()
  | { type: 'answer_sent'; choice: number } // the player tapped an option
  | { type: 'closed' } // the socket closed
  | { type: 'reset' } // the player left ("Join another game"): back to an empty join form

export const initialState: GameState = {
  phase: 'idle',
  role: null,
  name: null,
  players: [],
  error: null,
  question: null,
  clockOffset: 0,
  myChoice: null,
  answered: false,
  answerCount: null,
  reveal: null,
  rankings: null,
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'connecting':
      return { ...state, phase: 'connecting', error: null }

    case 'server':
      return onMessage(state, action.message, action.receivedAt)

    case 'answer_sent':
      return { ...state, myChoice: action.choice, error: null }

    case 'closed':
      if (state.phase === 'lobby' || state.phase === 'question' || state.phase === 'reveal') {
        return { ...state, phase: 'disconnected', error: 'CONNECTION_LOST' }
      }
      if (state.phase === 'connecting') {
        // Closed before we got in: the server never answered, or we couldn't reach it.
        return { ...state, phase: 'idle', error: state.error ?? 'CONNECTION_FAILED' }
      }
      // Otherwise: already back on the form (e.g. ROOM_NOT_FOUND, then the server
      // closes), or the game is over and the leaderboard should stay on screen.
      return state

    case 'reset':
      return initialState
  }
}

function onMessage(state: GameState, message: ServerMessage, receivedAt: number): GameState {
  switch (message.type) {
    case 'joined':
      // A host rejoining mid-game is sent the current question/reveal right after this.
      return { ...state, phase: 'lobby', role: message.role, name: message.name, error: null }

    case 'lobby':
      return { ...state, players: message.players }

    case 'question':
      // A fresh question: forget everything about the previous one.
      return {
        ...state,
        phase: 'question',
        question: message,
        clockOffset: message.server_time - receivedAt / 1000,
        myChoice: null,
        answered: false,
        answerCount: null,
        reveal: null,
        error: null,
      }

    case 'reveal':
      // Keep the question and this player's choice: the reveal screen shows both.
      return { ...state, phase: 'reveal', reveal: message, error: null }

    case 'leaderboard':
      return { ...state, phase: 'finished', rankings: message.rankings, error: null }

    case 'answer_ack':
      return { ...state, answered: true }

    case 'answer_count':
      return { ...state, answerCount: message }

    case 'error':
      if (state.phase === 'connecting') {
        // While joining, an error sends the player back to the form to fix it.
        // The server keeps the socket open, so they can try again on it.
        return { ...state, phase: 'idle', error: message.code }
      }
      if (message.code === 'ALREADY_ANSWERED') {
        return { ...state, answered: true } // the server has our first answer: fine
      }
      return { ...state, error: message.code }

    default:
      // A message type this screen doesn't use yet (e.g. reveal): keep the state as it is.
      return state
  }
}
