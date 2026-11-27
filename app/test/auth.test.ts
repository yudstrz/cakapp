import { describe, expect, it, afterEach, vi } from 'vitest'
import { authError, hookAuth, validCredentials } from '../src/main/auth'
import { findAuthDeepLink, normalizeAuthDeepLink } from '../src/main/authDeepLink'
import { clearAllByokKeys, getByokApiKey, getByokPublicStatus, setByokApiKey } from '../src/main/byokKey'
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

  it('clears in-memory BYOK API keys immediately on signOut', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cakapp-auth-signout-'))
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

    setByokApiKey('openai', 'sk-proj-test1234567890abcdef')
    setByokApiKey('gemini', 'AIzaSyTest12345678901234567890')
    expect(getByokPublicStatus().hasKey.openai).toBe(true)
    expect(getByokPublicStatus().hasKey.gemini).toBe(true)

    try {
      const res = await auth.signOut()
      expect(res.ok).toBe(true)
      expect(getByokApiKey('openai')).toBe('')
      expect(getByokApiKey('gemini')).toBe('')
      expect(getByokPublicStatus().hasKey).toEqual({
        gemini: false,
        openai: false,
        anthropic: false,
      })
    } finally {
      clearAllByokKeys()
    }
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

describe('desktop deep-link URL normalization', () => {
  it('accepts quoted, uppercase, and single-slash com.cakapp.app deep links', () => {
    expect(normalizeAuthDeepLink('"COM.CAKAPP.APP:/auth/callback#token=abc"')).toBe('com.cakapp.app://auth/callback#token=abc')
    expect(normalizeAuthDeepLink('com.cakapp.app://auth/callback#token=xyz')).toBe('com.cakapp.app://auth/callback#token=xyz')
    expect(normalizeAuthDeepLink('https://cakapp.vercel.app')).toBeNull()
    expect(findAuthDeepLink(['Cakapp.exe', '--allow-file-access', 'com.cakapp.app:/auth/callback#token=tok1'])).toBe('com.cakapp.app://auth/callback#token=tok1')
  })

  it('disables userImageProxy and never calls protocol.registerSchemesAsPrivileged after app is ready', async () => {
    vi.resetModules()
    const registerSchemesAsPrivileged = vi.fn()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let capturedOptions: { userImageProxy?: { enabled?: boolean } } | undefined
    const setupMain = vi.fn(() => {
      if (capturedOptions?.userImageProxy?.enabled !== false) {
        registerSchemesAsPrivileged()
      }
    })
    const mockElectron = {
      app: {
        isPackaged: true,
        whenReady: vi.fn(async () => {}),
        setAsDefaultProtocolClient: vi.fn(() => true),
        getPath: vi.fn(() => tmpdir()),
      },
      protocol: { registerSchemesAsPrivileged },
      safeStorage: { isEncryptionAvailable: () => false },
    }
    vi.doMock('electron', () => ({ ...mockElectron, default: mockElectron }))
    vi.doMock('@better-auth/electron/client', () => ({
      electronClient: (opts: { userImageProxy?: { enabled?: boolean } }) => {
        capturedOptions = opts
        return {
          id: 'electron',
          getActions: () => ({
            setupMain,
            getCookie: () => '',
            requestAuth: vi.fn(),
            authenticate: vi.fn(),
          }),
        }
      },
      handleDeepLink: vi.fn(),
    }))
    try {
      const mod = await import('../src/main/betterAuthClient')
      expect(registerSchemesAsPrivileged).toHaveBeenCalledTimes(1)
      registerSchemesAsPrivileged.mockImplementation(() => {
        throw new Error('protocol.registerSchemesAsPrivileged should be called before app is ready')
      })
      expect(() => mod.setupBetterAuthMain(() => undefined)).not.toThrow()
      expect(capturedOptions?.userImageProxy).toEqual({ enabled: false })
      expect(setupMain).toHaveBeenCalledWith(expect.objectContaining({ csp: false, bridges: false, scheme: false }))
      expect(errorSpy).not.toHaveBeenCalled()
      expect(registerSchemesAsPrivileged).toHaveBeenCalledTimes(1)
    } finally {
      errorSpy.mockRestore()
      vi.doUnmock('@better-auth/electron/client')
      vi.doUnmock('electron')
      vi.resetModules()
    }
  })
})
