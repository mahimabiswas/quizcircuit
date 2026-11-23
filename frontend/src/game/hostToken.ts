// The host token proves "I am the host of this room". It is kept per room in
// sessionStorage: it survives a page refresh (so the host rejoins as host) but
// stays in this browser tab. Storage can be unavailable (private mode, blocked
// storage), so every access is guarded.

const key = (code: string) => `quizcircuit:host:${code.toUpperCase()}`

export function saveHostToken(code: string, token: string): void {
  try {
    sessionStorage.setItem(key(code), token)
  } catch {
    // Without storage the host just cannot rejoin after a refresh.
  }
}

export function getHostToken(code: string): string | null {
  try {
    return sessionStorage.getItem(key(code))
  } catch {
    return null
  }
}
