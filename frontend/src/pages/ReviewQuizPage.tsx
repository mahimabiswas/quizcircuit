// "Review your quiz": the host checks and edits the AI's questions, picks the
// time per question, then creates the game.

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { createRoom } from '../api'
import { Logo } from '../components/Logo'
import { QuestionCard } from '../components/QuestionCard'
import { saveHostToken } from '../game/hostToken'
import {
  TIME_LIMITS,
  sourceFileCount,
  summarize,
  toCreateRoomRequest,
  toDraft,
  type DraftQuestion,
  type QuizDraft,
  type SourcedQuestion,
} from '../host/quizDraft'

interface ReviewQuizPageProps {
  /** The questions to start from. */
  initialQuiz: { time_limit: number; questions: SourcedQuestion[] }
  /** How many questions the host asked for: if fewer came back, say so. */
  requestedCount?: number
  /** Go back and generate from different files. */
  onStartOver?: () => void
}

export function ReviewQuizPage({ initialQuiz, requestedCount, onStartOver }: ReviewQuizPageProps) {
  const navigate = useNavigate()
  // The function form runs toDraft once, on the first render only.
  const [draft, setDraft] = useState<QuizDraft>(() => toDraft(initialQuiz))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function saveQuestion(updated: DraftQuestion) {
    setDraft({
      ...draft,
      questions: draft.questions.map((q) => (q.id === updated.id ? updated : q)),
    })
    setEditingId(null)
  }

  function deleteQuestion(id: string) {
    setDraft({ ...draft, questions: draft.questions.filter((q) => q.id !== id) })
  }

  async function createGame() {
    setCreating(true)
    setError(null)
    try {
      const room = await createRoom(toCreateRoomRequest(draft))
      saveHostToken(room.code, room.host_token)
      navigate(`/host/${room.code}`)
    } catch {
      setError("Couldn't create the game. Is the backend running?")
      setCreating(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <span className="rounded-full bg-surface-raised px-3 py-1 text-xs text-muted">Host</span>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">Review your quiz</h1>
          {onStartOver && (
            <button
              type="button"
              onClick={onStartOver}
              className="text-sm text-accent hover:underline"
            >
              ← Upload different files
            </button>
          )}
        </div>
        <p className="mt-2 text-muted">
          Check each question and its source before you share the game. The AI can make
          mistakes: edit or delete anything that looks off.
        </p>
        {requestedCount !== undefined && initialQuiz.questions.length < requestedCount && (
          <p className="mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
            {initialQuiz.questions.length} of {requestedCount} questions passed our checks. The
            others were left out.
          </p>
        )}

        {/* Laptops (lg): questions + a summary column that stays in view. Smaller: stacked. */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
          <div className="space-y-4">
            {draft.questions.map((question, i) => (
              <QuestionCard
                key={question.id}
                number={i + 1}
                question={question}
                editing={editingId === question.id}
                locked={editingId !== null && editingId !== question.id}
                canDelete={draft.questions.length > 1}
                onEdit={() => setEditingId(question.id)}
                onCancel={() => setEditingId(null)}
                onSave={saveQuestion}
                onDelete={() => deleteQuestion(question.id)}
              />
            ))}
          </div>

          <Summary
            draft={draft}
            onTimeLimit={(timeLimit) => setDraft({ ...draft, timeLimit })}
            editing={editingId !== null}
            creating={creating}
            error={error}
            onCreate={createGame}
          />
        </div>
      </main>
    </div>
  )
}

interface SummaryProps {
  draft: QuizDraft
  onTimeLimit: (seconds: number) => void
  editing: boolean
  creating: boolean
  error: string | null
  onCreate: () => void
}

function Summary({ draft, onTimeLimit, editing, creating, error, onCreate }: SummaryProps) {
  const summary = summarize(draft)
  const sources = sourceFileCount(draft)

  return (
    <aside className="rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-6">
      <h2 className="font-semibold">Quiz summary</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <Row label="Questions" value={summary.total} />
        <Row label="Multiple choice" value={summary.multipleChoice} />
        <Row label="True / False" value={summary.trueFalse} />
        {sources > 0 && <Row label="Sources" value={`${sources} ${sources === 1 ? 'file' : 'files'}`} />}
        <Row label="Estimated time" value={`~${summary.minutes} min`} />
      </dl>

      <label className="mt-5 flex flex-col gap-1.5">
        <span className="text-sm font-medium">Time per question</span>
        <select
          value={draft.timeLimit}
          onChange={(e) => onTimeLimit(Number(e.target.value))}
          className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          {TIME_LIMITS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds} seconds
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="mt-4 text-sm text-wrong">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onCreate}
        disabled={editing || creating}
        className="mt-5 w-full rounded-lg bg-accent py-3 font-semibold hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {creating ? 'Creating…' : 'Looks good, create game'}
      </button>
      {editing && (
        <p className="mt-2 text-center text-xs text-muted">Save or cancel your edit first.</p>
      )}
    </aside>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
