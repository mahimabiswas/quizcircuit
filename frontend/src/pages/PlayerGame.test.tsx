import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeSockets } from '../test/fakeSocket'
import { PlayerGame } from './PlayerGame'

let fake: ReturnType<typeof fakeSockets>

beforeEach(() => {
  fake = fakeSockets()
})

function renderGame() {
  render(
    <MemoryRouter>
      <PlayerGame createSocket={fake.factory} />
    </MemoryRouter>,
  )
}

async function fillAndJoin(code: string, name: string) {
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText('Game code'))
  await user.type(screen.getByLabelText('Game code'), code)
  await user.clear(screen.getByLabelText('Your name'))
  await user.type(screen.getByLabelText('Your name'), name)
  await user.click(screen.getByRole('button', { name: /join/i }))
}

// Server-side events change React state, so they go inside act().
const server = {
  open: () => act(() => fake.last.open()),
  joined: (name: string) =>
    act(() => fake.last.receive({ type: 'joined', role: 'player', name })),
  lobby: (players: string[]) => act(() => fake.last.receive({ type: 'lobby', players })),
  error: (code: 'NAME_TAKEN' | 'ROOM_NOT_FOUND' | 'GAME_STARTED' | 'TIME_UP') =>
    act(() => fake.last.receive({ type: 'error', code, message: 'server text' })),
  close: (code = 1000) => act(() => fake.last.serverClose(code)),
  /** A question that started just now, with 20 seconds to answer. */
  question: (id: number, text = `Question text ${id}`) => {
    const now = Date.now() / 1000
    return act(() =>
      fake.last.receive({
        type: 'question',
        id,
        index: id,
        total: 3,
        text,
        options: ['Red', 'Green', 'Blue', 'Yellow'],
        time_limit: 20,
        ends_at: now + 20,
        server_time: now,
      }),
    )
  },
  ack: (questionId: number) =>
    act(() => fake.last.receive({ type: 'answer_ack', question_id: questionId })),
  count: (questionId: number, answered: number, total: number) =>
    act(() =>
      fake.last.receive({ type: 'answer_count', question_id: questionId, answered, total }),
    ),
}

/** Join as Priya and land in the lobby. */
async function joinLobby() {
  renderGame()
  await fillAndJoin('QC-4821', 'Priya')
  server.open()
  server.joined('Priya')
  server.lobby(['Priya', 'Tom'])
}

describe('PlayerGame', () => {
  it('connects to the room and sends join once the socket opens', async () => {
    renderGame()
    await fillAndJoin('QC-4821', 'Priya')
    expect(fake.last.url).toMatch(/\/ws\/QC-4821$/)
    expect(fake.last.sent).toEqual([]) // not open yet
    server.open()
    expect(fake.last.sent).toEqual([{ type: 'join', name: 'Priya' }])
  })

  it('shows Joining… while waiting for the server', async () => {
    renderGame()
    await fillAndJoin('QC-4821', 'Priya')
    expect(screen.getByRole('button', { name: 'Joining…' })).toBeDisabled()
  })

  it('shows the waiting screen once joined, with the other players', async () => {
    renderGame()
    await fillAndJoin('QC-4821', 'Priya')
    server.open()
    server.joined('Priya')
    server.lobby(['Tom', 'Priya', 'Aisha'])
    expect(screen.getByRole('heading', { name: "You're in, Priya!" })).toBeInTheDocument()
    expect(screen.getByText('Also here (2)')).toBeInTheDocument()
    expect(screen.getByText('Tom')).toBeInTheDocument()
    expect(screen.getByText('Aisha')).toBeInTheDocument()
  })

  it('updates the list as players join and leave', async () => {
    renderGame()
    await fillAndJoin('QC-4821', 'Priya')
    server.open()
    server.joined('Priya')
    server.lobby(['Priya'])
    expect(screen.getByText("You're the first one here.")).toBeInTheDocument()
    server.lobby(['Priya', 'Omar'])
    expect(screen.getByText('Omar')).toBeInTheDocument()
    server.lobby(['Priya'])
    expect(screen.queryByText('Omar')).not.toBeInTheDocument()
  })

  it('lets the player pick another name on the same connection', async () => {
    renderGame()
    await fillAndJoin('QC-4821', 'Priya')
    server.open()
    server.error('NAME_TAKEN')
    expect(screen.getByRole('alert')).toHaveTextContent('already has that name')

    await fillAndJoin('QC-4821', 'Priya B')
    expect(fake.sockets).toHaveLength(1) // reused, not reconnected
    expect(fake.last.sent).toEqual([
      { type: 'join', name: 'Priya' },
      { type: 'join', name: 'Priya B' },
    ])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains a wrong code, then connects again with a new one', async () => {
    renderGame()
    await fillAndJoin('QC-0000', 'Priya')
    server.open()
    server.error('ROOM_NOT_FOUND')
    server.close(4404)
    expect(screen.getByRole('alert')).toHaveTextContent('No game has that code')

    await fillAndJoin('QC-4821', 'Priya')
    expect(fake.sockets).toHaveLength(2)
    expect(fake.last.url).toMatch(/\/ws\/QC-4821$/)
  })

  it('closes the old socket when the code is changed after a rejected name', async () => {
    renderGame()
    await fillAndJoin('QC-1111', 'Priya')
    server.open()
    server.error('GAME_STARTED')
    const first = fake.last
    await fillAndJoin('QC-2222', 'Priya')
    expect(first.closedByClient).toBe(true)
    expect(fake.sockets).toHaveLength(2)
  })

  it('explains when the server cannot be reached', async () => {
    renderGame()
    await fillAndJoin('QC-4821', 'Priya')
    server.close(1006) // closed without ever opening
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't reach the game")
    expect(screen.getByRole('button', { name: 'Join game' })).toBeEnabled()
  })

  it('goes back to the form if the connection drops in the lobby', async () => {
    renderGame()
    await fillAndJoin('QC-4821', 'Priya')
    server.open()
    server.joined('Priya')
    server.close(1006)
    expect(screen.getByRole('alert')).toHaveTextContent('Lost the connection')
    expect(screen.getByLabelText('Game code')).toBeInTheDocument()
  })
})

