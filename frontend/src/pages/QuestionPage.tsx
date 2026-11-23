import { TimerRing } from '../components/TimerRing'
import type { JoinErrorCode } from '../game/reducer'
import type { AnswerCountMessage, QuestionMessage } from '../protocol'

const LETTERS = 'ABCDEFGH'

interface QuestionPageProps {
  question: QuestionMessage
  secondsLeft: number
  /** The option this player tapped, or null. */
  myChoice: number | null
  /** True once the server has confirmed the answer. */
  answered: boolean
  answerCount: AnswerCountMessage | null
  error: JoinErrorCode | null
  onAnswer: (choice: number) => void
}

export function QuestionPage({
  question,
  secondsLeft,
  myChoice,
  answered,
  answerCount,
  error,
  onAnswer,
}: QuestionPageProps) {
  const timeUp = secondsLeft <= 0
  const hasPicked = myChoice !== null
  // One tap only: after picking (or when time is up) every option is locked.
  const locked = hasPicked || timeUp

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-5 sm:px-8">
      <header className="flex items-center justify-between">
        <span className="rounded-full bg-accent/20 px-3 py-1 text-sm font-medium text-accent">
          Question {question.index + 1} of {question.total}
        </span>
        <TimerRing secondsLeft={secondsLeft} timeLimit={question.time_limit} />
      </header>

      <main className="mt-5 flex flex-1 flex-col gap-5">
        <h1 className="rounded-2xl border border-border bg-surface p-5 text-xl font-bold leading-snug sm:p-8 sm:text-center sm:text-2xl">
          {question.text}
        </h1>

        {/* Phones: one column. Laptops: a 2x2 grid, like the desktop design. */}
        <ul className="grid gap-3 sm:grid-cols-2">
          {question.options.map((option, i) => {
            const isMine = myChoice === i
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onAnswer(i)}
                  disabled={locked}
                  aria-pressed={isMine}
                  className={[
                    'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition',
                    isMine
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-surface enabled:hover:border-accent/60',
                    locked && !isMine ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-semibold ${
                      isMine ? 'bg-accent' : 'bg-surface-raised text-muted'
                    }`}
                  >
                    {LETTERS[i]}
                  </span>
                  <span>{option}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <footer className="mt-auto pb-2">
          <Status
            hasPicked={hasPicked}
            answered={answered}
            timeUp={timeUp}
            error={error}
            answerCount={answerCount}
          />
        </footer>
      </main>
    </div>
  )
}

interface StatusProps {
  hasPicked: boolean
  answered: boolean
  timeUp: boolean
  error: JoinErrorCode | null
  answerCount: AnswerCountMessage | null
}

/** The message under the options: what is happening with this player's answer. */
function Status({ hasPicked, answered, timeUp, error, answerCount }: StatusProps) {
  const count = answerCount && (
    <span className="block text-sm text-muted">
      {answerCount.answered} of {answerCount.total} players answered
    </span>
  )

  if (error === 'TIME_UP') {
    return (
      <p role="alert" className="rounded-xl border border-wrong/40 bg-wrong/10 p-3 text-wrong">
        Your answer arrived after time ran out.
      </p>
    )
  }
  if (answered) {
    return (
      <p className="rounded-xl border border-accent/40 bg-accent/10 p-3">
        <span className="font-semibold text-accent">Answer locked in</span>
        {count}
      </p>
    )
  }
  if (hasPicked) {
    return <p className="text-center text-sm text-muted">Sending your answer…</p>
  }
  if (timeUp) {
    return (
      <p className="rounded-xl border border-border bg-surface p-3">
        <span className="font-semibold">Time's up</span>
        {count}
      </p>
    )
  }
  return (
    <p className="text-center text-sm text-muted">
      Tap an answer. Faster correct answers score more.
    </p>
  )
}
