import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { app, ipcMain, type SafeStorage } from 'electron'
import { loadAppEnv } from './env'
import { getNeonClient, isNeonConfigured } from './neon'
import { clearAllByokKeys } from './byokKey'

const loadBetterAuth = () => import('./betterAuthClient')

export type AccountUser = { id: string; email: string; name: string }
export type AuthState = { configured: boolean; secureStorage: boolean; user: AccountUser | null; google?: boolean; webPortalUrl?: string }
export type AuthResult = { ok: true; state: AuthState; message?: 'check-email' | 'browser-opened' } | { ok: false; error: string }

const callbackPort = 48217
const callbackUrl = `http://127.0.0.1:${callbackPort}/auth/callback`
const NEON_SESSION_KEY = 'neon_session'

function accountUser(user: { id: string; email?: string; name?: string; user_metadata?: Record<string, unknown> } | null): AccountUser | null {
  if (!user) return null
  const name = user.name ?? user.user_metadata?.full_name
  return { id: user.id, email: user.email ?? '', name: typeof name === 'string' ? name : '' }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, key] = stored.split(':')
    if (!salt || !key) return false
    const hash = scryptSync(password, salt, 64)
    const keyBuf = Buffer.from(key, 'hex')
    return hash.length === keyBuf.length && timingSafeEqual(hash, keyBuf)
  } catch {
    return false
  }
}

