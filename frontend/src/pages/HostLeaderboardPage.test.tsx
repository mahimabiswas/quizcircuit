import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Ranking } from '../protocol'
import { HostLeaderboardPage } from './HostLeaderboardPage'

const RANKINGS: Ranking[] = [
  { rank: 1, name: 'Priya', score: 7420 },
  { rank: 2, name: 'Tom', score: 6980 },
  { rank: 3, name: 'Aisha', score: 6710 },
]

function renderBoard(rankings = RANKINGS) {
  render(
    <MemoryRouter initialEntries={['/host/QC-4821']}>
      <Routes>
        <Route path="/host/:code" element={<HostLeaderboardPage rankings={rankings} />} />
        <Route path="/host" element={<p>New game page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HostLeaderboardPage', () => {
  it('shows the winner and the full ranking', () => {
    renderBoard()
    expect(screen.getByRole('heading', { name: 'Final leaderboard' })).toBeInTheDocument()
    expect(screen.getByText('Priya takes the win with 7,420 points')).toBeInTheDocument()
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      '1Priya7,420',
      '2Tom6,980',
      '3Aisha6,710',
    ])
  })

  it('does not mark anyone as "(you)"', () => {
    renderBoard()
    expect(screen.queryByText(/\(you\)/)).not.toBeInTheDocument()
  })

  it('mentions every winner on a tie', () => {
    renderBoard([
      { rank: 1, name: 'Priya', score: 900 },
      { rank: 1, name: 'Tom', score: 900 },
    ])
    expect(screen.getByText('Priya and Tom share the win with 900 points')).toBeInTheDocument()
  })

  it('"Start a new game" goes to the host start page', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(screen.getByRole('link', { name: 'Start a new game' }))
    expect(screen.getByText('New game page')).toBeInTheDocument()
  })
})
