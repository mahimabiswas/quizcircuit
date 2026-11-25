import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { QuestionMessage, RevealMessage } from '../protocol'
import { HostRevealPage } from './HostRevealPage'

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
  distribution: [3, 1, 1, 0],
  results: [
    { name: 'Priya', correct: true, points: 950, total: 3000 },
    { name: 'Tom', correct: true, points: 900, total: 2800 },
    { name: 'Aisha', correct: true, points: 850, total: 1500 },
    { name: 'Jack', correct: false, points: 0, total: 2900 },
    { name: 'Mei', correct: false, points: 0, total: 1000 },
    { name: 'Omar', correct: false, points: 0, total: 0 }, // did not answer
  ],
}

function renderReveal(overrides: { question?: QuestionMessage; reveal?: RevealMessage } = {}) {
  const onNext = vi.fn()
  render(
    <HostRevealPage
      code="QC-4821"
      question={overrides.question ?? QUESTION}
      reveal={overrides.reveal ?? REVEAL}
      onNext={onNext}
    />,
  )
  return { onNext }
}

describe('HostRevealPage', () => {
  it('marks the correct option', () => {
    renderReveal()
    const options = within(screen.getByRole('list', { name: 'Answer options' })).getAllByRole('listitem')
    expect(options[0]).toHaveAttribute('aria-current', 'true')
    expect(within(options[0]).getByLabelText('Correct answer')).toBeInTheDocument()
    expect(options[1]).not.toHaveAttribute('aria-current')
  })

  it('shows how many players picked each option, and who did not answer', () => {
    renderReveal()
    const section = screen.getByRole('heading', { name: 'How players answered' }).parentElement!
    const rows = within(section).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['A3 players', 'B1 player', 'C1 player', 'D0 players'])
    expect(within(section).getByText("1 player didn't answer")).toBeInTheDocument()
  })

  it('shows the top 3 scorers of this round', () => {
    renderReveal()
    const section = screen.getByRole('heading', { name: 'Top 3 this round' }).parentElement!
    const rows = within(section).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['1Priya+950', '2Tom+900', '3Aisha+850'])
  })

  it('says so when nobody scored', () => {
    renderReveal({
      reveal: { ...REVEAL, results: REVEAL.results.map((r) => ({ ...r, correct: false, points: 0 })) },
    })
    expect(screen.getByText('Nobody scored this round.')).toBeInTheDocument()
  })

  it('sends Next once, then disables the button', async () => {
    const user = userEvent.setup()
    const { onNext } = renderReveal()
    const button = screen.getByRole('button', { name: 'Next question' })
    await user.click(button)
    await user.click(button)
    expect(onNext).toHaveBeenCalledOnce()
    expect(button).toBeDisabled()
  })

  it('offers the final results after the last question', () => {
    renderReveal({ question: { ...QUESTION, index: 9 } })
    expect(screen.getByRole('button', { name: 'Show final results' })).toBeInTheDocument()
  })
})
