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
  error: (code: 'NAME_TAKEN' | 'ROOM_NOT_FOUND' | 'GAME_STARTED') =>
    act(() => fake.last.receive({ type: 'error', code, message: 'server text' })),
  close: (code = 1000) => act(() => fake.last.serverClose(code)),
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
