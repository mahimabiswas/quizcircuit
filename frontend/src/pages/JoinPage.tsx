import { useState, type SubmitEvent } from 'react'
import { useParams } from 'react-router'
import { Logo } from '../components/Logo'
import { joinErrorText } from '../game/joinErrors'
import type { JoinErrorCode } from '../game/reducer'

// Same limit as the backend (docs/protocol.md: names are 1-20 characters).
const MAX_NAME_LENGTH = 20

interface JoinPageProps {
  /** Called with the cleaned-up code and name when the player taps "Join game". */
  onJoin: (code: string, name: string) => void
  /** True while waiting for the server to accept the join. */
  busy?: boolean
  /** Why the last join failed, if it did. */
  error?: JoinErrorCode | null
}

export function JoinPage({ onJoin, busy = false, error = null }: JoinPageProps) {
  // An invite link like /join/QC-4821 fills in the code for the player.
  const params = useParams()
  const [code, setCode] = useState(params.code?.toUpperCase() ?? '')
  const [name, setName] = useState('')

  const cleanCode = code.trim()
  const cleanName = name.trim()
  const canJoin = cleanCode !== '' && cleanName !== '' && !busy

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault() // stop the browser reloading the page
    if (canJoin) onJoin(cleanCode, cleanName)
  }

  // Phones (the default): no card, form at the bottom of the screen where thumbs reach.
  // From the `sm` breakpoint (640px wide) up: the form sits in a centred card,
  // like the cards on the desktop host screens.
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>

      <main className="flex flex-1 flex-col justify-end px-4 pb-8 sm:items-center sm:justify-center sm:pb-24">
        <div className="w-full sm:max-w-md sm:rounded-2xl sm:border sm:border-border sm:bg-surface sm:p-8">
          <h1 className="text-3xl font-bold">Join the game</h1>
          <p className="mt-2 text-muted">
            Enter the code from the big screen and pick a name. No account needed.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Game code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="QC-4821"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="rounded-lg border border-border bg-surface-raised px-3 py-3 tracking-wider placeholder:text-muted/60 focus:border-accent focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John"
                maxLength={MAX_NAME_LENGTH}
                autoComplete="nickname"
                className="rounded-lg border border-border bg-surface-raised px-3 py-3 placeholder:text-muted/60 focus:border-accent focus:outline-none"
              />
            </label>

            {/* role="alert" makes screen readers read the error out as soon as it appears. */}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-wrong/40 bg-wrong/10 px-3 py-2 text-sm text-wrong"
              >
                {joinErrorText(error)}
              </p>
            )}

            <button
              type="submit"
              disabled={!canJoin}
              className="mt-2 rounded-lg bg-accent py-3 font-semibold hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Joining…' : 'Join game'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
