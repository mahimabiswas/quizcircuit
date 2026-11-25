// Which files the host can upload for AI quiz generation. Mirrors the backend's
// checks (backend/app/main.py) so problems show up before anything is sent;
// the backend still checks everything.

export const MAX_FILES = 3
export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
export const ACCEPTED_EXTENSIONS = ['.pdf', '.txt', '.md'] as const

export const MIN_QUESTIONS = 5
export const MAX_QUESTIONS = 20
export const DEFAULT_QUESTIONS = 10

/** What the Create a quiz page asks the backend for. */
export interface QuizRequest {
  files: File[]
  count: number
  /** How many should be true/false; null lets the AI choose the mix. */
  trueFalse: number | null
}

/** "notes.PDF" -> ".pdf" */
export function extension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

/** The short label shown next to a file: "PDF", "TXT" or "MD". */
export function fileKind(name: string): string {
  return extension(name).slice(1).toUpperCase()
}

/** Why this file can't be used, in words for the host, or null if it's fine. */
export function fileProblem(file: File): string | null {
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension(file.name))) {
    return `"${file.name}" isn't a PDF, TXT or MD file. Export slides as PDF first.`
  }
  if (file.size > MAX_FILE_BYTES) return `"${file.name}" is larger than 10 MB.`
  if (file.size === 0) return `"${file.name}" is empty.`
  return null
}

/**
 * Add newly picked files to the current list: skip ones already added (same name and
 * size), reject unusable ones, and stop at MAX_FILES. Returns the new list and the
 * problems to show.
 */
export function addFiles(current: File[], picked: File[]): { files: File[]; problems: string[] } {
  const files = [...current]
  const problems: string[] = []
  for (const file of picked) {
    if (files.some((f) => f.name === file.name && f.size === file.size)) continue
    const problem = fileProblem(file)
    if (problem) {
      problems.push(problem)
    } else if (files.length >= MAX_FILES) {
      problems.push(`You can upload at most ${MAX_FILES} files. "${file.name}" wasn't added.`)
    } else {
      files.push(file)
    }
  }
  return { files, problems }
}

/** 2_400_000 -> "2.3 MB", 48_000 -> "47 KB" */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
