// The player's side of the game: picks which screen to show from the game state.
// Each later screen (reveal, leaderboard) adds a branch here.

import { useGame } from '../game/useGame'
import { useSecondsLeft } from '../game/useSecondsLeft'
import type { SocketFactory } from '../game/socket'
import { JoinPage } from './JoinPage'
import { QuestionPage } from './QuestionPage'
import { WaitingPage } from './WaitingPage'

interface PlayerGameProps {
  /** Tests pass a fake socket; the app uses the real browser WebSocket. */
  createSocket?: SocketFactory
}

export function PlayerGame({ createSocket }: PlayerGameProps) {
  const { state, join, answer } = useGame(createSocket)
  // Hooks must run on every render, so this runs even when no question is open.
  const secondsLeft = useSecondsLeft(state.question, state.clockOffset)

  if (state.phase === 'question' && state.question !== null) {
    const { question } = state
    return (
      <QuestionPage
        question={question}
        secondsLeft={secondsLeft}
        myChoice={state.myChoice}
        answered={state.answered}
        answerCount={state.answerCount}
        error={state.error}
        onAnswer={(choice) => answer(question.id, choice)}
      />
    )
  }

  if (state.phase === 'lobby' && state.name !== null) {
    return <WaitingPage name={state.name} players={state.players} />
  }

  return <JoinPage onJoin={join} busy={state.phase === 'connecting'} error={state.error} />
}
