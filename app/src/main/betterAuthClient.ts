import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage, type BrowserWindow } from 'electron'
import { createAuthClient } from 'better-auth/client'
import { electronClient } from '@better-auth/electron/client'
import { loadAppEnv } from './env'
import { userDataDir } from './paths'

export const DESKTOP_SCHEME = 'com.cakapp.app'

let cachedClient: ReturnType<typeof createBetterAuth> | undefined

function createSafeBetterAuthStorage() {
  const file = join(userDataDir(), 'better-auth.bin')
  let store: Record<string, unknown> = {}
  if (existsSync(file) && safeStorage?.isEncryptionAvailable?.()) {
    try {
      store = JSON.parse(safeStorage.decryptString(readFileSync(file))) as Record<string, unknown>
    } catch {
      store = {}
    }
  }
  const flush = () => {
    if (!safeStorage?.isEncryptionAvailable?.()) return
    try {
      const dir = dirname(file)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(file, safeStorage.encryptString(JSON.stringify(store)), { mode: 0o600 })
    } catch { /* ignore */ }
  }
  return {
    getItem: (name: string) => store[name] ?? null,
    setItem: (name: string, value: unknown) => {
      store[name] = value
      flush()
    },
  }
}

export function getBetterAuthBaseUrl(): string {
  loadAppEnv()
  return (process.env.BETTER_AUTH_URL || process.env.WEB_PORTAL_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

function createBetterAuth() {
  const baseURL = getBetterAuthBaseUrl()
  return createAuthClient({
    baseURL,
    plugins: [
      electronClient({
        signInURL: `${baseURL}/login`,
        protocol: { scheme: DESKTOP_SCHEME },
        storage: createSafeBetterAuthStorage(),
      }),
    ],
  })
}

export function getBetterAuthClient() {
  return (cachedClient ??= createBetterAuth())
}

export function setupBetterAuthMain(getWindow: () => BrowserWindow | undefined): void {
  if (!app || typeof app.whenReady !== 'function') return
  const client = getBetterAuthClient()
  client.setupMain({ csp: false, bridges: false, getWindow })
}
