// One question on the "Review your quiz" page: shown as-is, or edited in place.

import { useState } from 'react'
import { cleanQuestion, questionKind, questionProblem, type DraftQuestion } from '../host/quizDraft'

const LETTERS = 'ABCDEFGH'

interface QuestionCardProps {
  number: number // 1-based, for "Q1"
  question: DraftQuestion
  editing: boolean
  /** Another card is being edited: hide this card's actions until it's done. */
  locked: boolean
  canDelete: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (question: DraftQuestion) => void
  onDelete: () => void
}

export function QuestionCard(props: QuestionCardProps) {
  const { number, question } = props
  const kind = questionKind(question)

  return (
    <article
      aria-label={`Question ${number}`}
      className="rounded-2xl border border-border bg-surface p-5"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-full bg-accent/20 px-2.5 py-0.5 font-medium text-accent">
          Q{number}
        </span>
        <span className="rounded-full bg-surface-raised px-2.5 py-0.5 text-muted">
          {kind === 'true_false' ? 'True / False' : 'Multiple choice'}
        </span>
      </div>

      {props.editing ? (
        <EditForm
          question={question}
          onCancel={props.onCancel}
          onSave={props.onSave}
        />
      ) : (
        <View {...props} />
      )}
    </article>
  )
}

function View({ question, locked, canDelete, onEdit, onDelete }: QuestionCardProps) {
  return (
    <>
      <h2 className="mt-3 font-semibold">{question.text}</h2>
      <ul className="mt-3 space-y-2">
        {question.options.map((option, i) => {
          const isCorrect = i === question.correct
          return (
            <li
              key={i}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                isCorrect ? 'border-correct/60 bg-correct/10' : 'border-border bg-surface-raised'
              }`}
            >
              <span className={`w-4 font-semibold ${isCorrect ? 'text-correct' : 'text-muted'}`}>
                {LETTERS[i]}
              </span>
              <span className="flex-1">{option}</span>
              {isCorrect && <span className="text-xs text-correct">Correct ✓</span>}
            </li>
          )
        })}
      </ul>

      {question.source && (
        <p className="mt-3 text-xs text-muted">
          Source:{' '}
          <span className="text-text">
            {question.source.file}
            {question.source.page !== null && `, p.${question.source.page}`}
          </span>
          {question.source.quote && (
            <>
              {' · '}
              <q className="italic">{question.source.quote}</q>
            </>
          )}
        </p>
      )}

      {!locked && (
        <div className="mt-4 flex gap-4 text-sm">
          <button type="button" onClick={onEdit} className="font-medium text-accent hover:underline">
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!canDelete}
            title={canDelete ? undefined : 'A quiz needs at least one question'}
            className="text-muted hover:text-wrong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
          >
            Delete
          </button>
        </div>
      )}
    </>
  )
}

interface EditFormProps {
  question: DraftQuestion
  onCancel: () => void
  onSave: (question: DraftQuestion) => void
}

function EditForm({ question, onCancel, onSave }: EditFormProps) {
  // A private copy: nothing changes on the page until Save.
  const [draft, setDraft] = useState(question)
  const [problem, setProblem] = useState<string | null>(null)

  function setOption(index: number, value: string) {
    setDraft({ ...draft, options: draft.options.map((o, i) => (i === index ? value : o)) })
  }

  function handleSave() {
    const found = questionProblem(draft)
    if (found) {
      setProblem(found)
      return
    }
    onSave(cleanQuestion(draft))
  }

  return (
    <div className="mt-3 space-y-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Question</span>
        <textarea
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          rows={2}
          className="rounded-lg border border-border bg-surface-raised px-3 py-2 focus:border-accent focus:outline-none"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">Options (pick the correct one)</legend>
        {draft.options.map((option, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-4 text-sm font-semibold text-muted">{LETTERS[i]}</span>
            <input
              value={option}
              onChange={(e) => setOption(i, e.target.value)}
              aria-label={`Option ${LETTERS[i]}`}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
              <input
                type="radio"
                name={`correct-${question.id}`}
                checked={draft.correct === i}
                onChange={() => setDraft({ ...draft, correct: i })}
                aria-label={`Option ${LETTERS[i]} is correct`}
                className="accent-correct"
              />
              Correct
            </label>
          </div>
        ))}
      </fieldset>

      {problem && (
        <p role="alert" className="text-sm text-wrong">
          {problem}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-hover"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
