import { describe, expect, it } from 'vitest'
import type { PlayerResult } from '../protocol'
import { formatPoints, ordinal, rankOf, winnerLine } from './standings'

function result(name: string, total: number): PlayerResult {
  return { name, correct: false, points: 0, total }
}

describe('rankOf', () => {
  const results = [result('Tom', 900), result('Priya', 1840), result('Aisha', 900), result('Mei', 0)]

  it('ranks by total score, highest first', () => {
    expect(rankOf(results, 'Priya')).toBe(1)
    expect(rankOf(results, 'Mei')).toBe(4)
  })

  it('gives tied players the same rank', () => {
    expect(rankOf(results, 'Tom')).toBe(2)
    expect(rankOf(results, 'Aisha')).toBe(2)
  })

  it('returns null for a player not in the results', () => {
    expect(rankOf(results, 'Ghost')).toBeNull()
  })
})

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [50, '50th'],
  ])('%i -> %s', (n, expected) => {
    expect(ordinal(n)).toBe(expected)
  })
})

describe('winnerLine', () => {
  it('names a single winner', () => {
    expect(
      winnerLine([
        { rank: 1, name: 'Priya', score: 7420 },
        { rank: 2, name: 'Tom', score: 6980 },
      ]),
    ).toBe('Priya takes the win with 7,420 points')
  })

  it('names two tied winners', () => {
    expect(
      winnerLine([
        { rank: 1, name: 'Priya', score: 900 },
        { rank: 1, name: 'Tom', score: 900 },
        { rank: 3, name: 'Mei', score: 0 },
      ]),
    ).toBe('Priya and Tom share the win with 900 points')
  })

  it('names three or more tied winners', () => {
    expect(
      winnerLine([
        { rank: 1, name: 'A', score: 0 },
        { rank: 1, name: 'B', score: 0 },
        { rank: 1, name: 'C', score: 0 },
      ]),
    ).toBe('A, B and C share the win with 0 points')
  })

  it('returns null when nobody played', () => {
    expect(winnerLine([])).toBeNull()
  })
})

describe('formatPoints', () => {
  it('adds thousands separators', () => {
    expect(formatPoints(920)).toBe('920')
    expect(formatPoints(1840)).toBe('1,840')
    expect(formatPoints(12400)).toBe('12,400')
  })
})
