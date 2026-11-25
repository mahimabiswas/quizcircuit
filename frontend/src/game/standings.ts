// Where a player stands after a question. Pure functions, tested in standings.test.ts.

import type { PlayerResult, Ranking } from '../protocol'

/**
 * A player's rank by total score: 1 + the number of players strictly ahead.
 * Ties share a rank (1, 1, 3), the same rule as the final leaderboard.
 * Returns null if the player is not in the results.
 */
export function rankOf(results: PlayerResult[], name: string): number | null {
  const me = results.find((r) => r.name === name)
  if (!me) return null
  return 1 + results.filter((r) => r.total > me.total).length
}

export interface RoundScore {
  rank: number
  name: string
  points: number
}

/**
 * The best scorers on one question ("Top 3 this round"), by points earned on it.
 * Players who scored nothing are left out. Ties share a rank; players tied with
 * the last place shown are included, so the list can be longer than `limit`.
 */
export function topScorers(results: PlayerResult[], limit = 3): RoundScore[] {
  const scored = results.filter((r) => r.points > 0).sort((a, b) => b.points - a.points)
  const ranked = scored.map((r) => ({
    rank: 1 + scored.filter((other) => other.points > r.points).length,
    name: r.name,
    points: r.points,
  }))
  return ranked.filter((r) => r.rank <= limit)
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th` // 11th, 12th, 13th
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** 1840 -> "1,840" */
export function formatPoints(points: number): string {
  return points.toLocaleString('en-US')
}

/**
 * "Priya takes the win with 7,420 points", or for a tie
 * "Priya and Tom share the win with 7,420 points". Null if nobody played.
 */
export function winnerLine(rankings: Ranking[]): string | null {
  const winners = rankings.filter((r) => r.rank === 1)
  if (winners.length === 0) return null
  const points = `${formatPoints(winners[0].score)} points`
  if (winners.length === 1) return `${winners[0].name} takes the win with ${points}`
  return `${listNames(winners.map((w) => w.name))} share the win with ${points}`
}

/** ["A"] -> "A", ["A", "B"] -> "A and B", ["A", "B", "C"] -> "A, B and C" */
function listNames(names: string[]): string {
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
