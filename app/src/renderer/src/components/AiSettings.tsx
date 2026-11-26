import { useEffect, useState } from 'react'

interface AiConfigState {
  mode: 'local' | 'cloud'
  activeProvider: 'gemini' | 'openai' | 'claude' | 'local'
  hasKey: Record<string, boolean>
  maskedKeys: Record<string, string>
  models: Record<string, string>
  fallbackAvailable: boolean
}

export function AiSettings() {
  const [config, setConfig] = useState<AiConfigState>()
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refreshConfig = async () => {
    try {
      const cfg = (await window.yogurt.ai.getConfig()) as AiConfigState
      setConfig(cfg)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void refreshConfig()
  }, [])

  const switchMode = async (newMode: 'local' | 'cloud') => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const updated = (await window.yogurt.ai.setConfig({ mode: newMode })) as AiConfigState
      setConfig(updated)
      setMessage(newMode === 'local' ? 'Mode AI Lokal (Offline) aktif.' : 'Mode Cloud AI aktif.')
    } catch {
      setError('Gagal mengubah mode AI.')
    } finally {
      setBusy(false)
    }
  }

  const switchProvider = async (provider: 'gemini' | 'openai' | 'claude') => {
    setBusy(true)
    setMessage('')
    setError('')
    setKeyInput('')
    try {
      const updated = (await window.yogurt.ai.setConfig({ activeProvider: provider })) as AiConfigState
      setConfig(updated)
    } catch {
      setError('Gagal memilih provider.')
    } finally {
      setBusy(false)
    }
  }

  const switchModel = async (model: string) => {
    if (!config) return
    try {
      const updated = (await window.yogurt.ai.setConfig({
        activeProvider: config.activeProvider,
        model,
      })) as AiConfigState
      setConfig(updated)
    } catch {
      // ignore
    }
  }

  const saveKey = async () => {
    if (!config || !keyInput.trim()) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const updated = (await window.yogurt.ai.setKey(config.activeProvider, keyInput.trim())) as AiConfigState
      setConfig(updated)
      setKeyInput('')
      setMessage(`API Key ${config.activeProvider.toUpperCase()} berhasil disimpan dan dienkripsi.`)
    } catch {
      setError('Gagal menyimpan API Key.')
    } finally {
      setBusy(false)
    }
  }

  const clearKey = async () => {
    if (!config) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const updated = (await window.yogurt.ai.clearKey(config.activeProvider)) as AiConfigState
      setConfig(updated)
      setMessage(`API Key ${config.activeProvider.toUpperCase()} telah dihapus.`)
    } catch {
      setError('Gagal menghapus API Key.')
    } finally {
      setBusy(false)
    }
  }

  const testConnection = async () => {
    if (!config) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const res = await window.yogurt.ai.testConnection(config.activeProvider)
      if (res.ok) {
        setMessage(res.message || 'Koneksi API berhasil diverifikasi.')
      } else {
        setError(res.error || 'Gagal memverifikasi API Key.')
      }
    } catch {
      setError('Terjadi kesalahan saat menguji koneksi.')
    } finally {
      setBusy(false)
    }
  }

  if (!config) {
    return null
  }

  const currentProvider = config.activeProvider
  const isKeySet = config.hasKey[currentProvider]
  const currentMask = config.maskedKeys[currentProvider]

  return (
    <section aria-labelledby="ai-settings-heading" className="auth-settings">
      <h2 id="ai-settings-heading" className="settings-section-heading">
        Kecerdasan Buatan (Hybrid AI Engine)
      </h2>

      <div className="settings-group auth-settings-body">
        <p className="settings-description">
          Pilih antara model AI Lokal offline untuk privasi maksimal atau Cloud AI pihak ketiga dengan API Key Anda sendiri.
        </p>

        {/* Mode Selector */}
        <div className="auth-mode-row mt-3">
          <button
            type="button"
            className="auth-mode"
            aria-pressed={config.mode === 'local'}
            onClick={() => void switchMode('local')}
            disabled={busy}
          >
            AI Lokal (100% Offline)
          </button>
          <button
            type="button"
            className="auth-mode"
            aria-pressed={config.mode === 'cloud'}
            onClick={() => void switchMode('cloud')}
            disabled={busy}
          >
            Cloud AI (API Key Pribadi)
          </button>
        </div>

        {/* LOCAL MODE CARD */}
        {config.mode === 'local' && (
          <div className="auth-status-card auth-guest-active mt-4">
            <div className="auth-badge guest">
              <span>Mode Lokal Aktif</span>
            </div>
            <p className="settings-description">
              Notulen dan ringkasan rapat diproses 100% di komputer lokal menggunakan model AI offline (Qwen 3 / Gemma 4). Tidak ada teks percakapan yang dikirim ke internet.
            </p>
          </div>
        )}

        {/* CLOUD MODE SETTINGS */}
        {config.mode === 'cloud' && (
          <div className="mt-4 space-y-4">
            {/* Provider Selection Buttons */}
            <div>
              <p className="settings-label mb-2">Pilih Provider Cloud AI:</p>
              <div className="flex flex-wrap gap-2">
                {(['gemini', 'openai', 'claude'] as const).map((p) => {
                  const active = currentProvider === p
                  const has = config.hasKey[p]
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => void switchProvider(p)}
                      className={`workspace-button ${active ? 'primary' : ''}`}
                    >
                      {p === 'gemini' && 'Google Gemini'}
                      {p === 'openai' && 'OpenAI'}
                      {p === 'claude' && 'Anthropic Claude'}
                      {has && <span className="ml-1.5 text-[10px] text-emerald-400 font-bold">•</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Model Selection */}
            <div className="settings-row">
              <div className="settings-row-copy">
                <p className="settings-label">Model Aktif</p>
                <p className="settings-description">Pilih model yang akan digunakan untuk membuat notulen dan ringkasan.</p>
              </div>
              <select
                className="workspace-button"
                value={config.models[currentProvider] || ''}
                onChange={(e) => void switchModel(e.target.value)}
                disabled={busy}
              >
                {currentProvider === 'gemini' && (
                  <>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash (Direkomendasikan)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  </>
                )}
                {currentProvider === 'openai' && (
                  <>
                    <option value="gpt-4o-mini">GPT-4o Mini (Cepat & Hemat)</option>
                    <option value="gpt-4o">GPT-4o</option>
                  </>
                )}
                {currentProvider === 'claude' && (
                  <>
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                    <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                  </>
                )}
              </select>
            </div>

            {/* API Key Input Section */}
            <div className="rounded-xl border border-line bg-bg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="settings-label">
                  API Key {currentProvider === 'gemini' ? 'Google Gemini' : currentProvider === 'openai' ? 'OpenAI' : 'Anthropic Claude'}
                </p>
                {isKeySet && (
                  <span className="rounded bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    Tersimpan ({currentMask})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder={isKeySet ? 'Masukkan key baru untuk mengganti' : 'Tempelkan API Key di sini'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="flex-1 rounded-md border border-line bg-card px-3 py-1.5 text-xs text-ink placeholder:text-muted"
                />
                <button
                  type="button"
                  className="workspace-button primary"
                  disabled={busy || !keyInput.trim()}
                  onClick={() => void saveKey()}
                >
                  Simpan
                </button>
                {isKeySet && (
                  <button
                    type="button"
                    className="workspace-button"
                    disabled={busy}
                    onClick={() => void clearKey()}
                  >
                    Hapus
                  </button>
                )}
              </div>

              {isKeySet && (
                <div className="pt-1">
                  <button
                    type="button"
                    className="workspace-button"
                    disabled={busy}
                    onClick={() => void testConnection()}
                  >
                    Uji Koneksi API
                  </button>
                </div>
              )}
            </div>

            {/* Security & Fallback Notices */}
            <div className="rounded-lg border border-line bg-card/60 p-3 space-y-1.5 text-xs text-muted">
              <p className="flex items-center gap-2 text-ink">
                <span>Enkripsi safeStorage:</span> Kunci API disimpan terenkripsi di keychain sistem operasi dan tidak pernah dicatat dalam teks polos.
              </p>
              <p className="flex items-center gap-2 text-ink">
                <span>Smart Fallback Otomatis:</span> Jika kuota API habis atau laptop offline, sistem otomatis mengalihkan proses ke Model AI Lokal tanpa crash.
              </p>
            </div>
          </div>
        )}

        {/* Status Messages */}
        {message && <p role="status" className="settings-description auth-success mt-2">{message}</p>}
        {error && <p role="alert" className="auth-error mt-2">{error}</p>}
      </div>
    </section>
  )
}
