// Where the backend lives.
//
// Production (Vercel): VITE_API_URL=https://quizcircuit.onrender.com, set in Vercel's
// environment variables. It is read when the app is built, so redeploy after changing it.
// Dev: leave it unset. Paths stay relative ("/rooms") and Vite forwards them to the backend.

export const API_BASE: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

/** "/rooms" -> "https://quizcircuit.onrender.com/rooms" (or just "/rooms" in dev). */
export function apiUrl(path: string, base: string = API_BASE): string {
  return `${base}${path}`
}
