// "Create a quiz": the host uploads documents and picks how many questions and
// which kinds; the AI then writes the questions (wired up in the next step).

import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Logo } from '../components/Logo'
import { Stepper } from '../components/Stepper'
import {
  ACCEPTED_EXTENSIONS,
  DEFAULT_QUESTIONS,
  MAX_FILES,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  addFiles,
  fileKind,
  formatSize,
  type QuizRequest,
} from '../host/uploads'

interface CreateQuizPageProps {
  onGenerate: (request: QuizRequest) => void
  /** True while the questions are being generated. */
  busy?: boolean
  /** Why the last attempt failed, if it did. */
  error?: string | null
}

export function CreateQuizPage({ onGenerate, busy = false, error = null }: CreateQuizPageProps) {
  const [files, setFiles] = useState<File[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const [count, setCount] = useState(DEFAULT_QUESTIONS)
  const [mix, setMix] = useState<'auto' | 'custom'>('auto')
  const [trueFalse, setTrueFalse] = useState(3)

  // In Custom mode the two kinds always add up to the total.
  const customTrueFalse = Math.min(trueFalse, count)

  function add(picked: FileList | null) {
    if (!picked) return
    const result = addFiles(files, Array.from(picked))
    setFiles(result.files)
    setProblems(result.problems)
  }

  function remove(file: File) {
    setFiles(files.filter((f) => f !== file))
    setProblems([])
  }

  function generate() {
    onGenerate({ files, count, trueFalse: mix === 'auto' ? null : customTrueFalse })
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <span className="rounded-full bg-surface-raised px-3 py-1 text-xs text-muted">Host</span>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10 sm:px-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold sm:text-3xl">Create a quiz</h1>
          <p className="mt-2 text-muted">
            Upload your notes or slides and we'll turn them into questions you can host live.
          </p>
        </div>

        <section className="mt-6 space-y-6 rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <DropZone onFiles={add} disabled={busy} />

          {problems.length > 0 && (
            <ul role="alert" className="space-y-1 text-sm text-wrong">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <ul aria-label="Files to use" className="space-y-2">
              {files.map((file) => (
                <li
                  key={`${file.name}-${file.size}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
                >
                  <span className="w-10 shrink-0 rounded bg-accent/20 py-0.5 text-center text-xs font-semibold text-accent">
                    {fileKind(file.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-muted">{formatSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => remove(file)}
                    disabled={busy}
                    aria-label={`Remove ${file.name}`}
                    className="grid size-6 shrink-0 place-items-center rounded-full text-muted hover:bg-wrong/20 hover:text-wrong"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Row title="Number of questions" hint={`Between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}`}>
            <Stepper
              label="questions"
              value={count}
              min={MIN_QUESTIONS}
              max={MAX_QUESTIONS}
              onChange={setCount}
            />
          </Row>

          <Row title="Question mix" hint="Auto lets the AI choose the best types">
            <div role="radiogroup" aria-label="Question mix" className="flex rounded-lg border border-border p-0.5">
              {(['auto', 'custom'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={mix === option}
                  onClick={() => setMix(option)}
                  className={`rounded-md px-4 py-1.5 text-sm capitalize ${
                    mix === option ? 'bg-accent font-semibold' : 'text-muted hover:text-text'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </Row>

          {mix === 'custom' && (
            <div className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
              <Row title="Multiple choice">
                <Stepper
                  label="multiple choice questions"
                  value={count - customTrueFalse}
                  min={0}
                  max={count}
                  onChange={(multipleChoice) => setTrueFalse(count - multipleChoice)}
                />
              </Row>
              <Row title="True / False">
                <Stepper
                  label="true/false questions"
                  value={customTrueFalse}
                  min={0}
                  max={count}
                  onChange={setTrueFalse}
                />
              </Row>
              <p className="text-right text-xs text-muted">Total: {count} questions</p>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-wrong/40 bg-wrong/10 px-3 py-2 text-sm text-wrong">
              {error}
            </p>
          )}

          <div className="flex justify-end border-t border-border pt-5">
            <button
              type="button"
              onClick={generate}
              disabled={files.length === 0 || busy}
              className="w-full rounded-lg bg-accent px-6 py-3 font-semibold hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {busy ? 'Generating…' : 'Generate quiz'}
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

function DropZone({ onFiles, disabled }: { onFiles: (files: FileList | null) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(event: DragEvent) {
    event.preventDefault() // stop the browser opening the file
    setDragging(false)
    if (!disabled) onFiles(event.dataTransfer.files)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault() // needed for onDrop to fire
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
        dragging ? 'border-accent bg-accent/10' : 'border-border bg-surface-raised'
      }`}
    >
      <span className="grid size-10 place-items-center rounded-full bg-accent text-xl" aria-hidden>
        +
      </span>
      <p className="mt-3 font-semibold">Drop your notes or slides here</p>
      <p className="mt-1 text-xs text-muted">
        PDF, TXT or MD · up to {MAX_FILES} files · 10 MB each
      </p>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled}
        className="mt-4 rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:border-accent disabled:opacity-40"
      >
        Browse files
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        aria-label="Upload files"
        className="sr-only"
        onChange={(event) => {
          onFiles(event.target.files)
          event.target.value = '' // so picking the same file again still triggers a change
        }}
      />
    </div>
  )
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  )
}
