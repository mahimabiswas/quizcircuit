// The player's side of the game: picks which screen to show from the game state.
// join -> waiting -> question <-> reveal -> leaderboard

import { useGame } from '../game/useGame'
import { useSecondsLeft } from '../game/useSecondsLeft'
import type { SocketFactory } from '../game/socket'
import { JoinPage } from './JoinPage'
import { LeaderboardPage } from './LeaderboardPage'
import { QuestionPage } from './QuestionPage'
import { RevealPage } from './RevealPage'
import { WaitingPage } from './WaitingPage'

interface PlayerGameProps {
  /** Tests pass a fake socket; the app uses the real browser WebSocket. */
  createSocket?: SocketFactory
}

export function PlayerGame({ createSocket }: PlayerGameProps) {
  const { state, join, answer, leave } = useGame(createSocket)
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

  if (state.phase === 'finished' && state.rankings && state.name !== null) {
    return <LeaderboardPage name={state.name} rankings={state.rankings} onDone={leave} />
  }

  if (state.phase === 'reveal' && state.reveal && state.question && state.name !== null) {
    return (
      <RevealPage
        question={state.question}
        reveal={state.reveal}
        name={state.name}
        myChoice={state.myChoice}
      />
    )
  }

  if (state.phase === 'lobby' && state.name !== null) {
    return <WaitingPage name={state.name} players={state.players} />
  }

  return <JoinPage onJoin={join} busy={state.phase === 'connecting'} error={state.error} />
}
