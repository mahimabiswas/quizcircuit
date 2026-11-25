import { render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import type { QuestionMessage } from '../protocol'
import { HostQuestionPage } from './HostQuestionPage'

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

function renderPage(overrides: Partial<ComponentProps<typeof HostQuestionPage>> = {}) {
  render(
    <HostQuestionPage
      code="QC-4821"
      question={QUESTION}
      secondsLeft={14}
      answered={4}
      totalPlayers={6}
      {...overrides}
    />,
  )
}

describe('HostQuestionPage', () => {
  it('shows the question, its position and the join code', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: QUESTION.text })).toBeInTheDocument()
    expect(screen.getByText('Question 4 of 10')).toBeInTheDocument()
    expect(screen.getByText('Join code QC-4821')).toBeInTheDocument()
  })

  it('shows all four options with letters, and nothing to click', () => {
    renderPage()
    const options = within(screen.getByRole('list', { name: 'Answer options' })).getAllByRole('listitem')
    expect(options.map((o) => o.textContent)).toEqual([
      'AA DNS update spreading across the world',
      'BA transaction inside a single SQL database',
      'CA bank transfer within one ledger',
      'DA write to a CPU register',
    ])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows how many players have answered', () => {
    renderPage({ answered: 4, totalPlayers: 6 })
    expect(screen.getByText('4 / 6')).toBeInTheDocument()
  })

  it('shows the countdown', () => {
    renderPage({ secondsLeft: 13.4 })
    expect(screen.getByRole('timer')).toHaveAccessibleName('14 seconds left')
  })

  it('says players answer on their own devices', () => {
    renderPage()
    expect(screen.getByText('Players answer on their own devices.')).toBeInTheDocument()
  })
})
