import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getHostToken } from '../game/hostToken'
import type { CreateRoomRequest } from '../protocol'
import { ReviewQuizPage } from './ReviewQuizPage'

const QUIZ: CreateRoomRequest = {
  time_limit: 20,
  questions: [
    { text: 'Which colour is grass?', options: ['Red', 'Green', 'Blue', 'Yellow'], correct: 1 },
    { text: 'The sky is blue.', options: ['True', 'False'], correct: 0 },
    { text: '2 + 2 = ?', options: ['3', '4', '5', '22'], correct: 1 },
  ],
}

function HostRoomStub() {
  return <p>Host room {useParams().code}</p>
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/host']}>
      <Routes>
        <Route path="/host" element={<ReviewQuizPage initialQuiz={QUIZ} />} />
        <Route path="/host/:code" element={<HostRoomStub />} />
      </Routes>
    </MemoryRouter>,
  )
}

const card = (n: number) => screen.getByRole('article', { name: `Question ${n}` })
/** A value in the Quiz summary sidebar (the <aside>), found by its label. */
const summaryValue = (label: string) =>
  within(screen.getByRole('complementary')).getByText(label).nextElementSibling

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockCreateRoom() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ code: 'QC-1234', host_token: 'secret' }), { status: 201 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sentQuiz(fetchMock: ReturnType<typeof vi.fn>): CreateRoomRequest {
  return JSON.parse(fetchMock.mock.calls[0][1].body)
}

describe('ReviewQuizPage', () => {
  it('lists every question and summarises the quiz', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Review your quiz' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(summaryValue('Questions')).toHaveTextContent('3')
    expect(summaryValue('Multiple choice')).toHaveTextContent('2')
    expect(summaryValue('True / False')).toHaveTextContent('1')
    expect(summaryValue('Estimated time')).toHaveTextContent('~1 min')
    expect(screen.getByLabelText('Time per question')).toHaveValue('20')
  })

  it('edits a question in place', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(within(card(1)).getByRole('button', { name: 'Edit' }))
    await user.clear(within(card(1)).getByLabelText('Question'))
    await user.type(within(card(1)).getByLabelText('Question'), 'Which colour is the sea?')
    await user.click(within(card(1)).getByLabelText('Option C is correct'))
    await user.click(within(card(1)).getByRole('button', { name: 'Save' }))
    expect(within(card(1)).getByRole('heading')).toHaveTextContent('Which colour is the sea?')
    expect(within(card(1)).getAllByRole('listitem')[2]).toHaveTextContent('Correct ✓')
  })

  it('only lets one question be edited at a time, and blocks creating meanwhile', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(within(card(1)).getByRole('button', { name: 'Edit' }))
    expect(within(card(2)).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Looks good, create game' })).toBeDisabled()
    await user.click(within(card(1)).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Looks good, create game' })).toBeEnabled()
  })

  it('deletes questions, but never the last one', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(within(card(2)).getByRole('button', { name: 'Delete' }))
    await user.click(within(card(2)).getByRole('button', { name: 'Delete' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(summaryValue('Questions')).toHaveTextContent('1')
    expect(within(card(1)).getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('changes the time per question and the estimate', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.selectOptions(screen.getByLabelText('Time per question'), '60')
    expect(summaryValue('Estimated time')).toHaveTextContent('~3 min')
  })

  it('creates the game with the edited quiz, saves the token and opens the room', async () => {
    const fetchMock = mockCreateRoom()
    const user = userEvent.setup()
    renderPage()
    await user.click(within(card(3)).getByRole('button', { name: 'Delete' }))
    await user.selectOptions(screen.getByLabelText('Time per question'), '30')

    await user.click(screen.getByRole('button', { name: 'Looks good, create game' }))

    expect(await screen.findByText('Host room QC-1234')).toBeInTheDocument()
    expect(getHostToken('QC-1234')).toBe('secret')
    expect(sentQuiz(fetchMock)).toEqual({
      time_limit: 30,
      questions: QUIZ.questions.slice(0, 2), // no browser-only ids sent
    })
  })

  it('explains when the game cannot be created', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Looks good, create game' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Is the backend running?')
    expect(screen.getByRole('button', { name: 'Looks good, create game' })).toBeEnabled()
  })
})
