// REST calls. Paths are relative: in dev, Vite forwards /rooms and /quizzes to the backend.

import type { QuizRequest } from './host/uploads'
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  GeneratedQuestion,
  GenerateQuizResponse,
} from './protocol'

/** A failed request, with a message that can be shown to the host. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function createRoom(body: CreateRoomRequest): Promise<CreateRoomResponse> {
  const response = await fetch('/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Could not create the room (HTTP ${response.status})`)
  return response.json()
}

/**
 * Ask the backend's AI to write questions from the uploaded files.
 * Throws ApiError with a host-friendly message; an AbortError if `signal` is aborted.
 */
export async function generateQuiz(
  request: QuizRequest,
  signal?: AbortSignal,
): Promise<GeneratedQuestion[]> {
  // multipart/form-data: the browser sets the Content-Type (with its boundary) itself.
  const form = new FormData()
  for (const file of request.files) form.append('files', file)
  form.append('count', String(request.count))
  if (request.trueFalse !== null) form.append('true_false', String(request.trueFalse))

  let response: Response
  try {
    response = await fetch('/quizzes/generate', { method: 'POST', body: form, signal })
  } catch (error) {
    if (signal?.aborted) throw error // the host cancelled: not a failure to report
    throw new ApiError(0, "Couldn't reach the server. Is the backend running?")
  }
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response))
  const body: GenerateQuizResponse = await response.json()
  return body.questions
}

/** The backend's {"detail": "..."} message, or a general one. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
      return body.detail
    }
  } catch {
    // Not JSON: fall through.
  }
  return response.status === 422
    ? "Some of the quiz settings weren't accepted."
    : `Something went wrong (HTTP ${response.status}). Please try again.`
}
