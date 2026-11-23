// REST calls. Paths are relative: in dev, Vite forwards /rooms to the backend.

import type { CreateRoomRequest, CreateRoomResponse } from './protocol'

export async function createRoom(body: CreateRoomRequest): Promise<CreateRoomResponse> {
  const response = await fetch('/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Could not create the room (HTTP ${response.status})`)
  return response.json()
}
