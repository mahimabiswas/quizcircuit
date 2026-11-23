import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { QuestionMessage, RevealMessage } from '../protocol'
import { RevealPage } from './RevealPage'

const QUESTION: QuestionMessage = {
  type: 'question',
  id: 3,
  index: 3,
  total: 10,
  text: 'Which of these is an example of eventual consistency?',
  options: [
    'A DNS update spreading across the world',
    'A transaction inside a single SQL database',
    'A bank transfer within one ledger',
    'A write to a CPU register',
  ],
  time_limit: 20,
  ends_at: 1020,
  server_time: 1000,
}

const REVEAL: RevealMessage = {
  type: 'reveal',
  question_id: 3,
  correct: 0,
  distribution: [3, 2, 1, 0],
  results: [
    { name: 'Priya', correct: true, points: 920, total: 1840 },
    { name: 'Tom', correct: false, points: 0, total: 1200 },
    { name: 'Aisha', correct: true, points: 850, total: 1200 },
    { name: 'Mei', correct: false, points: 0, total: 300 },
  ],
}

function renderReveal(name: string, myChoice: number | null, question = QUESTION) {
  render(<RevealPage question={question} reveal={REVEAL} name={name} myChoice={myChoice} />)
}

describe('RevealPage', () => {
  it('celebrates a correct answer with the points earned', () => {
    renderReveal('Priya', 0)
    expect(screen.getByRole('heading', { name: 'Correct!' })).toBeInTheDocument()
    expect(screen.getByText('+920')).toBeInTheDocument()
    expect(screen.queryByText('The correct answer was:')).not.toBeInTheDocument()
  })

  it('shows the correct answer after a wrong one', () => {
    renderReveal('Tom', 1)
    expect(screen.getByRole('heading', { name: 'Not quite' })).toBeInTheDocument()
    expect(screen.getByText('+ 0 points')).toBeInTheDocument()
    expect(screen.getByText('The correct answer was:')).toBeInTheDocument()
    expect(screen.getByText('A DNS update spreading across the world')).toBeInTheDocument()
  })

  it('says "No answer" when the player did not answer', () => {
    renderReveal('Mei', null)
    expect(screen.getByRole('heading', { name: 'No answer' })).toBeInTheDocument()
    expect(screen.getByText('The correct answer was:')).toBeInTheDocument()
  })

  it('shows rank and total score', () => {
    renderReveal('Priya', 0)
    expect(screen.getByText('1st of 4')).toBeInTheDocument()
    expect(screen.getByText('1,840 pts')).toBeInTheDocument()
  })

  it('gives tied players the same rank', () => {
    renderReveal('Aisha', 0)
    expect(screen.getByText('2nd of 4')).toBeInTheDocument()
  })

  it('says the next question is coming', () => {
    renderReveal('Priya', 0)
    expect(screen.getByText('Next question coming up…')).toBeInTheDocument()
  })

  it('says final results are coming after the last question', () => {
    renderReveal('Priya', 0, { ...QUESTION, index: 9 })
    expect(screen.getByText('Final results coming up…')).toBeInTheDocument()
  })
})
