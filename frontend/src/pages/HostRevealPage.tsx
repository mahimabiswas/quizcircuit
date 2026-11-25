// The host's view after a question ends: the right answer, how the room
// answered, the best scorers this round, and Next.

import { useState } from 'react'
import { Logo } from '../components/Logo'
import { formatPoints, topScorers } from '../game/standings'
import type { QuestionMessage, RevealMessage } from '../protocol'

const LETTERS = 'ABCDEFGH'

interface HostRevealPageProps {
  code: string
  question: QuestionMessage
  reveal: RevealMessage
  onNext: () => void
}

export function HostRevealPage({ code, question, reveal, onNext }: HostRevealPageProps) {
  // Disable Next after one click so a double-click can't send it twice.
  // (This page is replaced by the next question, which resets it.)
  const [nextPressed, setNextPressed] = useState(false)
  const isLast = question.index + 1 === question.total

  function handleNext() {
    setNextPressed(true)
    onNext()
  }

  return (
    <div className="flex min-h-dvh flex-col">
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
        <span className="rounded-full bg-surface-raised px-3 py-1 text-xs text-muted">Time's up</span>
      </header>

      {/* Laptops and big screens (lg): main column + a side column. Smaller: one column. */}
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 pb-6 sm:px-8 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-border bg-surface p-6">
            <h1 className="text-xl font-bold leading-snug sm:text-2xl">{question.text}</h1>
          </section>

          <Options question={question} correct={reveal.correct} />
          <HowPlayersAnswered reveal={reveal} />
        </div>

        <aside className="flex flex-col gap-4">
          <TopThisRound reveal={reveal} />
          <button
            type="button"
            onClick={handleNext}
            disabled={nextPressed}
            className="rounded-lg bg-accent py-3 font-semibold hover:bg-accent-hover disabled:opacity-40"
          >
            {isLast ? 'Show final results' : 'Next question'}
          </button>
        </aside>
      </main>
    </div>
  )
}

function Options({ question, correct }: { question: QuestionMessage; correct: number }) {
  return (
    <ul aria-label="Answer options" className="grid gap-3 sm:grid-cols-2">
      {question.options.map((option, i) => {
        const isCorrect = i === correct
        return (
          <li
            key={i}
            aria-current={isCorrect ? 'true' : undefined}
            className={`flex items-center gap-3 rounded-xl border p-4 ${
              isCorrect ? 'border-correct bg-correct/10' : 'border-border bg-surface opacity-60'
            }`}
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-lg text-sm font-semibold ${
                isCorrect ? 'bg-correct/20 text-correct' : 'bg-surface-raised text-muted'
              }`}
            >
              {LETTERS[i]}
            </span>
            <span className="flex-1">{option}</span>
            {isCorrect && (
              <span className="text-correct" aria-label="Correct answer">
                ✓
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function HowPlayersAnswered({ reveal }: { reveal: RevealMessage }) {
  const players = reveal.results.length
  const answered = reveal.distribution.reduce((sum, n) => sum + n, 0)
  const noAnswer = players - answered

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-semibold">How players answered</h2>
      <ul className="mt-4 space-y-3">
        {reveal.distribution.map((count, i) => {
          const isCorrect = i === reveal.correct
          // Bar length = share of all players who picked this option.
          const width = players > 0 ? (count / players) * 100 : 0
          return (
            <li key={i} className="flex items-center gap-3 text-sm">
              <span className={`w-4 font-semibold ${isCorrect ? 'text-correct' : 'text-muted'}`}>
                {LETTERS[i]}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                <div
                  className={`h-full rounded-full ${isCorrect ? 'bg-correct' : 'bg-accent'}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="w-20 text-right text-muted">
                {count} {count === 1 ? 'player' : 'players'}
              </span>
            </li>
          )
        })}
      </ul>
      {noAnswer > 0 && (
        <p className="mt-4 text-sm text-muted">
          {noAnswer} {noAnswer === 1 ? 'player' : 'players'} didn't answer
        </p>
      )}
    </section>
  )
}

function TopThisRound({ reveal }: { reveal: RevealMessage }) {
  const top = topScorers(reveal.results)

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-semibold">Top 3 this round</h2>
      {top.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nobody scored this round.</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {top.map((r) => (
            <li
              key={r.name}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                r.rank === 1 ? 'bg-accent/15' : 'bg-surface-raised'
              }`}
            >
              <span className="w-4 text-muted">{r.rank}</span>
              <span className="flex-1 font-medium">{r.name}</span>
              <span className="text-accent">+{formatPoints(r.points)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
