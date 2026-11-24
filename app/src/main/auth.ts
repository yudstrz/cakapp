import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ipcMain, type SafeStorage } from 'electron'

export type AccountUser = { id: string; email: string; name: string }
export type AuthState = { configured: boolean; secureStorage: boolean; user: AccountUser | null }
export type AuthResult = { ok: true; state: AuthState; message?: 'check-email' } | { ok: false; error: string }

const callbackPort = 48217
const callbackUrl = `http://127.0.0.1:${callbackPort}/auth/callback`

function accountUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null): AccountUser | null {
  if (!user) return null
  const name = user.user_metadata?.full_name
  return { id: user.id, email: user.email ?? '', name: typeof name === 'string' ? name : '' }
}

export function authError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('invalid login credentials')) return 'auth-invalid-credentials'
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

export function hookAuth(d: { file: string; safeStorage: SafeStorage; openExternal(url: string): Promise<void>; rememberName(name: string): void; rememberProfile(user: AccountUser | null): void }) {
  const sessionFile = d.file.replace(/settings\.json$/, 'auth-session.bin')
  const getSupabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const getSupabaseAnonKey = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  const configured = () => !!getSupabaseUrl() && !!getSupabaseAnonKey()
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
    if (!configured()) throw new Error('Supabase is not configured')
    if (!secureStorage()) throw new Error('secure storage unavailable')
    return client ??= createClient(getSupabaseUrl()!, getSupabaseAnonKey()!, {
      auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  }
  const state = async (): Promise<AuthState> => {
    const isConfigured = configured(), canStoreSecurely = secureStorage()
    if (!isConfigured || !canStoreSecurely) return { configured: isConfigured, secureStorage: canStoreSecurely, user: null }
    const result = await getClient().auth.getSession().catch(() => ({ data: { session: null } }))
    const user = accountUser(result.data.session?.user ?? null)
    d.rememberProfile(user)
    if (user?.name) d.rememberName(user.name)
    return { configured: true, secureStorage: true, user }
  }
  const failed = (error: unknown): AuthResult => ({ ok: false, error: authError(error) })

  const signUp = async (email: unknown, password: unknown, name: unknown): Promise<AuthResult> => {
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const cleanName = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : ''
    if (!validCredentials(cleanEmail, password) || !cleanName || cleanName.length > 80) return { ok: false, error: 'auth-invalid-input' }
    try {
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
      const { error } = await getClient().auth.signInWithPassword({ email: cleanEmail, password: password as string })
      if (error) throw error
      const next = await state()
      if (next.user?.name) d.rememberName(next.user.name)
      return { ok: true, state: next }
    } catch (error) { return failed(error) }
  }

  const signInWithGoogle = async (): Promise<AuthResult> => {
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
      const supabase = getClient()
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      return { ok: true, state: await state() }
    } catch (error) { return failed(error) }
  }

  ipcMain?.handle?.('auth:state', state)
  ipcMain?.handle?.('auth:sign-up', (_event, email: unknown, password: unknown, name: unknown) => signUp(email, password, name))
  ipcMain?.handle?.('auth:sign-in', (_event, email: unknown, password: unknown) => signIn(email, password))
  ipcMain?.handle?.('auth:google', signInWithGoogle)
  ipcMain?.handle?.('auth:sign-out', signOut)

  return {
    state,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
  }
}
