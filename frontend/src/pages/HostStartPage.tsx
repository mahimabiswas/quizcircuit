// Temporary host entry point: creates a room with the sample quiz.
// The "Create a quiz" screen replaces this later.

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { createRoom } from '../api'
import { Logo } from '../components/Logo'
import { saveHostToken } from '../game/hostToken'
import { SAMPLE_QUIZ } from '../host/sampleQuiz'

export function HostStartPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      const room = await createRoom(SAMPLE_QUIZ)
      saveHostToken(room.code, room.host_token)
      navigate(`/host/${room.code}`)
    } catch {
      setError("Couldn't create a game. Is the backend running?")
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="text-2xl font-bold">Host a game</h1>
          <p className="mt-2 text-muted">
            Start a game with the sample quiz ({SAMPLE_QUIZ.questions.length} questions,{' '}
            {SAMPLE_QUIZ.time_limit} seconds each).
          </p>
          {error && (
            <p role="alert" className="mt-4 text-sm text-wrong">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            className="mt-6 w-full rounded-lg bg-accent py-3 font-semibold hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Start a sample game'}
          </button>
        </div>
      </main>
    </div>
  )
}
