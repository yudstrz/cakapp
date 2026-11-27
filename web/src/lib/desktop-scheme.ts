/** Deep link scheme the desktop app registers (app/electron-builder.yml `protocols`) */
export const DESKTOP_SCHEME = 'com.cakapp.app';

export const ELECTRON_COOKIE_NAMES = ['better-auth.electron', '__Secure-better-auth.electron'] as const;

export function buildDesktopCallbackUrl(token: string, scheme = DESKTOP_SCHEME): string {
  return `${scheme}://auth/callback#token=${encodeURIComponent(token)}`;
}

export function readElectronAuthCookie(cookieHeader = typeof document !== 'undefined' ? document.cookie : ''): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    if ((ELECTRON_COOKIE_NAMES as readonly string[]).includes(name)) {
      const raw = part.slice(idx + 1).trim();
      try {
        return raw ? decodeURIComponent(raw) : null;
      } catch {
        return raw || null;
      }
    }
  }
  return null;
}

export function popElectronAuthCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const code = readElectronAuthCookie(document.cookie);
  if (!code) return null;
  for (const name of ELECTRON_COOKIE_NAMES) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; Secure`;
  }
  return code;
}

export function extractElectronQuery(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const next: Record<string, string> = {};
  for (const key of ['client_id', 'state', 'code_challenge']) {
    const val = params.get(key);
    if (val) next[key] = val;
  }
  return next;
}
