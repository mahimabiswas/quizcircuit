// A stand-in for the browser WebSocket, so tests can play the server's part.

import type { ServerMessage } from '../protocol'
import type { SocketFactory, SocketLike } from '../game/socket'

export class FakeSocket implements SocketLike {
  readyState = 0 // CONNECTING
  sent: unknown[] = []
  closedByClient = false
  onopen: SocketLike['onopen'] = null
  onmessage: SocketLike['onmessage'] = null
  onclose: SocketLike['onclose'] = null

  readonly url: string

  constructor(url: string) {
    this.url = url
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close() {
    this.closedByClient = true
    this.readyState = 3
  }

  // --- the "server" side, called by tests ---

  open() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }

  receive(message: ServerMessage) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }))
  }

  serverClose(code = 1000) {
    this.readyState = 3
    this.onclose?.(new CloseEvent('close', { code }))
  }
}

/** A socket factory that remembers every socket it made. */
export function fakeSockets() {
  const sockets: FakeSocket[] = []
  const factory: SocketFactory = (url) => {
    const socket = new FakeSocket(url)
    sockets.push(socket)
    return socket
  }
  return {
    factory,
    sockets,
    get last() {
      return sockets[sockets.length - 1]
    },
  }
}
