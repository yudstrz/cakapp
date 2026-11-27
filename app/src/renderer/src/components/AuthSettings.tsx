import { useEffect, useState, type FormEvent } from 'react'
import type { AuthState } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { Check, Globe, Lock } from './Icons'

export function AuthSettings({ onDone, compact }: { onDone?: () => void; compact?: boolean } = {}) {
  const [state, setState] = useState<AuthState>()
  const [register, setRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let loggedIn = false
    const syncState = (notifyDoneOnLogin: boolean) => {
      void window.yogurt.auth.state().then(value => {
        if (!active) return
        const justSignedIn = !loggedIn && !!value.user
        loggedIn = !!value.user
        setState(value)
        window.dispatchEvent(new CustomEvent('cakapp:auth-changed', { detail: value }))
        if (notifyDoneOnLogin && justSignedIn) onDone?.()
      }).catch(() => {})
    }
    syncState(false)
    const off = window.yogurt.auth.onChanged(next => {
      if (!active) return
      loggedIn = !!next.user
      setState(next)
      setMessage('')
      setError('')
      window.dispatchEvent(new CustomEvent('cakapp:auth-changed', { detail: next }))
      if (next.user) onDone?.()
    })
    const onFocus = () => { if (!loggedIn) syncState(true) }
    window.addEventListener('focus', onFocus)
    return () => { active = false; off(); window.removeEventListener('focus', onFocus) }
  }, [onDone])

  const finish = (result: Awaited<ReturnType<typeof window.yogurt.auth.signIn>>) => {
    setError('')
    if (!result.ok) { setMessage(''); setError(t(result.error)); return }
    setState(result.state)
    window.dispatchEvent(new CustomEvent('cakapp:auth-changed', { detail: result.state }))
    setPassword('')
    setMessage(
      result.message === 'check-email'
        ? t('auth-check-email')
        : result.message === 'browser-opened'
          ? 'Browser dibuka. Selesaikan login di browser, lalu klik Buka Cakapp Desktop jika belum kembali otomatis.'
          : ''
    )
    if (result.state.user) onDone?.()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      finish(register
        ? await window.yogurt.auth.signUp(email, password, name)
        : await window.yogurt.auth.signIn(email, password))
    } catch {
      setError(t('auth-generic-error'))
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { finish(await window.yogurt.auth.signInWithGoogle()) }
    catch { setError(t('auth-generic-error')) }
    finally { setBusy(false) }
  }

  const browser = async () => {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { finish(await window.yogurt.auth.signInWithBrowser()) }
    catch { setError(t('auth-generic-error')) }
    finally { setBusy(false) }
  }

  const signOut = async () => {
    setBusy(true); setError(''); setMessage('')
    try { finish(await window.yogurt.auth.signOut()) }
    catch { setError(t('auth-generic-error')) }
    finally { setBusy(false) }
  }

  const confirmGuest = () => {
    setError('')
    setMessage(t('auth-guest-confirmed'))
    onDone?.()
  }

  return (
    <section aria-labelledby="account-heading" className="auth-settings">
      {!compact && <h2 id="account-heading" className="settings-section-heading">{t('auth-account')}</h2>}
      <div className="settings-group auth-settings-body">
        {/* Status Mode Card */}
        {!state ? (
          <p role="status" className="settings-description">{t('Loading…')}</p>
        ) : state.user ? (
          <div className="auth-status-card auth-cloud-active">
            <div className="auth-badge cloud">
              <Globe size={13} aria-hidden="true" />
              <span>{t('auth-mode-cloud')}</span>
            </div>
            <div className="auth-account-row">
              <div className="min-w-0">
                <p className="settings-label">{state.user.name || state.user.email}</p>
                <p className="settings-description">{state.user.email}</p>
              </div>
              <button
                type="button"
                className="workspace-button"
                disabled={busy}
                onClick={() => void signOut()}
              >
                {busy ? t('auth-working') : t('auth-sign-out')}
              </button>
            </div>
          </div>
        ) : (
          <div className="auth-status-card auth-guest-active">
            <div className="auth-badge guest">
              <Lock size={13} aria-hidden="true" />
              <span>{t('auth-mode-guest')}</span>
            </div>
            <p className="settings-description">{t('auth-guest-active-desc')}</p>
            <div className="auth-guest-actions">
              <button
                type="button"
                className="workspace-button"
                onClick={confirmGuest}
              >
                <Check size={14} aria-hidden="true" />
                <span>{t('auth-guest-btn')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Form Connect Cloud if not logged in */}
        {state && !state.user && (
          <div className="auth-connect-section">
            <div className="auth-divider">
              <span>{t('auth-or-cloud')}</span>
            </div>

            {(!state.configured || !state.secureStorage) && (
              <p role="status" className="settings-description auth-warning">
                {t(!state.configured ? 'auth-not-configured' : 'auth-secure-storage-unavailable')}
              </p>
            )}

            <div className="auth-mode-row">
              <button
                type="button"
                className="auth-mode"
                aria-pressed={!register}
                onClick={() => { setRegister(false); setMessage(''); setError('') }}
              >
                {t('auth-sign-in')}
              </button>
              <button
                type="button"
                className="auth-mode"
                aria-pressed={register}
                onClick={() => { setRegister(true); setMessage(''); setError('') }}
              >
                {t('auth-create-account')}
              </button>
            </div>

            <form className="auth-form" onSubmit={event => void submit(event)}>
              {register && (
                <label className="auth-field">
                  <span>{t('auth-name')}</span>
                  <input
                    autoComplete="name"
                    maxLength={80}
                    required
                    value={name}
                    onChange={event => setName(event.target.value)}
                  />
                </label>
              )}
              <label className="auth-field">
                <span>{t('auth-email')}</span>
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                />
              </label>
              <label className="auth-field">
                <span>{t('auth-password')}</span>
                <input
                  type="password"
                  autoComplete={register ? 'new-password' : 'current-password'}
                  minLength={8}
                  maxLength={128}
                  required
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                />
              </label>
              <button
                className="workspace-button primary"
                type="submit"
                disabled={busy || !state.configured || !state.secureStorage}
              >
                {busy ? t('auth-working') : t(register ? 'auth-create-account' : 'auth-sign-in')}
              </button>
            </form>

            {(state.google || state.webPortalUrl) && (
              <div className="auth-oauth-row">
                {state.google && <button
                  type="button"
                  className="workspace-button auth-google"
                  disabled={busy || !state.configured || !state.secureStorage}
                  onClick={() => void google()}
                >
                  {t('auth-google')}
                </button>}

                {state.webPortalUrl && <button
                  type="button"
                  className="workspace-button auth-google"
                  disabled={busy || !state.configured || !state.secureStorage}
                  onClick={() => void browser()}
                >
                  Masuk lewat Browser
                </button>}
              </div>
            )}
          </div>
        )}

        {message && <p role="status" className="settings-description auth-success">{message}</p>}
        {error && <p role="alert" className="auth-error">{error}</p>}
      </div>
    </section>
  )
}
