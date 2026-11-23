import { useEffect, useState } from 'react'
import { Logo } from '../components/Logo'

interface InvitePageProps {
  code: string
  /** Full link a player can open, e.g. http://localhost:5173/join/QC-4821 */
  joinUrl: string
  players: string[]
  onStart: () => void
  onKick: (name: string) => void
}

export function InvitePage({ code, joinUrl, players, onStart, onKick }: InvitePageProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <span className="rounded-full bg-surface-raised px-3 py-1 text-xs text-muted">Host</span>
      </header>

      {/* Phones: the two cards stack. Laptops (lg, 1024px+): side by side, like the design. */}
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-4 px-4 pb-8 sm:px-8 lg:grid-cols-2 lg:items-stretch">
        <InviteCard code={code} joinUrl={joinUrl} />
        <PlayersCard players={players} onStart={onStart} onKick={onKick} />
      </main>
    </div>
  )
}

function InviteCard({ code, joinUrl }: { code: string; joinUrl: string }) {
  const [copied, setCopied] = useState(false)

  // Show "Copied!" for 2 seconds, then go back to "Copy link".
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
    } catch {
      // Clipboard blocked (e.g. not https on another device): the link is still visible to copy by hand.
    }
  }

  return (
    <section className="flex flex-col justify-center rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold">Invite players</h1>
      <p className="mt-2 text-muted">Share the link or the code. Players join with just a name.</p>

      <p className="mt-8 text-center text-sm text-muted">Join code</p>
      {/* Screen readers read the whole code once; the boxes are just for show. */}
      <div aria-label={`Join code ${code}`} role="img" className="mt-3 flex justify-center gap-1.5 sm:gap-2">
        {[...code].map((char, i) =>
          char === '-' ? (
            <span key={i} className="self-center px-0.5 text-2xl text-muted" aria-hidden>
              -
            </span>
          ) : (
            <span
              key={i}
              aria-hidden
              className="grid h-12 w-10 place-items-center rounded-lg border border-border bg-surface-raised text-2xl font-bold sm:h-14 sm:w-12"
            >
              {char}
            </span>
          ),
        )}
      </div>

      <div className="mt-8 flex gap-2">
        <input
          readOnly
          value={joinUrl}
          aria-label="Join link"
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-muted"
        />
        <button
          type="button"
          onClick={copyLink}
          className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-accent"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </section>
  )
}

interface PlayersCardProps {
  players: string[]
  onStart: () => void
  onKick: (name: string) => void
}

function PlayersCard({ players, onStart, onKick }: PlayersCardProps) {
  const count = players.length

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-semibold">Players</h2>
        <p className="text-right">
          <span className="block text-4xl font-bold">{String(count).padStart(2, '0')}</span>
          <span className="text-xs text-muted">joined</span>
        </p>
      </div>

      {count === 0 ? (
        <p className="mt-6 text-sm text-muted">Waiting for players to join…</p>
      ) : (
        <ul aria-label="Players" className="mt-6 flex flex-wrap gap-2">
          {players.map((name) => (
            <li
              key={name}
              className="flex items-center gap-1.5 rounded-full bg-surface-raised py-1 pr-1 pl-3 text-sm"
            >
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              {name}
              <button
                type="button"
                onClick={() => onKick(name)}
                aria-label={`Remove ${name}`}
                className="grid size-6 place-items-center rounded-full text-muted hover:bg-wrong/20 hover:text-wrong"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-col gap-3 pt-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">Players can't join once the quiz starts.</p>
        <button
          type="button"
          onClick={onStart}
          disabled={count === 0}
          className="rounded-lg bg-accent px-6 py-3 font-semibold hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Start quiz
        </button>
      </div>
    </section>
  )
}
