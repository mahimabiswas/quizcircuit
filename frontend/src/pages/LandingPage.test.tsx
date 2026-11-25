import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { LandingPage } from './LandingPage'

function renderAtHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/host" element={<p>Create a quiz page</p>} />
        <Route path="/join" element={<p>Join page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  it('explains what QuizCircuit is and how it works', () => {
    renderAtHome()
    expect(
      screen.getByRole('heading', { name: 'Live quizzes from your own notes' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upload your notes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Review the questions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Play live' })).toBeInTheDocument()
  })

  it('"Create a quiz" goes to the create page', async () => {
    renderAtHome()
    await userEvent.setup().click(screen.getByRole('link', { name: 'Create a quiz' }))
    expect(screen.getByText('Create a quiz page')).toBeInTheDocument()
  })

  it('"Join a game" goes to the join page', async () => {
    renderAtHome()
    await userEvent.setup().click(screen.getByRole('link', { name: 'Join a game' }))
    expect(screen.getByText('Join page')).toBeInTheDocument()
  })
})
