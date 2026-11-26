import type { AiProviderId } from './providers/types';

if (typeof window !== 'undefined') {
  throw new Error('lib/ai/keys is server-only and cannot be imported in client code.');
}

const HEADER_BYOK_KEY = 'x-byok-api-key';
const HEADER_BYOK_PROVIDER = 'x-byok-provider';

export function getServerApiKey(provider: AiProviderId): string {
  switch (provider) {
    case 'gemini':
      return process.env.GEMINI_API_KEY?.trim() || '';
    case 'openai':
      return process.env.OPENAI_API_KEY?.trim() || '';
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY?.trim() || '';
  }
}

export function hasServerApiKey(provider: AiProviderId): boolean {
  return getServerApiKey(provider).length > 0;
}

export function parseProviderHeader(raw: string | null | undefined): AiProviderId | undefined {
  const clean = raw?.trim();
  if (clean === 'gemini' || clean === 'openai' || clean === 'anthropic') {
    return clean;
  }
  return undefined;
}

export function extractByokHeader(headers: Headers): { apiKey: string; provider?: AiProviderId } | null {
  const rawKey = headers.get(HEADER_BYOK_KEY)?.trim() || '';
  if (!rawKey) return null;
  if (rawKey.length < 8 || rawKey.length > 512 || /[^\x21-\x7E]/.test(rawKey)) {
    return null;
  }
  return {
    apiKey: rawKey,
    provider: parseProviderHeader(headers.get(HEADER_BYOK_PROVIDER)),
  };
}

/**
 * Resolve the API key for a provider from an optional per-request BYOK header
 * or the shared Vercel server environment variable. Never logs or persists keys.
 */
export function resolveProviderApiKey(
  provider: AiProviderId,
  headers: Headers,
): { apiKey: string; isByok: boolean } {
  const byok = extractByokHeader(headers);
  if (byok && (!byok.provider || byok.provider === provider)) {
    return { apiKey: byok.apiKey, isByok: true };
  }
  return { apiKey: getServerApiKey(provider), isByok: false };
}

export function redactSecrets(input: string): string {
  let out = input
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');

  for (const p of ['gemini', 'openai', 'anthropic'] as const) {
    const serverKey = getServerApiKey(p);
    if (serverKey.length >= 8 && out.includes(serverKey)) {
      out = out.split(serverKey).join('[REDACTED]');
    }
  }
  return out.slice(0, 300);
}
