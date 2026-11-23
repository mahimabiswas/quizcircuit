// The final ranking, used on both the player's and the host's leaderboard.

import { formatPoints } from '../game/standings'
import type { Ranking } from '../protocol'

interface RankingListProps {
  rankings: Ranking[] // best first; ties share a rank
  /** Highlight this player's row and mark it "(you)". The host passes nothing. */
  me?: string
}

export function RankingList({ rankings, me }: RankingListProps) {
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface sm:bg-surface-raised">
      {rankings.map((r) => {
        const isMe = r.name === me
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
  )
}
