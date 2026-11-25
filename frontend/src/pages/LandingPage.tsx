// The home page at "/": what QuizCircuit is, with the two ways in.

import { Link } from 'react-router'
import { Logo } from '../components/Logo'

const STEPS = [
  {
    title: 'Upload your notes',
    text: 'Add up to 3 PDF, TXT or Markdown files: lecture notes, readings, exported slides.',
  },
  {
    title: 'Review the questions',
    text: 'AI writes multiple choice and true/false questions, each with its source. Edit anything before you play.',
  },
  {
    title: 'Play live',
    text: 'Share a code. Players join from any phone or laptop with just a name, answer against the clock, and see the leaderboard.',
  },
]

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 pb-16 sm:px-8">
        <section className="text-center">
          <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-tight sm:text-5xl">
            Live quizzes from your own notes
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted sm:text-lg">
            Upload your notes or slides and QuizCircuit writes the questions. Players join with a
            code and a name. No accounts, no app to install.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/host"
              className="rounded-lg bg-accent px-6 py-3 font-semibold hover:bg-accent-hover"
            >
              Create a quiz
            </Link>
            <Link
              to="/join"
              className="rounded-lg border border-border px-6 py-3 font-semibold hover:border-accent"
            >
              Join a game
            </Link>
          </div>
        </section>

        <section aria-labelledby="how-it-works" className="mt-14 sm:mt-20">
          <h2 id="how-it-works" className="text-center text-sm font-medium text-muted">
            How it works
          </h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-border bg-surface p-5">
                <span className="grid size-8 place-items-center rounded-lg bg-accent/20 text-sm font-semibold text-accent">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  )
}
