// Small helpers around the browser WebSocket.

import type { ClientMessage, ServerMessage } from '../protocol'

/** The parts of WebSocket we use. Tests pass a fake that has the same shape. */
export interface SocketLike {
  readyState: number
  send(data: string): void
  close(code?: number): void
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
}

export type SocketFactory = (url: string) => SocketLike

export const OPEN = 1 // WebSocket.OPEN

export const browserSocket: SocketFactory = (url) => new WebSocket(url)

/** ws://<this site>/ws/QC-4821. In dev, Vite forwards /ws to the backend. */
export function socketUrl(code: string, location: Location = window.location): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.host}/ws/${encodeURIComponent(code)}`
}

export function send(socket: SocketLike, message: ClientMessage): void {
  if (socket.readyState === OPEN) socket.send(JSON.stringify(message))
}

/** Parse one frame from the server. Returns null for anything that is not a message. */
export function parseMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null
  try {
    const value: unknown = JSON.parse(data)
    if (typeof value === 'object' && value !== null && 'type' in value) {
      return value as ServerMessage
    }
  } catch {
    // Not JSON: ignore it.
  }
  return null
}