describe('PlayerGame: questions', () => {
  it('shows the question when the host starts the game', async () => {
    await joinLobby()
    server.question(0, 'Which colour is grass?')
    expect(screen.getByRole('heading', { name: 'Which colour is grass?' })).toBeInTheDocument()
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveAccessibleName('20 seconds left')
  })

  it('sends the tapped answer with the question id', async () => {
    const user = userEvent.setup()
    await joinLobby()
    server.question(0)
    await user.click(screen.getByRole('button', { name: /Green/ }))
    expect(fake.last.sent).toContainEqual({ type: 'answer', question_id: 0, choice: 1 })
    expect(screen.getByText('Sending your answer…')).toBeInTheDocument()
  })

  it('sends only one answer even if tapped again', async () => {
    const user = userEvent.setup()
    await joinLobby()
    server.question(0)
    await user.click(screen.getByRole('button', { name: /Green/ }))
    await user.click(screen.getByRole('button', { name: /Blue/ }))
    const answers = fake.last.sent.filter((m) => (m as { type: string }).type === 'answer')
    expect(answers).toHaveLength(1)
  })

  it('locks the answer in when the server confirms it, and shows progress', async () => {
    const user = userEvent.setup()
    await joinLobby()
    server.question(0)
    await user.click(screen.getByRole('button', { name: /Green/ }))
    server.ack(0)
    server.count(0, 1, 2)
    expect(screen.getByText('Answer locked in')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 players answered')).toBeInTheDocument()
    server.count(0, 2, 2)
    expect(screen.getByText('2 of 2 players answered')).toBeInTheDocument()
  })

  it('explains a late answer', async () => {
    const user = userEvent.setup()
    await joinLobby()
    server.question(0)
    await user.click(screen.getByRole('button', { name: /Green/ }))
    server.error('TIME_UP')
    expect(screen.getByRole('alert')).toHaveTextContent('after time ran out')
  })

  it('starts fresh on the next question', async () => {
    const user = userEvent.setup()
    await joinLobby()
    server.question(0)
    await user.click(screen.getByRole('button', { name: /Green/ }))
    server.ack(0)
    server.question(1, 'Next one')
    expect(screen.getByRole('heading', { name: 'Next one' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Green/ })).toBeEnabled()
    expect(screen.queryByText('Answer locked in')).not.toBeInTheDocument()
  })

  it('goes back to the form if the connection drops mid-question', async () => {
    await joinLobby()
    server.question(0)
    server.close(1006)
    expect(screen.getByRole('alert')).toHaveTextContent('Lost the connection')
  })
})
