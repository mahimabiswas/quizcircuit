import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Ranking } from '../protocol'
import { LeaderboardPage } from './LeaderboardPage'

const RANKINGS: Ranking[] = [
  { rank: 1, name: 'Priya', score: 7420 },
  { rank: 2, name: 'Tom', score: 6980 },
  { rank: 2, name: 'Aisha', score: 6980 },
  { rank: 4, name: 'Jack', score: 5850 },
]

function renderBoard(name: string) {
  const onDone = vi.fn()
  render(<LeaderboardPage name={name} rankings={RANKINGS} onDone={onDone} />)
  return { onDone }
}

describe('LeaderboardPage', () => {
  it('shows the player’s place and points', () => {
    renderBoard('Priya')
    expect(screen.getByRole('heading', { name: 'You finished 1st!' })).toBeInTheDocument()
    expect(screen.getByText('7,420 points')).toBeInTheDocument()
  })

  it('says "tied" when another player has the same rank', () => {
    renderBoard('Aisha')
    expect(screen.getByRole('heading', { name: 'You tied for 2nd!' })).toBeInTheDocument()
  })

  it('lists everyone in order, marking this player', () => {
    renderBoard('Jack')
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      '1Priya7,420',
      '2Tom6,980',
      '2Aisha6,980',
      '4Jack (you)5,850',
    ])
    expect(rows[3]).toHaveAttribute('aria-current', 'true')
  })

  it('calls onDone when Done is pressed', async () => {
    const user = userEvent.setup()
    const { onDone } = renderBoard('Priya')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalledOnce()
  })
})
