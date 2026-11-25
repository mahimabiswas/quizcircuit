import { describe, expect, it } from 'vitest'
import type { CreateRoomRequest } from '../protocol'
import {
  cleanQuestion,
  questionKind,
  questionProblem,
  sourceFileCount,
  summarize,
  toCreateRoomRequest,
  toDraft,
} from './quizDraft'

const QUIZ: CreateRoomRequest = {
  time_limit: 20,
  questions: [
    { text: 'Pick B', options: ['A', 'B', 'C', 'D'], correct: 1 },
    { text: 'Is it true?', options: ['True', 'False'], correct: 0 },
    { text: 'Pick A', options: ['A', 'B', 'C', 'D'], correct: 0 },
  ],
}

describe('toDraft / toCreateRoomRequest', () => {
  it('gives every question its own id', () => {
    const ids = toDraft(QUIZ).questions.map((q) => q.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('round-trips to exactly what the backend expects', () => {
    expect(toCreateRoomRequest(toDraft(QUIZ))).toEqual(QUIZ)
  })

  it('keeps sources for the review page but never sends them to the game', () => {
    const source = { file: 'notes.pdf', page: 4, quote: 'Writes go to the leader.' }
    const draft = toDraft({ time_limit: 20, questions: [{ ...QUIZ.questions[0], source }] })
    expect(draft.questions[0].source).toEqual(source)
    expect(toCreateRoomRequest(draft).questions[0]).toEqual(QUIZ.questions[0])
  })

  it('counts the different files the questions cite', () => {
    const cite = (file: string) => ({ file, page: null, quote: '' })
    const draft = toDraft({
      time_limit: 20,
      questions: [
        { ...QUIZ.questions[0], source: cite('a.pdf') },
        { ...QUIZ.questions[1], source: cite('a.pdf') },
        { ...QUIZ.questions[2], source: cite('b.md') },
        { ...QUIZ.questions[0], source: null },
      ],
    })
    expect(sourceFileCount(draft)).toBe(2)
  })

  it('copies the options, so editing the draft never changes the original quiz', () => {
    const draft = toDraft(QUIZ)
    draft.questions[0].options[0] = 'changed'
    expect(QUIZ.questions[0].options[0]).toBe('A')
  })
})

describe('questionKind', () => {
  it('recognises True / False', () => {
    expect(questionKind({ text: '', options: ['True', 'False'], correct: 0 })).toBe('true_false')
    expect(questionKind({ text: '', options: [' true ', 'FALSE'], correct: 0 })).toBe('true_false')
  })

  it('treats everything else as multiple choice', () => {
    expect(questionKind({ text: '', options: ['Yes', 'No'], correct: 0 })).toBe('multiple_choice')
    expect(questionKind({ text: '', options: ['A', 'B', 'C', 'D'], correct: 0 })).toBe(
      'multiple_choice',
    )
  })
})

describe('questionProblem', () => {
  const good = { text: 'Q', options: ['A', 'B'], correct: 0 }

  it('accepts a complete question', () => {
    expect(questionProblem(good)).toBeNull()
  })

  it('needs question text', () => {
    expect(questionProblem({ ...good, text: '   ' })).toBe('Write the question.')
  })

  it('needs every option filled in', () => {
    expect(questionProblem({ ...good, options: ['A', ' '] })).toBe('Fill in every option.')
  })

  it('needs a valid correct answer', () => {
    expect(questionProblem({ ...good, correct: 2 })).toBe('Pick the correct answer.')
    expect(questionProblem({ ...good, correct: -1 })).toBe('Pick the correct answer.')
  })
})

describe('cleanQuestion', () => {
  it('trims the text and the options', () => {
    expect(cleanQuestion({ text: ' Q ', options: [' A', 'B '], correct: 1 })).toEqual({
      text: 'Q',
      options: ['A', 'B'],
      correct: 1,
    })
  })
})

describe('summarize', () => {
  it('counts the question types and estimates the time', () => {
    expect(summarize(toDraft(QUIZ))).toEqual({
      total: 3,
      multipleChoice: 2,
      trueFalse: 1,
      minutes: 1, // 3 x 20s = 60s
    })
  })

  it('rounds the time and never says 0 minutes', () => {
    expect(summarize({ ...toDraft(QUIZ), timeLimit: 60 }).minutes).toBe(3)
    expect(summarize({ ...toDraft(QUIZ), timeLimit: 10 }).minutes).toBe(1) // 30s
  })
})
