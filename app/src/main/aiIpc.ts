import { ipcMain } from 'electron'
import { aiKeyStore } from './aiKeyStore'
import { globalAiManager } from '../engine/providers/manager'
import type { AIProviderId } from '../engine/providers/types'

export function hookAiIpc() {
  ipcMain.handle('ai:get-config', () => {
    return aiKeyStore.getPublicConfig()
  })

  ipcMain.handle(
    'ai:set-config',
    (_e, config: { mode?: 'local' | 'cloud'; activeProvider?: AIProviderId; model?: string }) => {
      if (config.mode) {
        aiKeyStore.setMode(config.mode)
      }
      if (config.activeProvider) {
        aiKeyStore.setActiveProvider(config.activeProvider)
      }
      if (config.model && config.activeProvider) {
        aiKeyStore.setModel(config.activeProvider, config.model)
      }
      return aiKeyStore.getPublicConfig()
    }
  )

  ipcMain.handle('ai:set-key', (_e, provider: AIProviderId, key: string) => {
    aiKeyStore.setApiKey(provider, key)
    return aiKeyStore.getPublicConfig()
  })

  ipcMain.handle('ai:clear-key', (_e, provider: AIProviderId) => {
    aiKeyStore.clearApiKey(provider)
    return aiKeyStore.getPublicConfig()
  })

  ipcMain.handle('ai:test-connection', async (_e, providerId: AIProviderId) => {
    try {
      const provider = globalAiManager.getProvider(providerId)
      if (providerId !== 'local' && !provider.isAvailable()) {
        return { ok: false, error: 'API key belum diisi' }
      }
      const title = await provider.generateTitle({
        transcript: 'Speaker A: Halo tim, rapat hari ini membahas laporan keuangan kuartal ketiga.',
        language: 'id',
      })
      return { ok: true, message: `Berhasil terhubung ke ${provider.name}. Respon tes: "${title}"` }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })
}
