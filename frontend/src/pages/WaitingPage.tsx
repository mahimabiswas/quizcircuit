import { Logo } from '../components/Logo'

interface WaitingPageProps {
  name: string // this player
  players: string[] // everyone in the lobby, including this player
}

export function WaitingPage({ name, players }: WaitingPageProps) {
  const others = players.filter((player) => player !== name)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>

      {/* Centred on every size; on laptops the content sits in a card, like the Join page. */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm text-center sm:max-w-md sm:rounded-2xl sm:border sm:border-border sm:bg-surface sm:p-8">
          <div className="mx-auto grid size-14 place-items-center rounded-xl bg-accent/20 text-2xl text-accent">
            ✓
          </div>
          <h1 className="mt-5 text-2xl font-bold">You're in, {name}!</h1>
          <p className="mt-2 text-muted">Waiting for the host to start the quiz…</p>

          <section className="mt-8 rounded-xl border border-border bg-surface p-4 text-left sm:bg-surface-raised">
            <h2 className="text-sm text-muted">Also here ({others.length})</h2>
            {others.length === 0 ? (
              <p className="mt-3 text-sm">You're the first one here.</p>
            ) : (
              // aria-live: screen readers announce players as they join.
              <ul aria-live="polite" className="mt-3 flex flex-wrap gap-2">
                {others.map((player) => (
                  <li
                    key={player}
                    className="flex items-center gap-1.5 rounded-full bg-surface-raised px-3 py-1 text-sm sm:bg-surface"
                  >
                    <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                    {player}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
