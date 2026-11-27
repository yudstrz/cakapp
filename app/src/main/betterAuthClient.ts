import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { app, protocol, safeStorage, type BrowserWindow } from 'electron'
import { createAuthClient } from 'better-auth/client'
import { electronClient, handleDeepLink } from '@better-auth/electron/client'
import { loadAppEnv } from './env'
import { userDataDir } from './paths'
import { DESKTOP_SCHEME, findAuthDeepLink, normalizeAuthDeepLink } from './authDeepLink'

export { DESKTOP_SCHEME, findAuthDeepLink, normalizeAuthDeepLink }

// Register the custom protocol BEFORE app is ready (Electron requirement).
// @better-auth/electron's registerProtocolScheme does this inside whenReady,
// which is too late, so we do it here and pass scheme:false to setupMain.
protocol?.registerSchemesAsPrivileged?.([{ scheme: DESKTOP_SCHEME, privileges: { secure: true, standard: false } }])

let cachedClient: ReturnType<typeof createBetterAuth> | undefined
let cachedStorage: ReturnType<typeof buildSafeBetterAuthStorage> | undefined

function buildSafeBetterAuthStorage() {
  const file = join(userDataDir(), 'better-auth.bin')
  let store: Record<string, unknown> | undefined
  const ensureLoaded = (): Record<string, unknown> => {
    if (store) return store
    store = {}
    if (existsSync(file) && safeStorage?.isEncryptionAvailable?.()) {
      try {
        store = JSON.parse(safeStorage.decryptString(readFileSync(file))) as Record<string, unknown>
      } catch {
        store = {}
      }
    }
    return store
  }
  const flush = () => {
    if (!store || !safeStorage?.isEncryptionAvailable?.()) return
    try {
      const dir = dirname(file)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(file, safeStorage.encryptString(JSON.stringify(store)), { mode: 0o600 })
    } catch { /* ignore */ }
  }
  return {
    getItem: (name: string) => ensureLoaded()[name] ?? null,
    setItem: (name: string, value: unknown) => {
      ensureLoaded()[name] = value
      flush()
    },
  }
}

function createSafeBetterAuthStorage() {
  return (cachedStorage ??= buildSafeBetterAuthStorage())
}

export const DEFAULT_PRODUCTION_URL = 'https://cakapp.vercel.app'

export function getBetterAuthBaseUrl(): string {
  loadAppEnv()
  const fallback = app?.isPackaged ? DEFAULT_PRODUCTION_URL : 'http://localhost:3000'
  return (process.env.BETTER_AUTH_URL || process.env.WEB_PORTAL_URL || fallback).replace(/\/+$/, '')
}

function getElectronOptions() {
  const baseURL = getBetterAuthBaseUrl()
  return {
    signInURL: `${baseURL}/login`,
    protocol: { scheme: DESKTOP_SCHEME },
    storage: createSafeBetterAuthStorage(),
    userImageProxy: { enabled: false },
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

const deepLinkListeners = new Set<(err?: unknown) => void>()

export function onAuthDeepLink(cb: (err?: unknown) => void): () => void {
  deepLinkListeners.add(cb)
  return () => { deepLinkListeners.delete(cb) }
}

/** Handle a deep-link URL (com.cakapp.app://...) arriving from the OS. */
export function handleAuthDeepLink(rawUrl: string, getWindow: () => BrowserWindow | undefined): void {
  const url = normalizeAuthDeepLink(rawUrl)
  if (!url) return
  const w = getWindow()
  if (w && !w.isDestroyed()) {
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
  }
  const client = getBetterAuthClient()
  void handleDeepLink({
    $fetch: client.$fetch as Parameters<typeof handleDeepLink>[0]['$fetch'],
    options: getElectronOptions(),
    url,
    getWindow,
    clientOptions: { baseURL: getBetterAuthBaseUrl() },
  }).then(() => {
    for (const cb of deepLinkListeners) cb()
  }).catch((err) => {
    console.error('BetterAuth deep link error', err)
    for (const cb of deepLinkListeners) cb(err)
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
  try {
    client.setupMain({ csp: false, bridges: false, scheme: false, getWindow })
  } catch (err) {
    console.error('BetterAuth setupMain error', err)
  }
}
