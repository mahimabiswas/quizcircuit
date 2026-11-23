// The host's side of the game, at /host/:code. Joins as host with the token
// saved when the room was created, then picks a screen from the game state.

import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Logo } from '../components/Logo'
import { getHostToken } from '../game/hostToken'
import type { GameState } from '../game/reducer'
import type { SocketFactory } from '../game/socket'
import { useGame } from '../game/useGame'
import { InvitePage } from './InvitePage'

const HOST_NAME = 'Host'

interface HostGameProps {
  /** Tests pass a fake socket; the app uses the real browser WebSocket. */
  createSocket?: SocketFactory
}

export function HostGame({ createSocket }: HostGameProps) {
  const code = (useParams().code ?? '').toUpperCase()
  const token = getHostToken(code)
  const { state, join, start, kick, next } = useGame(createSocket)

  // Connect as host as soon as the page opens.
  useEffect(() => {
    if (token) join(code, HOST_NAME, token)
  }, [code, token, join])

  if (!token) {
    return (
      <Notice title="You're not the host of this game">
        Only the browser tab that created a game can host it.
      </Notice>
    )
  }

  if (state.phase === 'idle' && state.error) {
    return (
      <Notice title="Couldn't open this game">
        {state.error === 'ROOM_NOT_FOUND'
          ? 'This game no longer exists.'
          : "The game server couldn't be reached, or didn't accept this host."}
      </Notice>
    )
  }

  if (state.phase === 'disconnected') {
    return (
      <Notice title="Lost the connection">
        <button
          type="button"
          onClick={() => join(code, HOST_NAME, token)}
          className="mt-4 rounded-lg bg-accent px-6 py-2 font-semibold hover:bg-accent-hover"
        >
          Reconnect
        </button>
      </Notice>
    )
  }

  if (state.phase === 'lobby') {
    return (
      <InvitePage
        code={code}
        joinUrl={`${window.location.origin}/join/${code}`}
        players={state.players}
        onStart={start}
        onKick={kick}
      />
    )
  }

  if (state.phase === 'question' || state.phase === 'reveal' || state.phase === 'finished') {
    return <TemporaryHostView state={state} onNext={next} />
  }

  return <Notice title="Connecting…" />
}

function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="text-xl font-bold">{title}</h1>
          {children && <div className="mt-2 text-muted">{children}</div>}
          <Link to="/host" className="mt-6 inline-block text-sm text-accent hover:underline">
            Host a new game
          </Link>
        </div>
      </main>
    </div>
  )
}

/**
 * TEMPORARY: a bare-bones view of the game for the host, with a Next button.
 * The host question, reveal and leaderboard screens replace it.
 */
function TemporaryHostView({ state, onNext }: { state: GameState; onNext: () => void }) {
  const { question, answerCount, reveal, rankings } = state
  const isLast = question !== null && question.index + 1 === question.total

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <Logo />
      {state.phase === 'finished' && rankings ? (
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h1 className="text-xl font-bold">Game over</h1>
          <ol className="mt-4 space-y-1 text-sm">
            {rankings.map((r) => (
              <li key={r.name}>
                {r.rank}. {r.name}: {r.score}
              </li>
            ))}
          </ol>
        </section>
      ) : (
        question && (
          <section className="rounded-2xl border border-border bg-surface p-6">
            <p className="text-sm text-muted">
              Question {question.index + 1} of {question.total}
            </p>
            <h1 className="mt-2 text-xl font-bold">{question.text}</h1>
            {state.phase === 'question' && (
              <p className="mt-4 text-muted">
                {answerCount ? `${answerCount.answered} of ${answerCount.total}` : '0'} answered
              </p>
            )}
            {state.phase === 'reveal' && reveal && (
              <>
                <p className="mt-4">
                  Answer: <strong className="text-correct">{question.options[reveal.correct]}</strong>
                </p>
                <button
                  type="button"
                  onClick={onNext}
                  className="mt-6 rounded-lg bg-accent px-6 py-3 font-semibold hover:bg-accent-hover"
                >
                  {isLast ? 'Show final results' : 'Next question'}
                </button>
              </>
            )}
          </section>
        )
      )}
    </div>
  )
}