async function ensureNeonAuthSchema(): Promise<void> {
  const sql = getNeonClient()
  await sql`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT`
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `
}

export function authError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('invalid login credentials') || message.includes('invalid email or password')) return 'auth-invalid-credentials'
  if (message.includes('already registered') || message.includes('already exists')) return 'auth-email-registered'
  if (message.includes('password') && (message.includes('length') || message.includes('weak') || message.includes('least') || message.includes('character') || message.includes('short'))) return 'auth-password-policy'
  if (message.includes('email') && message.includes('valid')) return 'auth-email-invalid'
  if (message.includes('rate limit') || message.includes('too many requests')) return 'auth-rate-limit'
  if (message.includes('email not confirmed')) return 'auth-email-unconfirmed'
  if (message.includes('secure storage')) return 'auth-secure-storage-unavailable'
  if (message.includes('not configured')) return 'auth-not-configured'
  if (message.includes('callback') || message.includes('eaddrinuse')) return 'auth-oauth-callback-failed'
  return 'auth-generic-error'
}

export function validCredentials(email: unknown, password: unknown): boolean {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    typeof password === 'string' && password.length >= 8 && password.length <= 128
}

export function hookAuth(d: {
  file: string
  safeStorage: SafeStorage
  openExternal(url: string): Promise<void>
  rememberName(name: string): void
  rememberProfile(user: AccountUser | null): void
  onChange?: (state: AuthState) => void
}) {
  loadAppEnv()
  const sessionFile = d.file.replace(/settings\.json$/, 'auth-session.bin')
  const getSupabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const getSupabaseAnonKey = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  const hasSupabase = () => !!getSupabaseUrl() && !!getSupabaseAnonKey()
  const defaultPortalUrl = () => (app?.isPackaged ? 'https://cakapp.vercel.app' : 'http://localhost:3000')
  const hasBetterAuth = () => Boolean(process.env.BETTER_AUTH_URL || process.env.WEB_PORTAL_URL || app?.isPackaged)
  const hasNeon = () => isNeonConfigured()
  const configured = () => hasBetterAuth() || hasNeon() || hasSupabase()
  const secureStorage = () => d.safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || d.safeStorage.getSelectedStorageBackend() !== 'basic_text')
  let client: SupabaseClient | undefined

  const storage = {
    getItem: async (key: string) => {
      if (!existsSync(sessionFile)) return null
      try {
        const stored = JSON.parse(d.safeStorage.decryptString(readFileSync(sessionFile))) as Record<string, string>
        return stored[key] ?? null
      } catch { return null }
    },
    setItem: async (key: string, value: string) => {
      if (!secureStorage()) throw new Error('secure storage unavailable')
      const stored: Record<string, string> = existsSync(sessionFile)
        ? JSON.parse(d.safeStorage.decryptString(readFileSync(sessionFile)))
        : {}
      stored[key] = value
      writeFileSync(sessionFile, d.safeStorage.encryptString(JSON.stringify(stored)), { mode: 0o600 })
    },
    removeItem: async (key: string) => {
      if (!existsSync(sessionFile)) return
      let stored: Record<string, string>
      try { stored = JSON.parse(d.safeStorage.decryptString(readFileSync(sessionFile))) }
      catch { unlinkSync(sessionFile); return }
      delete stored[key]
      if (Object.keys(stored).length) writeFileSync(sessionFile, d.safeStorage.encryptString(JSON.stringify(stored)), { mode: 0o600 })
      else unlinkSync(sessionFile)
    },
  }
  const getClient = () => {
    if (!hasSupabase()) throw new Error('Supabase is not configured')
    if (!secureStorage()) throw new Error('secure storage unavailable')
    return client ??= createClient(getSupabaseUrl()!, getSupabaseAnonKey()!, {
      auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  }

  const state = async (): Promise<AuthState> => {
    const isConfigured = configured(), canStoreSecurely = secureStorage()
    const webPortalUrl = (process.env.BETTER_AUTH_URL || process.env.WEB_PORTAL_URL || defaultPortalUrl()).replace(/\/+$/, '')
    const google = hasSupabase() || hasBetterAuth()
    if (!isConfigured || !canStoreSecurely) return { configured: isConfigured, secureStorage: canStoreSecurely, user: null, google, webPortalUrl }

    // 1. Check Better Auth session (handles both web browser deep-link login and email/password)
    if (hasBetterAuth()) {
      try {
        const { getBetterAuthClient } = await loadBetterAuth()
        const res = await getBetterAuthClient().getSession()
        if (res?.data?.user) {
          const user = accountUser(res.data.user)
          d.rememberProfile(user)
          if (user?.name) d.rememberName(user.name)
          return { configured: true, secureStorage: true, user, google: true, webPortalUrl }
        }
      } catch {
        // Fallback to cached Neon session if offline or server unreachable
      }
    }

    // 2. Check direct Neon session fallback
    if (hasNeon()) {
      const raw = await storage.getItem(NEON_SESSION_KEY)
      if (!raw) {
        d.rememberProfile(null)
        return { configured: true, secureStorage: true, user: null, google, webPortalUrl }
      }
      try {
        const parsed = JSON.parse(raw) as { token: string; user: AccountUser }
        let user: AccountUser | null = parsed.user ?? null
        if (parsed.token) {
          try {
            const sql = getNeonClient()
            const rows = await sql`
              SELECT p.id, p.email, p.full_name
              FROM sessions s
              JOIN profiles p ON p.id = s.user_id
              WHERE s.token = ${parsed.token} AND s.expires_at > now()
              LIMIT 1
            ` as Array<{ id: string; email: string; full_name: string }>
            if (rows.length > 0) {
              user = { id: rows[0].id, email: rows[0].email, name: rows[0].full_name }
            } else {
              await storage.removeItem(NEON_SESSION_KEY)
              user = null
            }
          } catch {
            // Keep cached user if offline
          }
        }
        d.rememberProfile(user)
        if (user?.name) d.rememberName(user.name)
        return { configured: true, secureStorage: true, user, google, webPortalUrl }
      } catch {
        d.rememberProfile(null)
        return { configured: true, secureStorage: true, user: null, google, webPortalUrl }
      }
    }

    const result = await getClient().auth.getSession().catch(() => ({ data: { session: null } }))
    const user = accountUser(result.data.session?.user ?? null)
    d.rememberProfile(user)
    if (user?.name) d.rememberName(user.name)
    return { configured: true, secureStorage: true, user, google: true, webPortalUrl }
  }
  const failed = (error: unknown): AuthResult => ({ ok: false, error: authError(error) })

  if (d.onChange && hasBetterAuth()) {
    void loadBetterAuth().then(({ getBetterAuthClient, onAuthDeepLink }) => {
      const notify = () => { void state().then(st => d.onChange?.(st)).catch(() => {}) }
      onAuthDeepLink(() => { notify() })
      const ba = getBetterAuthClient()
      ba.$store?.listen?.('$sessionSignal', notify)
    }).catch(() => {})
  }

  const signUp = async (email: unknown, password: unknown, name: unknown): Promise<AuthResult> => {
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const cleanName = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : ''
    if (!validCredentials(cleanEmail, password) || !cleanName || cleanName.length > 80) return { ok: false, error: 'auth-invalid-input' }
    try {
      if (hasBetterAuth()) {
        try {
          const { getBetterAuthClient } = await loadBetterAuth()
          const res = await getBetterAuthClient().signUp.email({ email: cleanEmail, password: password as string, name: cleanName })
          if (res.error) throw new Error(res.error.message || 'Sign-up failed')
          const next = await state()
          if (next.user?.name) d.rememberName(next.user.name)
          d.onChange?.(next)
          return { ok: true, state: next }
        } catch (err) {
          if (!hasNeon() || err instanceof Error && /already|password|email/i.test(err.message)) throw err
        }
      }

      if (hasNeon()) {
        if (!secureStorage()) throw new Error('secure storage unavailable')
        await ensureNeonAuthSchema()
        const sql = getNeonClient()
        const existing = await sql`SELECT id FROM profiles WHERE email = ${cleanEmail} LIMIT 1`
        if (existing.length > 0) throw new Error('User already registered')

        const userId = randomUUID()
        const passwordHash = hashPassword(password as string)
        await sql`
          INSERT INTO profiles (id, email, full_name, password_hash)
          VALUES (${userId}, ${cleanEmail}, ${cleanName}, ${passwordHash})
        `
        const token = randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        await sql`
          INSERT INTO sessions (token, user_id, expires_at)
          VALUES (${token}, ${userId}, ${expiresAt.toISOString()})
        `
        const user: AccountUser = { id: userId, email: cleanEmail, name: cleanName }
        await storage.setItem(NEON_SESSION_KEY, JSON.stringify({ token, user }))
        const next = await state()
        if (next.user?.name) d.rememberName(next.user.name)
        d.onChange?.(next)
        return { ok: true, state: next }
      }

      const { data, error } = await getClient().auth.signUp({ email: cleanEmail, password: password as string, options: { data: { full_name: cleanName } } })
      if (error) throw error
      const next = await state()
      if (next.user?.name) d.rememberName(next.user.name)
      return { ok: true, state: next, ...(!data.session ? { message: 'check-email' as const } : {}) }
    } catch (error) { return failed(error) }
  }

  const signIn = async (email: unknown, password: unknown): Promise<AuthResult> => {
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!validCredentials(cleanEmail, password)) return { ok: false, error: 'auth-invalid-input' }
    try {
      if (hasBetterAuth()) {
        try {
          const { getBetterAuthClient } = await loadBetterAuth()
          const res = await getBetterAuthClient().signIn.email({ email: cleanEmail, password: password as string })
          if (res.error) throw new Error(res.error.message || 'Invalid login credentials')
          const next = await state()
          if (next.user?.name) d.rememberName(next.user.name)
          d.onChange?.(next)
          return { ok: true, state: next }
        } catch (err) {
          if (!hasNeon() || err instanceof Error && /invalid|credentials|password/i.test(err.message)) throw err
        }
      }

      if (hasNeon()) {
        if (!secureStorage()) throw new Error('secure storage unavailable')
        await ensureNeonAuthSchema()
        const sql = getNeonClient()
        const rows = await sql`
          SELECT id, email, full_name, password_hash
          FROM profiles
          WHERE email = ${cleanEmail}
          LIMIT 1
        ` as Array<{ id: string; email: string; full_name: string; password_hash: string | null }>

        const profile = rows[0]
        if (!profile || !profile.password_hash || !verifyPassword(password as string, profile.password_hash)) {
          throw new Error('Invalid login credentials')
        }
        const token = randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        await sql`
          INSERT INTO sessions (token, user_id, expires_at)
          VALUES (${token}, ${profile.id}, ${expiresAt.toISOString()})
        `
        const user: AccountUser = { id: profile.id, email: profile.email, name: profile.full_name }
        await storage.setItem(NEON_SESSION_KEY, JSON.stringify({ token, user }))
        const next = await state()
        if (next.user?.name) d.rememberName(next.user.name)
        d.onChange?.(next)
        return { ok: true, state: next }
      }

      const { error } = await getClient().auth.signInWithPassword({ email: cleanEmail, password: password as string })
      if (error) throw error
      const next = await state()
      if (next.user?.name) d.rememberName(next.user.name)
      return { ok: true, state: next }
    } catch (error) { return failed(error) }
  }

  const signInWithBrowser = async (provider?: 'google'): Promise<AuthResult> => {
    try {
      if (hasBetterAuth()) {
        const { getBetterAuthClient } = await loadBetterAuth()
        await getBetterAuthClient().requestAuth(provider ? { provider } : undefined)
        return { ok: true, state: await state(), message: 'browser-opened' }
      }
      if (provider === 'google' && hasSupabase()) return signInWithSupabaseGoogle()
      return { ok: false, error: 'auth-not-configured' }
    } catch (error) {
      return failed(error)
    }
  }

  const signInWithSupabaseGoogle = async (): Promise<AuthResult> => {
    let server: ReturnType<typeof createServer> | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const supabase = getClient()
      let resolveCode!: (value: string) => void
      let rejectCode!: (reason: Error) => void
      const codePromise = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject })
      const listener = createServer((request, response) => {
        const url = new URL(request.url ?? '/', callbackUrl)
        if (request.method !== 'GET' || url.pathname !== '/auth/callback') {
          response.writeHead(404).end()
          return
        }
        const code = url.searchParams.get('code')
        response.writeHead(code ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' })
        response.end(code ? '<!doctype html><title>Cakapp</title><p>Login complete. You can return to Cakapp.</p>' : '<!doctype html><title>Cakapp</title><p>Login failed. Return to Cakapp and try again.</p>')
        if (code) resolveCode(code)
        else rejectCode(new Error('OAuth callback failed'))
      })
      server = listener
      await new Promise<void>((resolve, reject) => {
        listener.once('error', reject)
        listener.listen(callbackPort, '127.0.0.1', resolve)
      })
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl, skipBrowserRedirect: true } })
      if (error || !data.url) throw error ?? new Error('OAuth callback failed')
      await d.openExternal(data.url)
      timeout = setTimeout(() => rejectCode(new Error('OAuth callback failed')), 180_000)
      const code = await codePromise
      const exchanged = await supabase.auth.exchangeCodeForSession(code)
      if (exchanged.error) throw exchanged.error
      const next = await state()
      if (next.user?.name) d.rememberName(next.user.name)
      return { ok: true, state: next }
    } catch (error) { return failed(error) }
    finally { if (timeout) clearTimeout(timeout); server?.close() }
  }

  const signOut = async (): Promise<AuthResult> => {
    try {
      clearAllByokKeys()
      if (hasBetterAuth()) {
        const { getBetterAuthClient } = await loadBetterAuth()
        await getBetterAuthClient().signOut().catch(() => {})
      }
      if (hasNeon()) {
        const raw = await storage.getItem(NEON_SESSION_KEY)
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { token?: string }
            if (parsed.token) await getNeonClient()`DELETE FROM sessions WHERE token = ${parsed.token}`.catch(() => {})
          } catch { /* ignore */ }
        }
        await storage.removeItem(NEON_SESSION_KEY)
      }
      if (!hasBetterAuth() && !hasNeon() && hasSupabase()) {
        const supabase = getClient()
        const { error } = await supabase.auth.signOut({ scope: 'local' })
        if (error) throw error
      }
      const next = await state()
      d.onChange?.(next)
      return { ok: true, state: next }
    } catch (error) { return failed(error) }
  }

  ipcMain?.handle?.('auth:state', state)
  ipcMain?.handle?.('auth:sign-up', (_event, email: unknown, password: unknown, name: unknown) => signUp(email, password, name))
  ipcMain?.handle?.('auth:sign-in', (_event, email: unknown, password: unknown) => signIn(email, password))
  ipcMain?.handle?.('auth:google', () => signInWithBrowser('google'))
  ipcMain?.handle?.('auth:browser', () => signInWithBrowser())
  ipcMain?.handle?.('auth:sign-out', signOut)

  return {
    state,
    signUp,
    signIn,
    signInWithGoogle: () => signInWithBrowser('google'),
    signInWithBrowser,
    signOut,
  }
}
