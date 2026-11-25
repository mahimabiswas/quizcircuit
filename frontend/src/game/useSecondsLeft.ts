import { useEffect, useState } from 'react'
import type { QuestionMessage } from '../protocol'

const TICK_MS = 250 // a few times a second, so the number never lags visibly

/**
 * Seconds left on a question at `nowMs` (this device's Date.now()).
 * Between 0 and the question's time limit.
 *
 * Uses the server's clock (this device's time + clockOffset), so a device whose
 * clock is wrong still counts down correctly. The upper cap matters because the
 * ticking `now` can be up to one tick old when a question arrives, which would
 * otherwise show 21 on a 20-second question for a moment.
 */
export function secondsLeftAt(
  question: QuestionMessage | null,
  clockOffset: number,
  nowMs: number,
): number {
  if (question === null) return 0
  const serverNow = nowMs / 1000 + clockOffset
  const left = question.ends_at - serverNow
  return Math.min(question.time_limit, Math.max(0, left))
}

/** The same, recomputed every tick so the screen counts down. Display only:
 *  the server decides whether an answer was in time. */
export function useSecondsLeft(question: QuestionMessage | null, clockOffset: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  return secondsLeftAt(question, clockOffset, now)
}
