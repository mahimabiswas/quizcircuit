// Owns the WebSocket and feeds what happens on it into gameReducer.

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { ClientMessage } from '../protocol'
import { gameReducer, initialState } from './reducer'
import {
  browserSocket,
  OPEN,
  parseMessage,
  send,
  socketUrl,
  type SocketFactory,
  type SocketLike,
} from './socket'

type HostCommand = Extract<ClientMessage, { type: 'start' | 'kick' | 'next' }>

interface Connection {
  socket: SocketLike
  code: string
}

export function useGame(createSocket: SocketFactory = browserSocket) {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  // A ref, not state: changing the socket should not re-render anything.
  const current = useRef<Connection | null>(null)

  // Close the socket when the page goes away.
  useEffect(() => {
    return () => {
      const connection = current.current
      current.current = null
      connection?.socket.close(1000)
    }
  }, [])

  /** Join as a player, or as the host when `hostToken` is given. */
  const join = useCallback(
    (code: string, name: string, hostToken?: string) => {
      dispatch({ type: 'connecting' })
      const message = hostToken
        ? ({ type: 'join', name, host_token: hostToken } as const)
        : ({ type: 'join', name } as const)

      // After a rejected name the server keeps the socket open: just try again on it.
      const existing = current.current
      if (existing && existing.code === code && existing.socket.readyState === OPEN) {
        send(existing.socket, message)
        return
      }

      const connection: Connection = { socket: createSocket(socketUrl(code)), code }
      current.current = connection // set first, so the old socket's close is ignored below
      existing?.socket.close(1000)

      const { socket } = connection
      socket.onopen = () => send(socket, message)
      socket.onmessage = (event) => {
        const message = parseMessage(event.data)
        if (message) dispatch({ type: 'server', message, receivedAt: Date.now() })
      }
      socket.onclose = () => {
        if (current.current !== connection) return // an old socket we replaced
        current.current = null
        dispatch({ type: 'closed' })
      }
    },
    [createSocket],
  )

  const answer = useCallback((questionId: number, choice: number) => {
    const connection = current.current
    if (!connection) return
    dispatch({ type: 'answer_sent', choice }) // show the choice straight away
    send(connection.socket, { type: 'answer', question_id: questionId, choice })
  }, [])

  /** Leave the game ("Join another game"): close the connection and start over. */
  const leave = useCallback(() => {
    const connection = current.current
    current.current = null // first, so this socket's close event is ignored
    connection?.socket.close(1000)
    dispatch({ type: 'reset' })
  }, [])

  /** Host commands. The server checks they come from the host and rejects them otherwise. */
  const sendCommand = useCallback((message: HostCommand) => {
    const connection = current.current
    if (connection) send(connection.socket, message)
  }, [])
  const start = useCallback(() => sendCommand({ type: 'start' }), [sendCommand])
  const kick = useCallback((name: string) => sendCommand({ type: 'kick', name }), [sendCommand])
  const next = useCallback(() => sendCommand({ type: 'next' }), [sendCommand])

  return { state, join, answer, leave, start, kick, next }
}
