import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HostCreateFlow } from './HostCreateFlow'

const QUESTIONS = [
  {
    text: 'Who handles writes in Raft?',
    options: ['The leader', 'A follower', 'The client', 'Nobody'],
    correct: 0,
    source: { file: 'raft.pdf', page: 3, quote: 'All client writes go to the leader.' },
  },
  {
    text: 'An entry is committed once every server stores it.',
    options: ['True', 'False'],
    correct: 1,
    source: { file: 'raft.pdf', page: 4, quote: 'committed once a majority' },
  },
]

/**
 * A fetch that answers only when the test calls respond(), so the Generating screen
 * can be checked while it waits. Like the real fetch, it rejects when aborted.
 */
function controllableFetch() {
  let respond!: (response: Response) => void
  let signal: AbortSignal | undefined
  const fetchMock = vi.fn((_url: string, init: RequestInit) => {
    signal = init.signal ?? undefined
    return new Promise<Response>((resolve, reject) => {
      respond = resolve
      signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError')),
      )
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    fetchMock,
    respond: (body: unknown, status = 200) =>
      act(async () => respond(new Response(JSON.stringify(body), { status }))),
    aborted: () => signal?.aborted ?? false,
  }
}

async function uploadAndGenerate() {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <HostCreateFlow />
    </MemoryRouter>,
  )
  await user.upload(screen.getByLabelText('Upload files'), new File(['%PDF-1.7'], 'raft.pdf'))
  await user.click(screen.getByRole('button', { name: 'Generate quiz' }))
  return user
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HostCreateFlow', () => {
  it('starts on Create a quiz', () => {
    render(
      <MemoryRouter>
        <HostCreateFlow />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Create a quiz' })).toBeInTheDocument()
  })

  it('shows Generating while the AI works, then the questions to review', async () => {
    const server = controllableFetch()
    await uploadAndGenerate()

    expect(screen.getByRole('heading', { name: 'Generating your quiz…' })).toBeInTheDocument()
    expect(screen.getByText('Reading 1 document')).toBeInTheDocument()
    expect(screen.getByText('Writing 10 questions')).toBeInTheDocument()

    await server.respond({ questions: QUESTIONS })

    expect(screen.getByRole('heading', { name: 'Review your quiz' })).toBeInTheDocument()
    const first = screen.getByRole('article', { name: 'Question 1' })
    expect(within(first).getByRole('heading')).toHaveTextContent('Who handles writes in Raft?')
    expect(within(first).getByText(/^Source:/)).toHaveTextContent('raft.pdf, p.3')
    expect(screen.getByText('2 of 10 questions passed our checks. The others were left out.'))
      .toBeInTheDocument()
  })

  it('goes back to the form with the error and the files kept', async () => {
    const server = controllableFetch()
    await uploadAndGenerate()
    await server.respond({ detail: 'The AI service is busy right now. Try again in a minute.' }, 502)

    expect(screen.getByRole('heading', { name: 'Create a quiz' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('busy right now')
    expect(screen.getByText('raft.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate quiz' })).toBeEnabled()
  })

  it('says when the daily generation limit is reached', async () => {
    const server = controllableFetch()
    await uploadAndGenerate()
    await server.respond(
      { detail: "You've used your 3 quiz generations for today. Try again in 24 hours." },
      429,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Rate limit reached')
    expect(alert).toHaveTextContent('Try again in 24 hours.')
  })

  it('gives other errors no rate-limit heading', async () => {
    const server = controllableFetch()
    await uploadAndGenerate()
    await server.respond({ detail: 'The AI service is busy right now.' }, 502)
    expect(screen.getByRole('alert')).not.toHaveTextContent('Rate limit reached')
  })

  it('cancels a generation in progress', async () => {
    const server = controllableFetch()
    const user = await uploadAndGenerate()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(server.aborted()).toBe(true)
    expect(screen.getByRole('heading', { name: 'Create a quiz' })).toBeInTheDocument()
    expect(screen.getByText('raft.pdf')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // cancelling isn't an error
  })

  it('can go back from Review to upload different files', async () => {
    const server = controllableFetch()
    const user = await uploadAndGenerate()
    await server.respond({ questions: QUESTIONS })
    await user.click(screen.getByRole('button', { name: '← Upload different files' }))

    expect(screen.getByRole('heading', { name: 'Create a quiz' })).toBeInTheDocument()
    expect(screen.getByText('raft.pdf')).toBeInTheDocument()
  })
})
