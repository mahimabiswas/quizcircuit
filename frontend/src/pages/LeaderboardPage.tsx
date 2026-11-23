import { Logo } from '../components/Logo'
import { formatPoints, ordinal } from '../game/standings'
import type { Ranking } from '../protocol'

interface LeaderboardPageProps {
  name: string // this player
  rankings: Ranking[] // best first; ties share a rank
  onDone: () => void
}

export function LeaderboardPage({ name, rankings, onDone }: LeaderboardPageProps) {
  const mine = rankings.find((r) => r.name === name)
  const tied = mine !== undefined && rankings.filter((r) => r.rank === mine.rank).length > 1

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>

      <main className="flex flex-1 flex-col items-center px-4 pb-6 sm:justify-center">
        <div className="flex w-full max-w-sm flex-1 flex-col sm:max-w-md sm:flex-none sm:rounded-2xl sm:border sm:border-border sm:bg-surface sm:p-8">
          {mine && (
            <div className="text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-accent text-3xl font-bold">
                {mine.rank}
              </div>
              <h1 className="mt-5 text-2xl font-bold">
                {tied ? 'You tied for' : 'You finished'} {ordinal(mine.rank)}!
              </h1>
              <p className="mt-1 text-2xl font-bold text-accent">
                {formatPoints(mine.score)} points
              </p>
            </div>
          )}

          <ol className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface sm:bg-surface-raised">
            {rankings.map((r) => {
              const isMe = r.name === name
              return (
                <li
                  key={r.name}
                  aria-current={isMe ? 'true' : undefined}
                  className={`flex items-center gap-3 px-4 py-3 text-sm ${isMe ? 'bg-accent/15' : ''}`}
                >
                  <span className="w-5 text-muted">{r.rank}</span>
                  <span className={`flex-1 ${isMe ? 'font-semibold' : ''}`}>
                    {r.name}
                    {isMe && ' (you)'}
                  </span>
                  <span className={isMe ? 'font-semibold text-accent' : 'text-muted'}>
                    {formatPoints(r.score)}
                  </span>
                </li>
              )
            })}
          </ol>

          {/* mt-auto keeps Done at the bottom of a phone screen; pt-6 keeps a gap
              above it when the list is long. */}
          <div className="mt-auto pt-6 sm:mt-0 sm:pt-8">
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-lg bg-accent py-3 font-semibold hover:bg-accent-hover"
            >
              Done
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
