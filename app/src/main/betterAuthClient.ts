import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { app, protocol, safeStorage, type BrowserWindow } from 'electron'
import { createAuthClient } from 'better-auth/client'
import { electronClient, handleDeepLink } from '@better-auth/electron/client'
import { loadAppEnv } from './env'
import { userDataDir } from './paths'

export const DESKTOP_SCHEME = 'com.cakapp.app'

// Register the custom protocol BEFORE app is ready (Electron requirement).
// @better-auth/electron's registerProtocolScheme does this inside whenReady,
// which is too late, so we do it here and pass scheme:false to setupMain.
protocol.registerSchemesAsPrivileged([{ scheme: DESKTOP_SCHEME, privileges: { secure: true, standard: false } }])

let cachedClient: ReturnType<typeof createBetterAuth> | undefined
let cachedStorage: ReturnType<typeof buildSafeBetterAuthStorage> | undefined

function buildSafeBetterAuthStorage() {
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

function createSafeBetterAuthStorage() {
  return (cachedStorage ??= buildSafeBetterAuthStorage())
}

export function getBetterAuthBaseUrl(): string {
  loadAppEnv()
  return (process.env.BETTER_AUTH_URL || process.env.WEB_PORTAL_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

function getElectronOptions() {
  const baseURL = getBetterAuthBaseUrl()
  return {
    signInURL: `${baseURL}/login`,
    protocol: { scheme: DESKTOP_SCHEME },
    storage: createSafeBetterAuthStorage(),
  }
}

function createBetterAuth() {
  const baseURL = getBetterAuthBaseUrl()
  return createAuthClient({
    baseURL,
    plugins: [
      electronClient(getElectronOptions()),
    ],
  })
}

export function getBetterAuthClient() {
  return (cachedClient ??= createBetterAuth())
}

/** Handle a deep-link URL (com.cakapp.app://...) arriving from the OS. */
export function handleAuthDeepLink(url: string, getWindow: () => BrowserWindow | undefined): void {
  if (!url.startsWith(`${DESKTOP_SCHEME}://`)) return
  const client = getBetterAuthClient()
  void handleDeepLink({
    $fetch: client.$fetch as Parameters<typeof handleDeepLink>[0]['$fetch'],
    options: getElectronOptions(),
    url,
    getWindow,
    clientOptions: { baseURL: getBetterAuthBaseUrl() },
  }).catch((err) => {
    console.error('BetterAuth deep link error', err)
  })
}

/** Register the protocol client and wire up OS deep-link delivery.
 *  Pass scheme:false so the library does NOT call registerSchemesAsPrivileged
 *  or requestSingleInstanceLock again (both already done by index.ts). */
export function setupBetterAuthMain(getWindow: () => BrowserWindow | undefined): void {
  if (!app || typeof app.whenReady !== 'function') return
  // Register this app as the handler for com.cakapp.app:// URLs in the OS.
  if (process.defaultApp) {
    if (process.argv.length >= 2 && typeof process.argv[1] === 'string') {
      app.setAsDefaultProtocolClient(DESKTOP_SCHEME, process.execPath, [resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient(DESKTOP_SCHEME)
  }
  const client = getBetterAuthClient()
  // scheme:false prevents the library from calling registerSchemesAsPrivileged
  // (already done above) and requestSingleInstanceLock (done in index.ts).
  client.setupMain({ csp: false, bridges: false, scheme: false, getWindow })
}
