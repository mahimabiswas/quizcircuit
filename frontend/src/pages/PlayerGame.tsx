// The player's side of the game: picks which screen to show from the game state.
// Each later screen (question, reveal, leaderboard) adds a branch here.

import { useGame } from '../game/useGame'
import type { SocketFactory } from '../game/socket'
import { JoinPage } from './JoinPage'
import { WaitingPage } from './WaitingPage'

interface PlayerGameProps {
  /** Tests pass a fake socket; the app uses the real browser WebSocket. */
  createSocket?: SocketFactory
}

export function PlayerGame({ createSocket }: PlayerGameProps) {
  const { state, join } = useGame(createSocket)

  if (state.phase === 'lobby' && state.name !== null) {
    return <WaitingPage name={state.name} players={state.players} />
  }

  return <JoinPage onJoin={join} busy={state.phase === 'connecting'} error={state.error} />
}
