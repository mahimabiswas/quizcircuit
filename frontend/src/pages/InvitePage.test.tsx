import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InvitePage } from './InvitePage'

const URL = 'http://localhost:5173/join/QC-4821'

function renderInvite(players: string[] = []) {
  const onStart = vi.fn()
  const onKick = vi.fn()
  render(
    <InvitePage code="QC-4821" joinUrl={URL} players={players} onStart={onStart} onKick={onKick} />,
  )
  return { onStart, onKick }
}

describe('InvitePage', () => {
  it('shows the join code and the join link', () => {
    renderInvite()
    expect(screen.getByRole('img', { name: 'Join code QC-4821' })).toBeInTheDocument()
    expect(screen.getByLabelText('Join link')).toHaveValue(URL)
  })

  it('copies the link and says so', async () => {
    const user = userEvent.setup() // also gives the test a working clipboard
    renderInvite()
    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await navigator.clipboard.readText()).toBe(URL)
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument()
  })

  it('when the browser blocks copying, selects the link and says how to copy it', async () => {
    const user = userEvent.setup()
    // As on http://192.168.x.x: no Clipboard API, and the fallback copy fails too.
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true })
    try {
      renderInvite()
      await user.click(screen.getByRole('button', { name: 'Copy link' }))
      expect(screen.getByRole('status')).toHaveTextContent('press Ctrl+C')
      const input = screen.getByLabelText('Join link') as HTMLInputElement
      expect(input).toHaveFocus()
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, URL.length])
    } finally {
      Reflect.deleteProperty(document, 'execCommand')
    }
  })

  it('waits for players, with Start disabled', () => {
    renderInvite([])
    expect(screen.getByText('Waiting for players to join…')).toBeInTheDocument()
    expect(screen.getByText('00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start quiz' })).toBeDisabled()
  })

  it('lists the players with a count', () => {
    renderInvite(['Priya', 'Tom', 'Aisha'])
    expect(screen.getByText('03')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Players' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Priya×',
      'Tom×',
      'Aisha×',
    ])
  })

  it('removes a player with their × button', async () => {
    const user = userEvent.setup()
    const { onKick } = renderInvite(['Priya', 'Tom'])
    await user.click(screen.getByRole('button', { name: 'Remove Tom' }))
    expect(onKick).toHaveBeenCalledWith('Tom')
  })

  it('starts the quiz once someone has joined', async () => {
    const user = userEvent.setup()
    const { onStart } = renderInvite(['Priya'])
    await user.click(screen.getByRole('button', { name: 'Start quiz' }))
    expect(onStart).toHaveBeenCalledOnce()
  })
})
