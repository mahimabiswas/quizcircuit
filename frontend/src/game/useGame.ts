// Owns the WebSocket and feeds what happens on it into gameReducer.

import { useCallback, useEffect, useReducer, useRef } from 'react'
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

  const join = useCallback(
    (code: string, name: string) => {
      dispatch({ type: 'connecting' })

      // After a rejected name the server keeps the socket open: just try again on it.
      const existing = current.current
      if (existing && existing.code === code && existing.socket.readyState === OPEN) {
        send(existing.socket, { type: 'join', name })
        return
      }

      const connection: Connection = { socket: createSocket(socketUrl(code)), code }
      current.current = connection // set first, so the old socket's close is ignored below
      existing?.socket.close(1000)

      const { socket } = connection
      socket.onopen = () => send(socket, { type: 'join', name })
      socket.onmessage = (event) => {
        const message = parseMessage(event.data)
        if (message) dispatch({ type: 'server', message })
      }
      socket.onclose = () => {
        if (current.current !== connection) return // an old socket we replaced
        current.current = null
        dispatch({ type: 'closed' })
      }
    },
    [createSocket],
  )

  return { state, join }
}
