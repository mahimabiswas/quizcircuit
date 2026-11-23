import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { saveHostToken } from '../game/hostToken'
import type { ServerMessage } from '../protocol'
import { fakeSockets } from '../test/fakeSocket'
import { HostGame } from './HostGame'

let fake: ReturnType<typeof fakeSockets>

beforeEach(() => {
  fake = fakeSockets()
})

function renderHost(code = 'QC-4821') {
  render(
    <MemoryRouter initialEntries={[`/host/${code}`]}>
      <Routes>
        <Route path="/host/:code" element={<HostGame createSocket={fake.factory} />} />
      </Routes>
    </MemoryRouter>,
  )
}

const receive = (message: ServerMessage) => act(() => fake.last.receive(message))

/** Open the host page with a saved token and get into the lobby. */
function openLobby(players: string[] = []) {
  saveHostToken('QC-4821', 'secret')
  renderHost()
  act(() => fake.last.open())
  receive({ type: 'joined', role: 'host', name: 'Host' })
  receive({ type: 'lobby', players })
}

const QUESTION: ServerMessage = {
  type: 'question',
  id: 0,
  index: 0,
  total: 2,
  text: 'What does a vector clock track?',
  options: ['Wall-clock time', 'Causal ordering of events'],
  time_limit: 20,
  ends_at: Date.now() / 1000 + 20,
  server_time: Date.now() / 1000,
}

describe('HostGame', () => {
  it('joins the room as host with the saved token', () => {
    saveHostToken('QC-4821', 'secret')
    renderHost()
    expect(fake.last.url).toMatch(/\/ws\/QC-4821$/)
    act(() => fake.last.open())
    expect(fake.last.sent).toEqual([{ type: 'join', name: 'Host', host_token: 'secret' }])
  })

  it('shows the invite screen with the players', () => {
    openLobby(['Priya', 'Tom'])
    expect(screen.getByRole('heading', { name: 'Invite players' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Join code QC-4821' })).toBeInTheDocument()
    expect(screen.getByLabelText('Join link')).toHaveValue(`${window.location.origin}/join/QC-4821`)
    expect(screen.getByText('Priya')).toBeInTheDocument()
    expect(screen.getByText('Tom')).toBeInTheDocument()
  })

  it('updates the list as players join', () => {
    openLobby([])
    receive({ type: 'lobby', players: ['Priya'] })
    expect(screen.getByText('Priya')).toBeInTheDocument()
  })

  it('sends start and kick', async () => {
    const user = userEvent.setup()
    openLobby(['Priya', 'Tom'])
    await user.click(screen.getByRole('button', { name: 'Remove Tom' }))
    await user.click(screen.getByRole('button', { name: 'Start quiz' }))
    expect(fake.last.sent.slice(1)).toEqual([{ type: 'kick', name: 'Tom' }, { type: 'start' }])
  })

  it('moves on to the game when the first question starts', () => {
    openLobby(['Priya'])
    receive(QUESTION)
    expect(screen.getByRole('heading', { name: 'What does a vector clock track?' })).toBeInTheDocument()
  })

  it('lets the host press Next after a reveal', async () => {
    const user = userEvent.setup()
    openLobby(['Priya'])
    receive(QUESTION)
    receive({ type: 'reveal', question_id: 0, correct: 1, distribution: [0, 1], results: [] })
    expect(screen.getByText('Causal ordering of events')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next question' }))
    expect(fake.last.sent).toContainEqual({ type: 'next' })
  })

  it('shows the final leaderboard when the game ends', () => {
    openLobby(['Priya'])
    receive(QUESTION)
    receive({ type: 'leaderboard', rankings: [{ rank: 1, name: 'Priya', score: 950 }] })
    expect(screen.getByRole('heading', { name: 'Final leaderboard' })).toBeInTheDocument()
    expect(screen.getByText('Priya takes the win with 950 points')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start a new game' })).toHaveAttribute('href', '/host')
  })

  it('explains when this tab is not the host', () => {
    renderHost('QC-9999') // no token saved for this room
    expect(screen.getByRole('heading', { name: "You're not the host of this game" })).toBeInTheDocument()
    expect(fake.sockets).toHaveLength(0)
  })

  it('explains when the room no longer exists', () => {
    saveHostToken('QC-4821', 'secret')
    renderHost()
    act(() => fake.last.open())
    receive({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'no room' })
    expect(screen.getByText('This game no longer exists.')).toBeInTheDocument()
  })

  it('offers to reconnect after the connection drops', async () => {
    const user = userEvent.setup()
    openLobby(['Priya'])
    act(() => fake.last.serverClose(1006))
    await user.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(fake.sockets).toHaveLength(2)
    act(() => fake.last.open())
    expect(fake.last.sent).toEqual([{ type: 'join', name: 'Host', host_token: 'secret' }])
  })
})
