import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, generateQuiz } from './api'

const PDF = new File(['%PDF-1.7'], 'notes.pdf', { type: 'application/pdf' })
const MD = new File(['# Notes'], 'notes.md', { type: 'text/markdown' })

const QUESTION = {
  text: 'Who handles writes?',
  options: ['The leader', 'A follower'],
  correct: 0,
  source: { file: 'notes.pdf', page: 2, quote: 'Writes go to the leader.' },
}

function mockFetch(response: Response | Promise<Response>) {
  const fetchMock = vi.fn().mockReturnValue(Promise.resolve(response))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('generateQuiz', () => {
  it('posts the files, count and mix as a form, and returns the questions', async () => {
    const fetchMock = mockFetch(json({ questions: [QUESTION] }))
    const questions = await generateQuiz({ files: [PDF, MD], count: 8, trueFalse: 3 })

    expect(questions).toEqual([QUESTION])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/quizzes/generate')
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    expect((form.getAll('files') as File[]).map((f) => f.name)).toEqual(['notes.pdf', 'notes.md'])
    expect(form.get('count')).toBe('8')
    expect(form.get('true_false')).toBe('3')
  })

  it('leaves out true_false for an automatic mix', async () => {
    const fetchMock = mockFetch(json({ questions: [] }))
    await generateQuiz({ files: [PDF], count: 10, trueFalse: null })
    expect((fetchMock.mock.calls[0][1].body as FormData).has('true_false')).toBe(false)
  })

  it("passes on the backend's message for the host", async () => {
    mockFetch(json({ detail: 'The AI service is busy right now. Try again in a minute.' }, 502))
    const error = await generateQuiz({ files: [PDF], count: 10, trueFalse: null }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.message).toBe('The AI service is busy right now. Try again in a minute.')
  })

  it('has a general message when the backend gives none', async () => {
    mockFetch(json({ detail: [{ loc: ['body', 'count'], msg: 'too big' }] }, 422))
    await expect(generateQuiz({ files: [PDF], count: 10, trueFalse: null })).rejects.toThrow(
      "Some of the quiz settings weren't accepted.",
    )
    mockFetch(new Response('Bad gateway', { status: 504 }))
    await expect(generateQuiz({ files: [PDF], count: 10, trueFalse: null })).rejects.toThrow(
      'HTTP 504',
    )
  })

  it('explains when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(generateQuiz({ files: [PDF], count: 10, trueFalse: null })).rejects.toThrow(
      'Is the backend running?',
    )
  })

  it('lets a cancelled request end quietly (not as an ApiError)', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError')),
    )
    controller.abort()
    const error = await generateQuiz(
      { files: [PDF], count: 10, trueFalse: null },
      controller.signal,
    ).catch((e) => e)
    expect(error).not.toBeInstanceOf(ApiError)
    expect(error.name).toBe('AbortError')
  })
})
