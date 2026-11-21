import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { JoinPage } from './JoinPage'

// Render the page at a given URL, the same way App.tsx routes to it.
function renderAt(url: string) {
  const onJoin = vi.fn()
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/" element={<JoinPage onJoin={onJoin} />} />
        <Route path="/join/:code" element={<JoinPage onJoin={onJoin} />} />
      </Routes>
    </MemoryRouter>,
  )
  return {
    onJoin,
    codeInput: screen.getByLabelText('Game code'),
    nameInput: screen.getByLabelText('Your name'),
    joinButton: screen.getByRole('button', { name: 'Join game' }),
  }
}

describe('JoinPage', () => {
  it('shows the heading and an empty form', () => {
    const { codeInput, nameInput } = renderAt('/')
    expect(screen.getByRole('heading', { name: 'Join the game' })).toBeInTheDocument()
    expect(codeInput).toHaveValue('')
    expect(nameInput).toHaveValue('')
  })

  it('keeps Join disabled until both fields are filled', async () => {
    const user = userEvent.setup()
    const { codeInput, nameInput, joinButton } = renderAt('/')
    expect(joinButton).toBeDisabled()
    await user.type(codeInput, 'QC-4821')
    expect(joinButton).toBeDisabled()
    await user.type(nameInput, 'Priya')
    expect(joinButton).toBeEnabled()
  })

  it('treats a name of only spaces as empty', async () => {
    const user = userEvent.setup()
    const { codeInput, nameInput, joinButton } = renderAt('/')
    await user.type(codeInput, 'QC-4821')
    await user.type(nameInput, '   ')
    expect(joinButton).toBeDisabled()
  })

  it('upper-cases the code as it is typed', async () => {
    const user = userEvent.setup()
    const { codeInput } = renderAt('/')
    await user.type(codeInput, 'qc-4821')
    expect(codeInput).toHaveValue('QC-4821')
  })

  it('caps the name at 20 characters', async () => {
    const user = userEvent.setup()
    const { nameInput } = renderAt('/')
    await user.type(nameInput, 'a'.repeat(25))
    expect(nameInput).toHaveValue('a'.repeat(20))
  })

  it('fills in the code from an invite link', () => {
    const { codeInput } = renderAt('/join/qc-4821')
    expect(codeInput).toHaveValue('QC-4821')
  })

  it('sends the trimmed code and name on Join', async () => {
    const user = userEvent.setup()
    const { codeInput, nameInput, joinButton, onJoin } = renderAt('/')
    await user.type(codeInput, ' qc-4821 ')
    await user.type(nameInput, '  Priya ')
    await user.click(joinButton)
    expect(onJoin).toHaveBeenCalledWith('QC-4821', 'Priya')
  })

  it('submits when Enter is pressed in the name field', async () => {
    const user = userEvent.setup()
    const { codeInput, nameInput, onJoin } = renderAt('/')
    await user.type(codeInput, 'QC-4821')
    await user.type(nameInput, 'Priya{Enter}')
    expect(onJoin).toHaveBeenCalledOnce()
  })
})
