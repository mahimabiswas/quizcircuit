import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DraftQuestion } from '../host/quizDraft'
import { QuestionCard } from './QuestionCard'

const QUESTION: DraftQuestion = {
  id: 'q1',
  text: 'What does a vector clock track?',
  options: ['Wall-clock time', 'Causal ordering of events', 'Disk usage', 'Message size'],
  correct: 1,
}

type Props = ComponentProps<typeof QuestionCard>

function renderCard(overrides: Partial<Props> = {}) {
  const handlers = {
    onEdit: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
  }
  render(
    <QuestionCard
      number={3}
      question={QUESTION}
      editing={false}
      locked={false}
      canDelete
      {...handlers}
      {...overrides}
    />,
  )
  return handlers
}

describe('QuestionCard: viewing', () => {
  it('shows the number, type, question and options with the correct one marked', () => {
    renderCard()
    const card = screen.getByRole('article', { name: 'Question 3' })
    expect(within(card).getByText('Q3')).toBeInTheDocument()
    expect(within(card).getByText('Multiple choice')).toBeInTheDocument()
    expect(within(card).getByRole('heading', { name: QUESTION.text })).toBeInTheDocument()
    const options = within(card).getAllByRole('listitem')
    expect(options).toHaveLength(4)
    expect(options[1]).toHaveTextContent('Causal ordering of eventsCorrect ✓')
    expect(options[0]).not.toHaveTextContent('Correct')
  })

  it('shows where the answer comes from', () => {
    renderCard({
      question: {
        ...QUESTION,
        source: { file: 'notes.pdf', page: 4, quote: 'Vector clocks track causality.' },
      },
    })
    expect(screen.getByText(/^Source:/)).toHaveTextContent(
      'Source: notes.pdf, p.4 · Vector clocks track causality.',
    )
  })

  it('leaves out the page for text files, and the line when there is no source', () => {
    renderCard({ question: { ...QUESTION, source: { file: 'notes.md', page: null, quote: '' } } })
    expect(screen.getByText(/^Source:/)).toHaveTextContent(/^Source: notes\.md$/)
  })

  it('labels True / False questions', () => {
    renderCard({ question: { ...QUESTION, options: ['True', 'False'], correct: 0 } })
    expect(screen.getByText('True / False')).toBeInTheDocument()
  })

  it('has Edit and Delete buttons', async () => {
    const user = userEvent.setup()
    const { onEdit, onDelete } = renderCard()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('cannot delete the last question', () => {
    renderCard({ canDelete: false })
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('hides its buttons while another question is being edited', () => {
    renderCard({ locked: true })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('QuestionCard: editing', () => {
  it('starts with the current text, options and correct answer', () => {
    renderCard({ editing: true })
    expect(screen.getByLabelText('Question')).toHaveValue(QUESTION.text)
    expect(screen.getByLabelText('Option C')).toHaveValue('Disk usage')
    expect(screen.getByLabelText('Option B is correct')).toBeChecked()
  })

  it('saves the edited question, trimmed', async () => {
    const user = userEvent.setup()
    const { onSave } = renderCard({ editing: true })
    await user.clear(screen.getByLabelText('Question'))
    await user.type(screen.getByLabelText('Question'), '  What do vector clocks track?  ')
    await user.clear(screen.getByLabelText('Option A'))
    await user.type(screen.getByLabelText('Option A'), 'Causality')
    await user.click(screen.getByLabelText('Option A is correct'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({
      id: 'q1',
      text: 'What do vector clocks track?',
      options: ['Causality', 'Causal ordering of events', 'Disk usage', 'Message size'],
      correct: 0,
    })
  })

  it('refuses to save an empty option and says why', async () => {
    const user = userEvent.setup()
    const { onSave } = renderCard({ editing: true })
    await user.clear(screen.getByLabelText('Option D'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Fill in every option.')
  })

  it('refuses to save an empty question', async () => {
    const user = userEvent.setup()
    const { onSave } = renderCard({ editing: true })
    await user.clear(screen.getByLabelText('Question'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Write the question.')
  })

  it('cancels without saving', async () => {
    const user = userEvent.setup()
    const { onCancel, onSave } = renderCard({ editing: true })
    await user.type(screen.getByLabelText('Question'), ' changed')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })
})
