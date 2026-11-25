// The host's side of the game, at /host/:code. Joins as host with the token
// saved when the room was created, then picks a screen from the game state.

import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Logo } from '../components/Logo'
import { getHostToken } from '../game/hostToken'
import type { SocketFactory } from '../game/socket'
import { useGame } from '../game/useGame'
import { useSecondsLeft } from '../game/useSecondsLeft'
import { HostLeaderboardPage } from './HostLeaderboardPage'
import { HostQuestionPage } from './HostQuestionPage'
import { HostRevealPage } from './HostRevealPage'
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
  // Hooks must run on every render, before any early return below.
  const secondsLeft = useSecondsLeft(state.question, state.clockOffset)

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

  if (state.phase === 'finished' && state.rankings) {
    return <HostLeaderboardPage rankings={state.rankings} />
  }

  if (state.phase === 'question' && state.question) {
    return (
      <HostQuestionPage
        code={code}
        question={state.question}
        secondsLeft={secondsLeft}
        answered={state.answerCount?.answered ?? 0}
        // Before the first answer the server hasn't sent a count yet: use the lobby size.
        totalPlayers={state.answerCount?.total ?? state.players.length}
      />
    )
  }

  if (state.phase === 'reveal' && state.question && state.reveal) {
    return (
      <HostRevealPage code={code} question={state.question} reveal={state.reveal} onNext={next} />
    )
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
