import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getHostToken } from '../game/hostToken'
import { SAMPLE_QUIZ } from '../host/sampleQuiz'
import { HostStartPage } from './HostStartPage'

function HostRoomStub() {
  return <p>Host room {useParams().code}</p>
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/host']}>
      <Routes>
        <Route path="/host" element={<HostStartPage />} />
        <Route path="/host/:code" element={<HostRoomStub />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HostStartPage', () => {
  it('creates a room with the sample quiz, saves the token and opens the room', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'QC-1234', host_token: 'secret' }), { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Start a sample game' }))

    expect(await screen.findByText('Host room QC-1234')).toBeInTheDocument()
    expect(getHostToken('QC-1234')).toBe('secret')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/rooms')
    expect(JSON.parse(init.body)).toEqual(SAMPLE_QUIZ)
  })

  it('explains when the room cannot be created', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Start a sample game' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Is the backend running?')
    expect(screen.getByRole('button', { name: 'Start a sample game' })).toBeEnabled()
  })
})
