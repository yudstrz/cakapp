import type { ClientAiProviderId } from './chunk-client';

const STORAGE_PREFIX = 'cakapp:byok:';

/**
 * Isolated client-side BYOK helper for the web portal.
 * Uses sessionStorage (tab-scoped, cleared when browser tab closes) rather than localStorage
 * so optional user keys do not linger on shared computers.
 */
export function getWebByokKey(provider: ClientAiProviderId): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${provider}`)?.trim() || '';
  } catch {
    return '';
  }
}

export function setWebByokKey(provider: ClientAiProviderId, key: string): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = key.trim();
    if (!clean) {
      window.sessionStorage.removeItem(`${STORAGE_PREFIX}${provider}`);
    } else {
      window.sessionStorage.setItem(`${STORAGE_PREFIX}${provider}`, clean);
    }
  } catch {
    // Ignore storage quota or private mode restrictions.
  }
}

export function clearWebByokKey(provider: ClientAiProviderId): void {
  setWebByokKey(provider, '');
}

export function buildWebByokHeaders(provider: ClientAiProviderId): Record<string, string> {
  const key = getWebByokKey(provider);
  if (!key) return {};
  return {
    'X-BYOK-Api-Key': key,
    'X-BYOK-Provider': provider,
  };
}
