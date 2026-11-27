export const DESKTOP_SCHEME = 'com.cakapp.app'

/** Normalize OS deep-link variants (e.g. single-slash or quoted Windows argv) to `com.cakapp.app://...`. */
export function normalizeAuthDeepLink(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '')
  const lower = trimmed.toLowerCase()
  const prefix = `${DESKTOP_SCHEME}:`
  if (!lower.startsWith(prefix)) return null
  const rest = trimmed.slice(prefix.length)
  if (rest.startsWith('//')) return `${DESKTOP_SCHEME}:${rest}`
  if (rest.startsWith('/')) return `${DESKTOP_SCHEME}://${rest.replace(/^\/+/, '')}`
  return `${DESKTOP_SCHEME}://${rest}`
}

export function findAuthDeepLink(argv: readonly string[]): string | undefined {
  for (const arg of argv) {
    const normalized = normalizeAuthDeepLink(arg)
    if (normalized) return normalized
  }
  return undefined
}
