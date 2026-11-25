import { describe, expect, it, afterEach } from 'vitest'
import { authError, hookAuth, validCredentials } from '../src/main/auth'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore, type Store } from '../src/main/store'
import { initMeetings, setUserIdProvider, startMeeting } from '../src/main/meeting'

describe('auth credentials validation', () => {
  it('validates correct email and password length', () => {
    expect(validCredentials('user@company.com', 'password123')).toBe(true)
    expect(validCredentials('ceo@corporate.co.id', 'StrongPassword2026!')).toBe(true)
  })

  it('rejects short passwords', () => {
    expect(validCredentials('user@company.com', '1234567')).toBe(false)
    expect(validCredentials('user@company.com', '')).toBe(false)
  })

  it('rejects invalid email formats', () => {
    expect(validCredentials('invalid-email', 'password123')).toBe(false)
    expect(validCredentials('@company.com', 'password123')).toBe(false)
    expect(validCredentials('user@', 'password123')).toBe(false)
  })
})

describe('auth error message mapping', () => {
  it('maps standard Supabase errors to localization keys', () => {
    expect(authError(new Error('Invalid login credentials'))).toBe('auth-invalid-credentials')
    expect(authError(new Error('User already registered'))).toBe('auth-email-registered')
    expect(authError(new Error('Password should be at least 8 characters'))).toBe('auth-password-policy')
    expect(authError(new Error('Unable to validate email address: invalid format'))).toBe('auth-email-invalid')
    expect(authError(new Error('Email rate limit exceeded'))).toBe('auth-rate-limit')
    expect(authError(new Error('Email not confirmed'))).toBe('auth-email-unconfirmed')
    expect(authError(new Error('Supabase is not configured'))).toBe('auth-not-configured')
    expect(authError(new Error('Random unexpected network issue'))).toBe('auth-generic-error')
  })
})

describe('auth state & guest mode fallback', () => {
  const dirs: string[] = []
  afterEach(() => {
    dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }))
  })

  it('reports unconfigured when SUPABASE_URL is missing and stays in Guest Mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cakapp-auth-'))
    dirs.push(dir)
    const settingsFile = join(dir, 'settings.json')
    const fakeSafeStorage = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'basic_text',
      encryptString: (s: string) => Buffer.from(s),
      decryptString: (b: Buffer) => b.toString(),
    } as any

    const auth = hookAuth({
      file: settingsFile,
      safeStorage: fakeSafeStorage,
      openExternal: async () => {},
      rememberName: () => {},
      rememberProfile: () => {},
    })

    const state = await auth.state()
    // When Supabase is not configured, user is null (Guest Mode active)
    expect(state.user).toBeNull()
  })
})

describe('store & meeting user association', () => {
  const dirs: string[] = []
  const stores: Store[] = []
  function fresh(): Store {
    const d = mkdtempSync(join(tmpdir(), 'cakapp-store-user-'))
    dirs.push(d)
    const s = openStore(join(d, 'Cakapp.db'))
    stores.push(s)
    return s
  }
  afterEach(() => {
    stores.splice(0).forEach((s) => s.close())
    dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }))
  })

  it('associates meeting with userId when user is logged in', () => {
    const store = fresh()
    initMeetings(store)
    setUserIdProvider(() => 'user-uuid-1234')

    const m = startMeeting({ title: 'Executive Board Meeting', app: 'Zoom', event: null })
    expect(m.userId).toBe('user-uuid-1234')

    const fetched = store.meeting(m.id)
    expect(fetched?.userId).toBe('user-uuid-1234')
  })

  it('keeps userId undefined when running in Guest Mode', () => {
    const store = fresh()
    initMeetings(store)
    setUserIdProvider(() => null)

    const m = startMeeting({ title: 'Offline Strategy Session', app: 'Teams', event: null })
    expect(m.userId).toBeUndefined()

    const fetched = store.meeting(m.id)
    expect(fetched?.userId).toBeUndefined()
  })
})
