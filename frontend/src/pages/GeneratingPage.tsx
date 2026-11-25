// Shown while the AI writes the questions (usually well under a minute).
// One request can't report real progress, so this lists what's happening
// without made-up counts.

import { Logo } from '../components/Logo'

interface GeneratingPageProps {
  fileCount: number
  questionCount: number
  onCancel: () => void
}

export function GeneratingPage({ fileCount, questionCount, onCancel }: GeneratingPageProps) {
  const steps = [
    `Reading ${fileCount} ${fileCount === 1 ? 'document' : 'documents'}`,
    `Writing ${questionCount} questions`,
    'Checking every answer against your files',
  ]

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <section
          aria-live="polite"
          aria-busy="true"
          className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center"
        >
          <div
            className="mx-auto size-12 animate-spin rounded-full border-4 border-border border-t-accent"
            aria-hidden
          />
          <h1 className="mt-5 text-xl font-bold">Generating your quiz…</h1>
          <p className="mt-1 text-sm text-muted">This usually takes under a minute.</p>

          <ul className="mt-6 space-y-2 text-left text-sm">
            {steps.map((step) => (
              <li key={step} className="flex items-center gap-3">
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
                {step}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onCancel}
            className="mt-8 rounded-lg border border-border px-5 py-2 text-sm hover:border-accent"
          >
            Cancel
          </button>
        </section>
      </main>
    </div>
  )
}
