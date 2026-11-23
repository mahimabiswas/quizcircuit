import { formatPoints, ordinal, rankOf } from '../game/standings'
import type { QuestionMessage, RevealMessage } from '../protocol'

const LETTERS = 'ABCDEFGH'

interface RevealPageProps {
  question: QuestionMessage
  reveal: RevealMessage
  name: string // this player
  myChoice: number | null // what they tapped, if anything
}

export function RevealPage({ question, reveal, name, myChoice }: RevealPageProps) {
  const mine = reveal.results.find((r) => r.name === name)
  const correct = mine?.correct ?? false
  const points = mine?.points ?? 0
  const total = mine?.total ?? 0
  const rank = rankOf(reveal.results, name)
  const isLast = question.index + 1 === question.total

  const outcome = correct
    ? { title: 'Correct!', icon: '✓', tone: 'text-correct bg-correct/15' }
    : myChoice === null
      ? { title: 'No answer', icon: '–', tone: 'text-wrong bg-wrong/15' }
      : { title: 'Not quite', icon: '✕', tone: 'text-wrong bg-wrong/15' }

  return (
    <div className="flex min-h-dvh flex-col px-4 py-5">
      <main className="flex flex-1 flex-col items-center justify-center">
        <div className="w-full max-w-sm text-center sm:max-w-md sm:rounded-2xl sm:border sm:border-border sm:bg-surface sm:p-8">
          <div
            className={`mx-auto grid size-14 place-items-center rounded-xl text-2xl font-bold ${outcome.tone}`}
            aria-hidden
          >
            {outcome.icon}
          </div>
          <h1 className="mt-5 text-2xl font-bold">{outcome.title}</h1>

          {correct ? (
            <p className="mt-2 text-5xl font-bold text-correct">+{formatPoints(points)}</p>
          ) : (
            <p className="mt-2 text-muted">+ 0 points</p>
          )}

          {!correct && (
            <div className="mt-6 text-left">
              <p className="text-sm text-muted">The correct answer was:</p>
              <p className="mt-2 flex items-center gap-3 rounded-xl border border-correct/60 bg-correct/10 p-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-correct/20 text-sm font-semibold text-correct">
                  {LETTERS[reveal.correct]}
                </span>
                <span>{question.options[reveal.correct]}</span>
              </p>
            </div>
          )}

          <dl className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface text-left text-sm sm:bg-surface-raised">
            {rank !== null && (
              <div className="flex justify-between p-3">
                <dt className="text-muted">Your rank</dt>
                <dd className="font-semibold">
                  {ordinal(rank)} of {reveal.results.length}
                </dd>
              </div>
            )}
            <div className="flex justify-between p-3">
              <dt className="text-muted">Total score</dt>
              <dd className="font-semibold">{formatPoints(total)} pts</dd>
            </div>
          </dl>
        </div>
      </main>

      <footer className="pb-2 text-center text-sm text-muted">
        {isLast ? 'Final results coming up…' : 'Next question coming up…'}
      </footer>
    </div>
  )
}
