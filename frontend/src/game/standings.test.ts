import { describe, expect, it } from 'vitest'
import type { PlayerResult } from '../protocol'
import { formatPoints, ordinal, rankOf } from './standings'

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

describe('formatPoints', () => {
  it('adds thousands separators', () => {
    expect(formatPoints(920)).toBe('920')
    expect(formatPoints(1840)).toBe('1,840')
    expect(formatPoints(12400)).toBe('12,400')
  })
})
