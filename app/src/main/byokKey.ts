import type { CloudProviderId } from '../engine/providers/types'

/**
 * Isolated session-only BYOK (Bring Your Own Key) store for optional advanced user keys.
 * Kept strictly in main-process memory: never persisted to disk, never mixed with shared Cloud AI config.
 */
const sessionByokKeys = new Map<CloudProviderId, string>()

export function maskApiKey(key: string): string {
  const clean = key.trim()
  if (!clean) return ''
  if (clean.length <= 8) return '••••••••'
  return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`
}

export function sanitizeLog(msg: string): string {
  let out = msg
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, '[REDACTED_ANTHROPIC_KEY]')
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_OPENAI_KEY]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')

  for (const val of sessionByokKeys.values()) {
    if (val.length >= 8 && out.includes(val)) {
      out = out.split(val).join('[REDACTED_BYOK_KEY]')
    }
  }
  return out
}

export function setByokApiKey(provider: CloudProviderId, rawKey: string): void {
  const trimmed = rawKey.trim()
  if (!trimmed || trimmed.length < 8 || trimmed.length > 512 || /[^\x21-\x7E]/.test(trimmed)) {
    sessionByokKeys.delete(provider)
    return
  }
  sessionByokKeys.set(provider, trimmed)
}

export function getByokApiKey(provider: CloudProviderId): string {
  return sessionByokKeys.get(provider) || ''
}

export function clearByokApiKey(provider: CloudProviderId): void {
  sessionByokKeys.delete(provider)
}

export function clearAllByokKeys(): void {
  sessionByokKeys.clear()
}

export function buildByokHeaders(provider: CloudProviderId): Record<string, string> {
  const key = getByokApiKey(provider)
  if (!key) return {}
  return {
    'X-BYOK-Api-Key': key,
    'X-BYOK-Provider': provider,
  }
}

export function getByokPublicStatus(): {
  hasKey: Record<CloudProviderId, boolean>
  maskedKeys: Record<CloudProviderId, string>
} {
  return {
    hasKey: {
      gemini: sessionByokKeys.has('gemini'),
      openai: sessionByokKeys.has('openai'),
      anthropic: sessionByokKeys.has('anthropic'),
    },
    maskedKeys: {
      gemini: maskApiKey(getByokApiKey('gemini')),
      openai: maskApiKey(getByokApiKey('openai')),
      anthropic: maskApiKey(getByokApiKey('anthropic')),
    },
  }
}
