import { describe, expect, it } from 'vitest'
import { gameReducer, initialState, type GameAction, type GameState } from './reducer'

function run(...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, initialState)
}

const connecting: GameAction = { type: 'connecting' }
const joined: GameAction = {
  type: 'server',
  message: { type: 'joined', role: 'player', name: 'Priya' },
}

describe('gameReducer', () => {
  it('starts idle', () => {
    expect(initialState.phase).toBe('idle')
  })

  it('moves to connecting when Join is pressed', () => {
    expect(run(connecting).phase).toBe('connecting')
  })

  it('moves to lobby when the server accepts the join', () => {
    const state = run(connecting, joined)
    expect(state.phase).toBe('lobby')
    expect(state.name).toBe('Priya')
  })

  it('keeps the player list from lobby messages', () => {
    const state = run(connecting, joined, {
      type: 'server',
      message: { type: 'lobby', players: ['Tom', 'Priya'] },
    })
    expect(state.players).toEqual(['Tom', 'Priya'])
  })

  it('goes back to the form on a join error', () => {
    const state = run(connecting, {
      type: 'server',
      message: { type: 'error', code: 'NAME_TAKEN', message: 'taken' },
    })
    expect(state.phase).toBe('idle')
    expect(state.error).toBe('NAME_TAKEN')
  })

  it('clears the error when the player tries again', () => {
    const state = run(
      connecting,
      { type: 'server', message: { type: 'error', code: 'NAME_TAKEN', message: 'taken' } },
      connecting,
    )
    expect(state.error).toBeNull()
  })

  it('keeps the server error when the socket then closes (room not found)', () => {
    const state = run(
      connecting,
      { type: 'server', message: { type: 'error', code: 'ROOM_NOT_FOUND', message: 'no room' } },
      { type: 'closed' },
    )
    expect(state.phase).toBe('idle')
    expect(state.error).toBe('ROOM_NOT_FOUND')
  })

  it('reports a connection failure if the socket closes while connecting', () => {
    const state = run(connecting, { type: 'closed' })
    expect(state.phase).toBe('idle')
    expect(state.error).toBe('CONNECTION_FAILED')
  })

  it('reports a lost connection if the socket closes after joining', () => {
    const state = run(connecting, joined, { type: 'closed' })
    expect(state.phase).toBe('disconnected')
    expect(state.error).toBe('CONNECTION_LOST')
  })
})
