import { createAuthClient } from 'better-auth/react';
import { electronProxyClient } from '@better-auth/electron/proxy';
import { DESKTOP_SCHEME } from '@/lib/desktop-scheme';

export const authClient = createAuthClient({
  plugins: [electronProxyClient({ protocol: { scheme: DESKTOP_SCHEME } })],
});
