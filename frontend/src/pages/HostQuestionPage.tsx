// The host's view of an open question: the "big screen" the room looks at.
// Players answer on their own devices (phone or laptop); the options here are display only.

import { Logo } from '../components/Logo'
import { TimerRing } from '../components/TimerRing'
import type { QuestionMessage } from '../protocol'

const LETTERS = 'ABCDEFGH'

interface HostQuestionPageProps {
  code: string
  question: QuestionMessage
  secondsLeft: number
  answered: number
  /** Players who can still answer (connected players). */
  totalPlayers: number
}

export function HostQuestionPage({
  code,
  question,
  secondsLeft,
  answered,
  totalPlayers,
}: HostQuestionPageProps) {
  const timeFraction = question.time_limit > 0 ? secondsLeft / question.time_limit : 0

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Thin bar across the top that shrinks as time runs out. */}
      <div className="h-1 bg-border" aria-hidden>
        <div
          className="h-full bg-accent transition-[width] duration-300 ease-linear"
          style={{ width: `${Math.max(0, Math.min(1, timeFraction)) * 100}%` }}
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Logo />
          <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent">
            Question {question.index + 1} of {question.total}
          </span>
          <span className="rounded-full bg-surface-raised px-3 py-1 text-xs text-muted">
            Join code {code}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <p className="text-right" aria-live="polite">
            <span className="block text-xl font-bold">
              {answered} / {totalPlayers}
            </span>
            <span className="text-xs text-muted">answered</span>
          </p>
          <TimerRing secondsLeft={secondsLeft} timeLimit={question.time_limit} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 pb-6 sm:px-8">
        <section className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-border bg-surface px-6 py-10 text-center sm:py-16">
          <h1 className="max-w-3xl text-2xl font-bold leading-snug sm:text-4xl">{question.text}</h1>
          <p className="mt-4 text-muted">Choose one answer. Faster correct answers score more.</p>
        </section>

        {/* Narrow screens: one column. Laptops and big screens: a 2x2 grid. */}
        <ul aria-label="Answer options" className="grid gap-3 sm:grid-cols-2">
          {question.options.map((option, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 sm:text-lg"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-raised text-sm font-semibold text-muted">
                {LETTERS[i]}
              </span>
              {option}
            </li>
          ))}
        </ul>

        <p className="pt-2 text-sm text-muted">Players answer on their own devices.</p>
      </main>
    </div>
  )
}
