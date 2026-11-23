// The host's final screen: the same ranking the players see, plus a way to start over.

import { Link } from 'react-router'
import { Logo } from '../components/Logo'
import { RankingList } from '../components/RankingList'
import { winnerLine } from '../game/standings'
import type { Ranking } from '../protocol'

interface HostLeaderboardPageProps {
  rankings: Ranking[] // best first; ties share a rank
}

export function HostLeaderboardPage({ rankings }: HostLeaderboardPageProps) {
  const winner = winnerLine(rankings)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <span className="rounded-full bg-surface-raised px-3 py-1 text-xs text-muted">Host</span>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 pb-6 sm:justify-center">
        <div className="flex w-full max-w-sm flex-1 flex-col sm:max-w-md sm:flex-none sm:rounded-2xl sm:border sm:border-border sm:bg-surface sm:p-8">
          <div className="text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-accent text-3xl" aria-hidden>
              🏆
            </div>
            <h1 className="mt-5 text-2xl font-bold">Final leaderboard</h1>
            {winner && <p className="mt-1 text-muted">{winner}</p>}
          </div>

          <div className="mt-8">
            <RankingList rankings={rankings} />
          </div>

          {/* Same layout as the players' button: bottom of a phone screen, under the card on laptops. */}
          <div className="mt-auto pt-6 sm:mt-0 sm:pt-8">
            <Link
              to="/host"
              className="block w-full rounded-lg bg-accent py-3 text-center font-semibold hover:bg-accent-hover"
            >
              Start a new game
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
