import { ipcMain } from 'electron'
import { aiKeyStore } from './aiKeyStore'
import { clearByokApiKey, setByokApiKey } from './byokKey'
import { fetchCloudUsage, fetchVerifiedCloudModels, testCloudHealth } from './cloudAi'
import { normalizeCloudProvider, type AIProviderId } from '../engine/providers/types'

export function hookAiIpc() {
  ipcMain.handle('ai:get-config', () => {
    return aiKeyStore.getPublicConfig()
  })

  ipcMain.handle(
    'ai:set-config',
    (
      _e,
      config: {
        mode?: 'local' | 'cloud'
        activeProvider?: AIProviderId
        model?: string
        sttMode?: 'local' | 'cloud'
        sttProvider?: 'gemini' | 'openai'
      }
    ) => {
      if (config.mode) {
        aiKeyStore.setMode(config.mode)
      }
      if (config.activeProvider) {
        aiKeyStore.setActiveProvider(config.activeProvider)
      }
      if (config.model !== undefined && config.activeProvider) {
        aiKeyStore.setModel(config.activeProvider, config.model)
      }
      if (config.sttMode) {
        aiKeyStore.setSttMode(config.sttMode)
      }
      if (config.sttProvider) {
        aiKeyStore.setSttProvider(config.sttProvider)
      }
      return aiKeyStore.getPublicConfig()
    }
  )

  ipcMain.handle('ai:get-models', async (_e, opts?: { force?: boolean; provider?: string }) => {
    try {
      const provider = opts?.provider ? normalizeCloudProvider(opts.provider) : undefined
      const res = await fetchVerifiedCloudModels({ force: opts?.force, provider })
      return { ok: true, models: res.models, allowPremium: res.allowPremium, config: aiKeyStore.getPublicConfig() }
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal memuat daftar model Cloud AI.',
        models: { gemini: [], openai: [], anthropic: [] },
        config: aiKeyStore.getPublicConfig(),
      }
    }
  })

  ipcMain.handle('ai:get-usage', async () => {
    try {
      const usage = await fetchCloudUsage()
      return { ok: true, usage }
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal memuat kuota penggunaan.',
      }
    }
  })

  ipcMain.handle('ai:set-byok-key', (_e, provider: string, key: string) => {
    setByokApiKey(normalizeCloudProvider(provider), key)
    aiKeyStore.notifyChanged()
    return aiKeyStore.getPublicConfig()
  })

  ipcMain.handle('ai:clear-byok-key', (_e, provider: string) => {
    clearByokApiKey(normalizeCloudProvider(provider))
    aiKeyStore.notifyChanged()
    return aiKeyStore.getPublicConfig()
  })

  ipcMain.handle('ai:test-connection', async (_e, providerId: AIProviderId) => {
    if (providerId === 'local') {
      return { ok: true, message: 'Engine AI Lokal siap digunakan secara offline.' }
    }
    return testCloudHealth(normalizeCloudProvider(providerId))
  })
}
