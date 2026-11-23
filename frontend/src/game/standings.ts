// Where a player stands after a question. Pure functions, tested in standings.test.ts.

import type { PlayerResult } from '../protocol'

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
