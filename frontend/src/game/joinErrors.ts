import type { JoinErrorCode } from './reducer'

// What to tell the player for each way a join can fail.
const ERROR_TEXT: Partial<Record<JoinErrorCode, string>> = {
  ROOM_NOT_FOUND: 'No game has that code. Check the code on the big screen.',
  NAME_TAKEN: 'Someone in this game already has that name. Try another one.',
  NAME_INVALID: "That name can't be used. Pick a name of 1–20 characters.",
  ROOM_FULL: 'This game is full.',
  GAME_STARTED: 'This game has already started.',
  CONNECTION_FAILED: "Couldn't reach the game. Check your connection and try again.",
  CONNECTION_LOST: 'Lost the connection to the game. Join again to rejoin the lobby.',
}

export function joinErrorText(code: JoinErrorCode): string {
  return ERROR_TEXT[code] ?? 'Something went wrong. Please try again.'
}
