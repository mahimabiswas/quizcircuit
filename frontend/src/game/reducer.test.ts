import { describe, expect, it } from 'vitest'
import type { QuestionMessage, ServerMessage } from '../protocol'
import { gameReducer, initialState, type GameAction, type GameState } from './reducer'
import { secondsLeftAt } from './useSecondsLeft'

function run(...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, initialState)
}

/** A message from the server, received at `receivedAt` (ms, like Date.now()). */
function server(message: ServerMessage, receivedAt = 0): GameAction {
  return { type: 'server', message, receivedAt }
}

const connecting: GameAction = { type: 'connecting' }
const joined = server({ type: 'joined', role: 'player', name: 'Priya' })

function question(overrides: Partial<QuestionMessage> = {}): QuestionMessage {
  return {
    type: 'question',
    id: 0,
    index: 0,
    total: 10,
    text: 'Which of these is an example of eventual consistency?',
    options: ['A DNS update', 'A SQL transaction', 'A bank transfer', 'A CPU register'],
    time_limit: 20,
    ends_at: 1020,
    server_time: 1000,
    ...overrides,
  }
}

describe('gameReducer: joining', () => {
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
    const state = run(connecting, joined, server({ type: 'lobby', players: ['Tom', 'Priya'] }))
    expect(state.players).toEqual(['Tom', 'Priya'])
  })

  it('goes back to the form on a join error', () => {
    const state = run(connecting, server({ type: 'error', code: 'NAME_TAKEN', message: 'taken' }))
    expect(state.phase).toBe('idle')
    expect(state.error).toBe('NAME_TAKEN')
  })

  it('clears the error when the player tries again', () => {
    const state = run(
      connecting,
      server({ type: 'error', code: 'NAME_TAKEN', message: 'taken' }),
      connecting,
    )
    expect(state.error).toBeNull()
  })

  it('keeps the server error when the socket then closes (room not found)', () => {
    const state = run(
      connecting,
      server({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'no room' }),
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

describe('gameReducer: questions', () => {
  it('opens a question', () => {
    const state = run(connecting, joined, server(question()))
    expect(state.phase).toBe('question')
    expect(state.question?.text).toMatch(/eventual consistency/)
    expect(state.myChoice).toBeNull()
    expect(state.answered).toBe(false)
  })

  it('measures how far the server clock is from ours', () => {
    // Server says it is 1000s; this device says 990s (990_000ms): server is 10s ahead.
    const state = run(connecting, joined, server(question({ server_time: 1000 }), 990_000))
    expect(state.clockOffset).toBe(10)
  })

  it('counts down by the server clock, not the device clock', () => {
    const state = run(
      connecting,
      joined,
      server(question({ server_time: 1000, ends_at: 1020 }), 990_000),
    )
    const left = (nowMs: number) => secondsLeftAt(state.question, state.clockOffset, nowMs)
    expect(left(990_000)).toBe(20) // just arrived
    expect(left(995_000)).toBe(15) // 5s later on this device
    expect(left(1_020_000)).toBe(0) // long over: never negative
    expect(left(989_000)).toBe(20) // a slightly stale "now": never above the time limit
  })

  it('remembers the tapped option straight away, then the server confirms it', () => {
    let state = run(connecting, joined, server(question()), { type: 'answer_sent', choice: 2 })
    expect(state.myChoice).toBe(2)
    expect(state.answered).toBe(false)
    state = gameReducer(state, server({ type: 'answer_ack', question_id: 0 }))
    expect(state.answered).toBe(true)
  })

  it('keeps the latest answer count', () => {
    const state = run(
      connecting,
      joined,
      server(question()),
      server({ type: 'answer_count', question_id: 0, answered: 4, total: 6 }),
    )
    expect(state.answerCount).toMatchObject({ answered: 4, total: 6 })
  })

  it('shows TIME_UP when the answer arrived too late', () => {
    const state = run(
      connecting,
      joined,
      server(question()),
      { type: 'answer_sent', choice: 1 },
      server({ type: 'error', code: 'TIME_UP', message: 'late' }),
    )
    expect(state.phase).toBe('question')
    expect(state.error).toBe('TIME_UP')
    expect(state.answered).toBe(false)
  })

  it('treats ALREADY_ANSWERED as answered', () => {
    const state = run(
      connecting,
      joined,
      server(question()),
      server({ type: 'error', code: 'ALREADY_ANSWERED', message: 'dup' }),
    )
    expect(state.answered).toBe(true)
    expect(state.error).toBeNull()
  })

  it('resets everything when the next question arrives', () => {
    const state = run(
      connecting,
      joined,
      server(question()),
      { type: 'answer_sent', choice: 1 },
      server({ type: 'answer_ack', question_id: 0 }),
      server({ type: 'answer_count', question_id: 0, answered: 1, total: 1 }),
      server(question({ id: 1, index: 1 })),
    )
    expect(state.question?.id).toBe(1)
    expect(state.myChoice).toBeNull()
    expect(state.answered).toBe(false)
    expect(state.answerCount).toBeNull()
  })

  it('ignores message types it does not handle yet', () => {
    const before = run(connecting, joined, server(question()))
    const reveal = { type: 'reveal', question_id: 0 } as unknown as ServerMessage
    expect(gameReducer(before, server(reveal))).toBe(before)
  })

  it('reports a lost connection if the socket closes during a question', () => {
    const state = run(connecting, joined, server(question()), { type: 'closed' })
    expect(state.phase).toBe('disconnected')
    expect(state.error).toBe('CONNECTION_LOST')
  })
})
