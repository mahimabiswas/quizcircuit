// The quiz the host is reviewing before creating a game. Pure helpers, no React.
// The questions come from AI generation (POST /quizzes/generate).

import type { CreateRoomRequest, QuestionInput, QuestionSource } from '../protocol'

/** Choices for "Time per question", in seconds. */
export const TIME_LIMITS = [10, 20, 30, 45, 60] as const
export const DEFAULT_TIME_LIMIT = 20

/** A question with, optionally, where its answer comes from in the documents. */
export interface SourcedQuestion extends QuestionInput {
  source?: QuestionSource | null
}

/** A question in the editor. `id` only exists in the browser, to keep track of cards. */
export interface DraftQuestion extends SourcedQuestion {
  id: string
}

export interface QuizDraft {
  timeLimit: number
  questions: DraftQuestion[]
}

let nextId = 0

/** Turn questions (e.g. the AI's) into an editable draft. Sources are kept for display. */
export function toDraft(quiz: { time_limit: number; questions: SourcedQuestion[] }): QuizDraft {
  return {
    timeLimit: quiz.time_limit,
    questions: quiz.questions.map((q) => ({ ...q, options: [...q.options], id: `q${nextId++}` })),
  }
}

/** How many different files the questions cite. */
export function sourceFileCount(draft: QuizDraft): number {
  return new Set(draft.questions.flatMap((q) => (q.source ? [q.source.file] : []))).size
}

/** The body for POST /rooms: the draft without ids or sources (the game doesn't need them). */
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
