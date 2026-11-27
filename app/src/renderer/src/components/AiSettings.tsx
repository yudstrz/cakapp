import { useCallback, useEffect, useState } from 'react'
import { ChevronDown } from './Icons'
import type { HardwareCheckReport } from '../../../shared/types'

type CloudProvider = 'gemini' | 'openai' | 'anthropic'

interface VerifiedModelItem {
  id: string
  label: string
  tier: 'hemat' | 'standar' | 'premium'
  default?: boolean
  provider: CloudProvider
}

interface AiConfigState {
  mode: 'local' | 'cloud'
  activeProvider: CloudProvider
  sttMode: 'local' | 'cloud'
  sttProvider: 'gemini' | 'openai'
  models: Record<CloudProvider | 'local', string>
  baseUrl: string
  byok: {
    hasKey: Record<CloudProvider, boolean>
    maskedKeys: Record<CloudProvider, string>
  }
  fallbackAvailable: boolean
}

const PROVIDER_NAMES: Record<CloudProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
}

export function AiSettings() {
  const [config, setConfig] = useState<AiConfigState>()
  const [modelsMap, setModelsMap] = useState<Record<CloudProvider, VerifiedModelItem[]>>({
    gemini: [],
    openai: [],
    anthropic: [],
  })
  const [loadingCloud, setLoadingCloud] = useState(false)
  const [cloudNote, setCloudNote] = useState('')
  const [byokInput, setByokInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkingHw, setCheckingHw] = useState(false)
  const [hwReport, setHwReport] = useState<HardwareCheckReport | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadCloudData = useCallback(async (force = false, provider?: CloudProvider) => {
    setLoadingCloud(true)
    setCloudNote('')
    try {
      const modelsRes = await window.yogurt.ai.getModels({ force, provider })

      if (modelsRes.config) {
        setConfig(modelsRes.config as AiConfigState)
      }
      if (modelsRes.ok) {
        setModelsMap(modelsRes.models)
      } else if (modelsRes.error) {
        setCloudNote(modelsRes.error)
      }
    } catch {
      setCloudNote('Tidak dapat memuat daftar model dari server. Pastikan Anda sudah masuk akun dan terhubung ke internet.')
    } finally {
      setLoadingCloud(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void window.yogurt.ai.getConfig().then((cfg) => {
      if (!active) return
      setConfig(cfg)
      if (cfg.mode === 'cloud' || cfg.sttMode === 'cloud') {
        void loadCloudData(false, cfg.activeProvider)
      }
    }).catch(() => {})

    const offAuth = window.yogurt.auth.onChanged(() => {
      void window.yogurt.ai.getConfig().then((cfg) => {
        if (!active) return
        setConfig(cfg)
        if (cfg.mode === 'cloud' || cfg.sttMode === 'cloud') {
          void loadCloudData(true, cfg.activeProvider)
        }
      }).catch(() => {})
    })

    return () => {
      active = false
      offAuth()
    }
  }, [loadCloudData])

  const switchMode = async (newMode: 'local' | 'cloud') => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const updated = (await window.yogurt.ai.setConfig({ mode: newMode })) as AiConfigState
      setConfig(updated)
      setMessage(newMode === 'local' ? 'Mode AI Lokal (Offline) aktif.' : 'Mode Cloud AI aktif.')
      if (newMode === 'cloud') {
        await loadCloudData(false, updated.activeProvider)
      }
    } catch {
      setError('Gagal mengubah mode pemrosesan AI.')
    } finally {
      setBusy(false)
    }
  }

  const switchProvider = async (provider: CloudProvider) => {
    setBusy(true)
    setMessage('')
    setError('')
    setByokInput('')
    try {
      const updated = (await window.yogurt.ai.setConfig({ activeProvider: provider })) as AiConfigState
      setConfig(updated)
      await loadCloudData(false, provider)
    } catch {
      setError('Gagal memilih provider Cloud AI.')
    } finally {
      setBusy(false)
    }
  }

  const switchSttMode = async (sttMode: 'local' | 'cloud') => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const updated = (await window.yogurt.ai.setConfig({ sttMode })) as AiConfigState
      setConfig(updated)
      setMessage(
        sttMode === 'local'
          ? 'Default transkripsi suara disetel ke Whisper Lokal (Offline).'
          : 'Default transkripsi suara disetel ke Cloud AI (Server Bersama).'
      )
      if (sttMode === 'cloud') {
        await loadCloudData(false, updated.activeProvider)
      }
    } catch {
      setError('Gagal mengubah mode transkripsi suara.')
    } finally {
      setBusy(false)
    }
  }

  const switchSttProvider = async (sttProvider: 'gemini' | 'openai') => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const updated = (await window.yogurt.ai.setConfig({ sttProvider })) as AiConfigState
      setConfig(updated)
      setMessage(`Provider transkripsi suara disetel ke ${sttProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'}.`)
    } catch {
      setError('Gagal mengubah provider transkripsi suara.')
    } finally {
      setBusy(false)
    }
  }

  const switchModel = async (model: string) => {
    if (!config) return
    setMessage('')
    setError('')
    try {
      const updated = (await window.yogurt.ai.setConfig({
        activeProvider: config.activeProvider,
        model,
      })) as AiConfigState
      setConfig(updated)
    } catch {
      setError('Gagal menyimpan pilihan model.')
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
        setMessage(res.message || 'Koneksi ke layanan Cloud AI siap digunakan.')
      } else {
        setError(res.error || 'Uji koneksi gagal.')
      }
    } catch {
      setError('Terjadi kesalahan saat menguji koneksi ke server.')
    } finally {
      setBusy(false)
    }
  }

  const applyByok = async () => {
    if (!config || !byokInput.trim()) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const updated = (await window.yogurt.ai.setByokKey(config.activeProvider, byokInput.trim())) as AiConfigState
      setConfig(updated)
      setByokInput('')
      setMessage(`Kunci pribadi ${PROVIDER_NAMES[config.activeProvider]} diaktifkan untuk sesi ini.`)
      await loadCloudData(true, config.activeProvider)
    } catch {
      setError('Gagal mengaktifkan kunci pribadi.')
    } finally {
      setBusy(false)
    }
  }

  const resetByok = async () => {
    if (!config) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const updated = (await window.yogurt.ai.clearByokKey(config.activeProvider)) as AiConfigState
      setConfig(updated)
      setMessage(`Kembali memakai kunci bersama server untuk ${PROVIDER_NAMES[config.activeProvider]}.`)
      await loadCloudData(true, config.activeProvider)
    } catch {
      setError('Gagal mereset kunci ke server.')
    } finally {
      setBusy(false)
    }
  }

  if (!config) {
    return (
      <section aria-labelledby="ai-settings-heading" className="auth-settings">
        <h2 id="ai-settings-heading" className="settings-section-heading">
          Kecerdasan Buatan (Hybrid AI Engine)
        </h2>
        <div className="settings-group auth-settings-body">
          <p className="settings-description">Memuat pengaturan kecerdasan buatan...</p>
        </div>
      </section>
    )
  }

  const currentProvider = config.activeProvider
  const verifiedList = modelsMap[currentProvider] ?? []
  const activeModelId = config.models[currentProvider] || ''
  const hasByok = config.byok.hasKey[currentProvider]
  const byokMask = config.byok.maskedKeys[currentProvider]

  return (
    <section aria-labelledby="ai-settings-heading" className="auth-settings">
      <h2 id="ai-settings-heading" className="settings-section-heading">
        Kecerdasan Buatan (Hybrid AI Engine)
      </h2>

      <div className="settings-group auth-settings-body">
        <p className="settings-description">
          Pilih AI Lokal untuk pemrosesan 100% offline di komputer ini, atau Cloud AI menggunakan kunci bersama yang dikelola di server Cakapp tanpa perlu memasukkan API key.
        </p>

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
            Cloud AI (Server Bersama)
          </button>
        </div>

        {config.mode === 'local' && (
          <div className="auth-status-card auth-guest-active mt-4">
            <div className="auth-badge guest">
              <span>Mode Lokal Aktif</span>
            </div>
            <p className="settings-description">
              Notulen dan ringkasan rapat diproses langsung di perangkat Anda tanpa mengirim transkrip ke internet.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="workspace-button"
                disabled={busy}
                onClick={() => void window.yogurt.setup.downloadNotesModel()}
              >
                Unduh / Lanjutkan Model Offline
              </button>
              <button
                type="button"
                className="workspace-button"
                disabled={busy}
                onClick={() => void switchMode('cloud')}
              >
                Beralih ke Cloud AI (Tanpa Unduh)
              </button>
            </div>
          </div>
        )}

        {config.mode === 'cloud' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-line bg-bg p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <p className="font-medium text-ink">
                  {hasByok
                    ? `Mode Kunci Pribadi Aktif (${byokMask})`
                    : verifiedList.length > 0
                      ? 'Cloud AI Terkelola Aktif'
                      : 'Cloud AI Siap Digunakan'}
                </p>
                <p className="text-muted mt-0.5">
                  {hasByok
                    ? 'Permintaan sesi ini memakai kunci API pribadi Anda.'
                    : verifiedList.length > 0
                      ? `${verifiedList.length} model terverifikasi aktif tanpa batas token atau kuota akun.`
                      : cloudNote || 'Masuk ke akun Cakapp di bagian atas untuk memuat daftar model aktif.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="workspace-button"
                  disabled={busy || loadingCloud}
                  onClick={() => void loadCloudData(true, currentProvider)}
                >
                  {loadingCloud ? 'Memuat...' : 'Segarkan'}
                </button>
                <button
                  type="button"
                  data-testid="ai-test-connection"
                  className="workspace-button"
                  disabled={busy}
                  onClick={() => void testConnection()}
                >
                  Uji Koneksi
                </button>
              </div>
            </div>

            <div>
              <p className="settings-label mb-2">Provider Cloud AI</p>
              <div className="flex flex-wrap gap-2">
                {(['gemini', 'openai', 'anthropic'] as const).map((p) => {
                  const active = currentProvider === p
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={busy}
                      onClick={() => void switchProvider(p)}
                      className={`workspace-button ${active ? 'primary' : ''}`}
                    >
                      {PROVIDER_NAMES[p]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-copy">
                <label htmlFor="ai-active-model" className="settings-label">
                  Model Aktif
                </label>
                <p className="settings-description">
                  Daftar diisi otomatis dari model yang terverifikasi aktif di provider.
                </p>
              </div>
              <span className="settings-select-wrap">
                <select
                  id="ai-active-model"
                  data-testid="ai-model-select"
                  className="settings-select"
                  value={activeModelId}
                  onChange={(e) => void switchModel(e.target.value)}
                  disabled={busy || loadingCloud || verifiedList.length === 0}
                >
                  {loadingCloud && <option value="">Memverifikasi model aktif...</option>}
                  {!loadingCloud && verifiedList.length === 0 && (
                    <option value="">Model belum dimuat (masuk akun dulu)</option>
                  )}
                  {verifiedList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}{m.default ? ' (Default)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            </div>

            <details className="rounded-lg border border-line bg-bg p-3 text-xs">
              <summary className="cursor-pointer select-none font-medium text-ink">
                Opsi Lanjutan: Gunakan API Key Sendiri (Opsional)
              </summary>
              <div className="mt-3 space-y-2.5">
                <p className="text-muted">
                  Tidak wajib diisi. Jika diisi, permintaan sesi ini dikirim menggunakan kunci pribadi Anda, dan otomatis dihapus saat aplikasi ditutup.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    value={byokInput}
                    onChange={(e) => setByokInput(e.target.value)}
                    placeholder={`API Key ${PROVIDER_NAMES[currentProvider]} (opsional)`}
                    aria-label={`API Key ${PROVIDER_NAMES[currentProvider]}`}
                    className="settings-name-field flex-1 min-w-[200px]"
                  />
                  <button
                    type="button"
                    className="workspace-button"
                    disabled={busy || !byokInput.trim()}
                    onClick={() => void applyByok()}
                  >
                    Pakai Key Ini
                  </button>
                  {hasByok && (
                    <button
                      type="button"
                      className="workspace-button"
                      disabled={busy}
                      onClick={() => void resetByok()}
                    >
                      Reset ke Server
                    </button>
                  )}
                </div>
              </div>
            </details>

            <div className="rounded-lg border border-line bg-bg p-3 space-y-1.5 text-xs text-muted">
              <p className="text-ink">
                <strong>Kunci Terkelola di Server:</strong> Kunci API Cloud dikelola terpusat di backend Cakapp dan tidak pernah disimpan di perangkat pengguna.
              </p>
              <p className="text-ink">
                <strong>Smart Fallback Otomatis:</strong> Jika layanan Cloud AI sedang penuh atau jaringan terputus, pembuatan notulen otomatis beralih ke AI Lokal tanpa henti paksa.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-line space-y-3">
          <div>
            <p className="settings-label">Transkripsi Suara ke Teks (Speech-to-Text)</p>
            <p className="settings-description mt-0.5">
              Pilih mesin bawaan pengubah rekaman suara menjadi teks. Kedua opsi saling mem-backup otomatis jika salah satu terkendala.
            </p>
          </div>

          <div className="auth-mode-row">
            <button
              type="button"
              className="auth-mode"
              aria-pressed={config.sttMode === 'local'}
              onClick={() => void switchSttMode('local')}
              disabled={busy}
            >
              Default: Whisper Lokal (Offline)
            </button>
            <button
              type="button"
              className="auth-mode"
              aria-pressed={config.sttMode === 'cloud'}
              onClick={() => void switchSttMode('cloud')}
              disabled={busy}
            >
              Default: Cloud AI (API Key Server)
            </button>
          </div>

          {config.sttMode === 'local' ? (
            <p className="settings-description">
              Suara diubah menjadi teks di laptop Anda secara gratis memakai Whisper. Jika model Whisper belum terunduh atau gagal di perangkat ini, sistem otomatis mencoba Cloud Speech-to-Text selama Anda masuk akun.
            </p>
          ) : (
            <div className="rounded-lg border border-line bg-bg p-3 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">Provider Cloud Speech-to-Text</p>
                  <p className="text-muted mt-0.5">
                    Suara dipotong per kalimat pendek dan dikirim ke server menggunakan kunci Gemini atau OpenAI (Claude belum mendukung audio suara).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchSttProvider('gemini')}
                    className={`workspace-button ${config.sttProvider === 'gemini' ? 'primary' : ''}`}
                  >
                    Google Gemini
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchSttProvider('openai')}
                    className={`workspace-button ${config.sttProvider === 'openai' ? 'primary' : ''}`}
                  >
                    OpenAI
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 pt-4 border-t border-line space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="settings-label">Cek Kelayakan Hardware (AI Offline &amp; Whisper)</p>
              <p className="settings-description mt-0.5">
                Periksa CPU, RAM, GPU, dan kapasitas disk perangkat ini untuk melihat apakah direkomendasikan memakai model AI lokal atau Cloud AI.
              </p>
            </div>
            <button
              type="button"
              data-testid="check-hardware-btn"
              disabled={checkingHw || busy}
              onClick={() => {
                setCheckingHw(true)
                setMessage('')
                setError('')
                void window.yogurt.ai.checkHardware()
                  .then((rep) => setHwReport(rep))
                  .catch(() => setError('Gagal memeriksa spesifikasi hardware perangkat.'))
                  .finally(() => setCheckingHw(false))
              }}
              className="workspace-button"
            >
              {checkingHw ? 'Memeriksa hardware...' : hwReport ? 'Periksa Ulang' : 'Cek Hardware Sekarang'}
            </button>
          </div>

          {hwReport && (
            <div className="rounded-lg border border-line bg-bg p-3.5 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">{hwReport.recommendation.headline}</p>
                <span className="rounded border border-line px-2 py-0.5 font-medium text-ink">
                  {hwReport.recommendation.overall === 'local-optimal'
                    ? 'AI Lokal Optimal'
                    : hwReport.recommendation.overall === 'local-lite'
                      ? 'Lokal Ringan / Hybrid'
                      : 'Disarankan Cloud'}
                </span>
              </div>

              <p className="text-muted leading-relaxed">{hwReport.recommendation.reason}</p>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 border-t border-line pt-2.5">
                <div className="space-y-1">
                  <p className="font-medium text-ink">Spesifikasi Perangkat</p>
                  <p className="text-muted">CPU: {hwReport.hardware.cpuModel} ({hwReport.hardware.cores} core)</p>
                  <p className="text-muted">
                    RAM: {hwReport.hardware.totalRamGB} GB · Disk bebas: {hwReport.hardware.freeDiskGB} GB
                  </p>
                  <p className="text-muted">
                    GPU:{' '}
                    {hwReport.hardware.gpuKind === 'none'
                      ? 'Tidak ada akselerasi GPU (CPU saja)'
                      : `${hwReport.hardware.gpuName || hwReport.hardware.gpuKind}${hwReport.hardware.gpuVramGB > 0 ? ` (${hwReport.hardware.gpuVramGB} GB VRAM)` : ''}`}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="font-medium text-ink">Model Offline Sesuai Perangkat</p>
                  <p className="text-muted">
                    Notulen Offline:{' '}
                    {hwReport.llm.supported && hwReport.llm.recommendedName
                      ? `${hwReport.llm.recommendedName} (${hwReport.llm.sizeGB} GB, ~${hwReport.llm.estTokPerSec} tok/d, ${hwReport.llm.installedOnDisk ? 'terpasang' : 'belum diunduh'})`
                      : 'Tidak direkomendasikan di perangkat ini'}
                  </p>
                  <p className="text-muted">
                    Whisper Suara:{' '}
                    {hwReport.whisper.supported && hwReport.whisper.recommendedName
                      ? `${hwReport.whisper.recommendedName} (${hwReport.whisper.sizeGB} GB${hwReport.whisper.speedRtf !== null ? `, RTF ${hwReport.whisper.speedRtf}x` : ''}, ${hwReport.whisper.installedOnDisk ? 'terpasang' : 'belum diunduh'})`
                      : 'Disarankan pakai Cloud STT (Gemini/OpenAI)'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                <p className="text-muted">
                  Saran pengaturan: Notulen ={' '}
                  <strong className="text-ink">
                    {hwReport.recommendation.suggestedAiMode === 'local' ? 'AI Lokal' : 'Cloud AI'}
                  </strong>
                  , Suara-ke-Teks ={' '}
                  <strong className="text-ink">
                    {hwReport.recommendation.suggestedSttMode === 'local' ? 'Whisper Lokal' : 'Cloud STT'}
                  </strong>
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    setMessage('')
                    setError('')
                    void window.yogurt.ai.setConfig({
                      mode: hwReport.recommendation.suggestedAiMode,
                      sttMode: hwReport.recommendation.suggestedSttMode,
                    })
                      .then((updated) => {
                        setConfig(updated as AiConfigState)
                        setMessage('Pengaturan AI & Speech-to-Text disesuaikan mengikuti rekomendasi hardware.')
                      })
                      .catch(() => setError('Gagal menerapkan rekomendasi hardware.'))
                      .finally(() => setBusy(false))
                  }}
                  className="workspace-button primary"
                >
                  Terapkan Rekomendasi Ini
                </button>
              </div>
            </div>
          )}
        </div>

        {message && <p role="status" className="settings-description auth-success mt-2">{message}</p>}
        {error && <p role="alert" className="auth-error mt-2">{error}</p>}
      </div>
    </section>
  )
}
