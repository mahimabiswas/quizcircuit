// The host's setup at /host: Create a quiz -> Generating -> Review your quiz.
// Holds the state and picks the screen, like PlayerGame does for players.

import { useEffect, useRef, useState } from 'react'
import { ApiError, generateQuiz } from '../api'
import { DEFAULT_TIME_LIMIT } from '../host/quizDraft'
import type { QuizRequest } from '../host/uploads'
import type { GeneratedQuestion } from '../protocol'
import { CreateQuizPage } from './CreateQuizPage'
import { GeneratingPage } from './GeneratingPage'
import { ReviewQuizPage } from './ReviewQuizPage'

type Screen = 'form' | 'generating' | 'review'

export function HostCreateFlow() {
  const [screen, setScreen] = useState<Screen>('form')
  const [request, setRequest] = useState<QuizRequest | null>(null)
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([])
  const [error, setError] = useState<string | null>(null)
  // 429: this IP used its generations for the day (or OpenAI is rate-limiting us).
  const [rateLimited, setRateLimited] = useState(false)
  // The in-flight request, so Cancel (or leaving the page) can stop it.
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  async function generate(next: QuizRequest) {
    const controller = new AbortController()
    inFlight.current = controller
    setRequest(next)
    setError(null)
    setRateLimited(false)
    setScreen('generating')
    try {
      setQuestions(await generateQuiz(next, controller.signal))
      setScreen('review')
    } catch (caught) {
      if (controller.signal.aborted) return // cancelled: cancel() already went back
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
      )
      setRateLimited(caught instanceof ApiError && caught.status === 429)
      setScreen('form')
    } finally {
      if (inFlight.current === controller) inFlight.current = null
    }
  }

  function cancel() {
    inFlight.current?.abort()
    setScreen('form')
  }

  if (screen === 'generating' && request) {
    return (
      <GeneratingPage
        fileCount={request.files.length}
        questionCount={request.count}
        onCancel={cancel}
      />
    )
  }

  if (screen === 'review') {
    return (
      <ReviewQuizPage
        initialQuiz={{ time_limit: DEFAULT_TIME_LIMIT, questions }}
        requestedCount={request?.count}
        onStartOver={() => setScreen('form')}
      />
    )
  }

  return (
    <CreateQuizPage
      onGenerate={generate}
      initial={request}
      error={error}
      errorTitle={rateLimited ? 'Rate limit reached' : null}
    />
  )
}
