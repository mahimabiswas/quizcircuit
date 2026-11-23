import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { QuestionMessage } from '../protocol'
import { QuestionPage } from './QuestionPage'

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

type Props = ComponentProps<typeof QuestionPage>

function renderPage(overrides: Partial<Props> = {}) {
  const onAnswer = vi.fn()
  render(
    <QuestionPage
      question={QUESTION}
      secondsLeft={14}
      myChoice={null}
      answered={false}
      answerCount={null}
      error={null}
      onAnswer={onAnswer}
      {...overrides}
    />,
  )
  return { onAnswer, options: screen.getAllByRole('button') }
}

describe('QuestionPage', () => {
  it('shows the question, its position and the four options', () => {
    const { options } = renderPage()
    expect(screen.getByText('Question 4 of 10')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: QUESTION.text })).toBeInTheDocument()
    expect(options).toHaveLength(4)
    expect(options[0]).toHaveTextContent('A')
    expect(options[0]).toHaveTextContent('A DNS update spreading across the world')
    expect(options[3]).toHaveTextContent('D')
  })

  it('shows the countdown, rounded up', () => {
    renderPage({ secondsLeft: 13.2 })
    expect(screen.getByRole('timer')).toHaveAccessibleName('14 seconds left')
  })

  it('sends the tapped option', async () => {
    const user = userEvent.setup()
    const { options, onAnswer } = renderPage()
    await user.click(options[2])
    expect(onAnswer).toHaveBeenCalledWith(2)
  })

  it('locks every option once one is picked', () => {
    const { options } = renderPage({ myChoice: 0 })
    for (const option of options) expect(option).toBeDisabled()
    expect(options[0]).toHaveAttribute('aria-pressed', 'true')
    expect(options[1]).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Sending your answer…')).toBeInTheDocument()
  })

  it('shows "Answer locked in" with the answer count once confirmed', () => {
    renderPage({
      myChoice: 0,
      answered: true,
      answerCount: { type: 'answer_count', question_id: 3, answered: 4, total: 6 },
    })
    expect(screen.getByText('Answer locked in')).toBeInTheDocument()
    expect(screen.getByText('4 of 6 players answered')).toBeInTheDocument()
  })

  it("locks the options and says time's up when the countdown ends", () => {
    const { options } = renderPage({ secondsLeft: 0 })
    for (const option of options) expect(option).toBeDisabled()
    expect(screen.getByText("Time's up")).toBeInTheDocument()
  })

  it('explains a TIME_UP rejection from the server', () => {
    renderPage({ myChoice: 1, error: 'TIME_UP', secondsLeft: 0 })
    expect(screen.getByRole('alert')).toHaveTextContent('after time ran out')
  })

  it('invites a tap while the question is open', () => {
    renderPage()
    expect(screen.getByText(/Tap an answer/)).toBeInTheDocument()
  })
})
