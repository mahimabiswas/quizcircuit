// The player's game state. A pure function of what has happened so far:
// no sockets, no React. useGame.ts feeds it events.

import type { ErrorCode, ServerMessage } from '../protocol'

export type Phase =
  | 'idle' // showing the join form
  | 'connecting' // Join pressed, waiting for the server to accept
  | 'lobby' // joined, waiting for the host to start
  | 'disconnected' // the connection dropped after joining

/** Server error codes, plus two the client detects itself. */
export type JoinErrorCode = ErrorCode | 'CONNECTION_FAILED' | 'CONNECTION_LOST'

export interface GameState {
  phase: Phase
  name: string | null // as the server accepted it (trimmed)
  players: string[] // everyone in the lobby, in join order
  error: JoinErrorCode | null
}

export type GameAction =
  | { type: 'connecting' } // the player pressed Join
  | { type: 'server'; message: ServerMessage } // a message arrived
  | { type: 'closed' } // the socket closed

export const initialState: GameState = {
  phase: 'idle',
  name: null,
  players: [],
  error: null,
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'connecting':
      return { ...state, phase: 'connecting', error: null }

    case 'server':
      return onMessage(state, action.message)

    case 'closed':
      if (state.phase === 'lobby') return { ...state, phase: 'disconnected', error: 'CONNECTION_LOST' }
      if (state.phase === 'connecting') {
        // Closed before we got in: the server never answered, or we couldn't reach it.
        return { ...state, phase: 'idle', error: state.error ?? 'CONNECTION_FAILED' }
      }
      return state // already back on the form (e.g. ROOM_NOT_FOUND, then the server closes)
  }
}

function onMessage(state: GameState, message: ServerMessage): GameState {
  switch (message.type) {
    case 'joined':
      return { ...state, phase: 'lobby', name: message.name, error: null }
    case 'lobby':
      return { ...state, players: message.players }
    case 'error':
      // While joining, an error sends the player back to the form to fix it.
      // The server keeps the socket open, so they can try again on it.
      return state.phase === 'connecting'
        ? { ...state, phase: 'idle', error: message.code }
        : { ...state, error: message.code }
  }
}
