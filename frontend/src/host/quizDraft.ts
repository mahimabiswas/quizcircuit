// The quiz the host is reviewing before creating a game. Pure helpers, no React.
// Later, AI-generated questions will arrive in this same shape.

import type { CreateRoomRequest, QuestionInput } from '../protocol'

/** Choices for "Time per question", in seconds. */
export const TIME_LIMITS = [10, 20, 30, 45, 60] as const

/** A question in the editor. `id` only exists in the browser, to keep track of cards. */
export interface DraftQuestion extends QuestionInput {
  id: string
}

export interface QuizDraft {
  timeLimit: number
  questions: DraftQuestion[]
}

let nextId = 0

/** Turn a quiz (e.g. the sample, or later an AI result) into an editable draft. */
export function toDraft(quiz: CreateRoomRequest): QuizDraft {
  return {
    timeLimit: quiz.time_limit,
    questions: quiz.questions.map((q) => ({ ...q, options: [...q.options], id: `q${nextId++}` })),
  }
}

/** The body for POST /rooms: the draft without the browser-only ids. */
export function toCreateRoomRequest(draft: QuizDraft): CreateRoomRequest {
  return {
    time_limit: draft.timeLimit,
    questions: draft.questions.map(({ text, options, correct }) => ({ text, options, correct })),
  }
}

export type QuestionKind = 'multiple_choice' | 'true_false'

/** "True / False" if the options are exactly True and False, otherwise multiple choice. */
export function questionKind(question: QuestionInput): QuestionKind {
  const options = question.options.map((o) => o.trim().toLowerCase())
  return options.length === 2 && options[0] === 'true' && options[1] === 'false'
    ? 'true_false'
    : 'multiple_choice'
}

/**
 * What is wrong with an edited question, in words for the host, or null if it is fine.
 * Mirrors what the backend accepts, so a game is never refused.
 */
export function questionProblem(question: QuestionInput): string | null {
  if (question.text.trim() === '') return 'Write the question.'
  if (question.options.some((o) => o.trim() === '')) return 'Fill in every option.'
  if (!(question.correct >= 0 && question.correct < question.options.length)) {
    return 'Pick the correct answer.'
  }
  return null
}

/** Trim the text and options, ready to save. */
export function cleanQuestion<Q extends QuestionInput>(question: Q): Q {
  return { ...question, text: question.text.trim(), options: question.options.map((o) => o.trim()) }
}

export interface QuizSummary {
  total: number
  multipleChoice: number
  trueFalse: number
  /** Rough answering time, rounded to whole minutes (at least 1). */
  minutes: number
}

export function summarize(draft: QuizDraft): QuizSummary {
  const trueFalse = draft.questions.filter((q) => questionKind(q) === 'true_false').length
  const total = draft.questions.length
  return {
    total,
    multipleChoice: total - trueFalse,
    trueFalse,
    minutes: Math.max(1, Math.round((total * draft.timeLimit) / 60)),
  }
}
