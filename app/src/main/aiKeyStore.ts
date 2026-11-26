import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { userDataDir } from './paths'
import { loadAppEnv } from './env'
import { globalAiManager } from '../engine/providers/manager'
import { normalizeCloudProvider, type AIProviderId, type CloudProviderId } from '../engine/providers/types'
import { getByokPublicStatus, maskApiKey, sanitizeLog } from './byokKey'

export { maskApiKey, sanitizeLog }

export interface StoredAiConfig {
  mode: 'local' | 'cloud'
  activeProvider: CloudProviderId
  models: Partial<Record<CloudProviderId | 'local', string>>
}

export interface PublicAiConfig {
  mode: 'local' | 'cloud'
  activeProvider: CloudProviderId
  models: Record<CloudProviderId | 'local', string>
  baseUrl: string
  byok: {
    hasKey: Record<CloudProviderId, boolean>
    maskedKeys: Record<CloudProviderId, string>
  }
  fallbackAvailable: boolean
}

const DEPRECATED_MODEL_PATTERN = /^(gemini-1\.5-|gemini-2\.0-|gemini-2\.5-|gemini-3-pro-preview|gemini-3\.1-flash-lite-preview|gpt-4o|claude-3-)/i

function cleanStoredModel(model: unknown): string {
  if (typeof model !== 'string') return ''
  const trimmed = model.trim()
  if (!trimmed || DEPRECATED_MODEL_PATTERN.test(trimmed)) return ''
  return trimmed
}

export function getAiApiBaseUrl(): string {
  loadAppEnv()
  return (
    process.env.AI_API_BASE_URL ||
    process.env.BETTER_AUTH_URL ||
    process.env.WEB_PORTAL_URL ||
    'https://cakapp.vercel.app'
  ).replace(/\/+$/, '')
}

/**
 * Stores non-sensitive AI preferences (mode, activeProvider, selected model IDs).
 * Cloud API keys are managed on the Vercel server; zero cloud keys are persisted on disk here.
 */
export class AiKeyStore {
  private configPath: string
  private cachedConfig: StoredAiConfig
  private listeners = new Set<(cfg: PublicAiConfig) => void>()

  constructor(customPath?: string) {
    this.configPath = customPath || join(userDataDir(), 'ai_config.json')
    if (this.configPath !== ':memory:') loadAppEnv()
    this.cachedConfig = this.loadFromDisk()
    this.syncToGlobalManager()
  }

  onChange(cb: (cfg: PublicAiConfig) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private loadFromDisk(): StoredAiConfig {
    const defaultConfig: StoredAiConfig = {
      mode: 'local',
      activeProvider: 'gemini',
      models: {
        local: 'Model Offline Lokal',
        gemini: '',
        openai: '',
        anthropic: '',
      },
    }

    if (this.configPath === ':memory:') {
      return defaultConfig
    }

    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, 'utf8')
        const parsed = JSON.parse(raw) as {
          mode?: 'local' | 'cloud'
          activeProvider?: string
          encryptedKeys?: unknown
          models?: Record<string, string>
        }

        const merged: StoredAiConfig = {
          mode: parsed.mode === 'cloud' ? 'cloud' : 'local',
          activeProvider: normalizeCloudProvider(parsed.activeProvider),
          models: {
            local: parsed.models?.local || defaultConfig.models.local,
            gemini: cleanStoredModel(parsed.models?.gemini),
            openai: cleanStoredModel(parsed.models?.openai),
            anthropic: cleanStoredModel(parsed.models?.anthropic ?? parsed.models?.claude),
          },
        }

        // Scrub legacy encryptedKeys field from older versions on disk.
        if (parsed.encryptedKeys !== undefined || parsed.activeProvider === 'claude') {
          this.cachedConfig = merged
          this.saveToDisk()
        }

        return merged
      }
    } catch {
      console.warn('Gagal membaca ai_config.json, memakai pengaturan awal.')
    }

    return defaultConfig
  }

  private saveToDisk(): void {
    if (this.configPath === ':memory:') return
    try {
      const dir = dirname(this.configPath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(this.configPath, JSON.stringify(this.cachedConfig, null, 2), 'utf8')
    } catch (err: unknown) {
      console.error('Gagal menyimpan ai_config.json', err)
    }
  }

  notifyChanged(): void {
    this.syncToGlobalManager()
  }

  private syncToGlobalManager(): void {
    globalAiManager.updateConfig({
      mode: this.cachedConfig.mode,
      activeProvider: this.cachedConfig.activeProvider,
      models: { ...this.cachedConfig.models },
    })
    const pub = this.getPublicConfig()
    for (const cb of this.listeners) cb(pub)
  }

  getPublicConfig(): PublicAiConfig {
    return {
      mode: this.cachedConfig.mode,
      activeProvider: this.cachedConfig.activeProvider,
      models: {
        local: this.cachedConfig.models.local || 'Model Offline Lokal',
        gemini: this.cachedConfig.models.gemini || '',
        openai: this.cachedConfig.models.openai || '',
        anthropic: this.cachedConfig.models.anthropic || '',
      },
      baseUrl: getAiApiBaseUrl(),
      byok: getByokPublicStatus(),
      fallbackAvailable: true,
    }
  }

  setMode(mode: 'local' | 'cloud'): void {
    this.cachedConfig.mode = mode
    this.saveToDisk()
    this.syncToGlobalManager()
  }

  setActiveProvider(provider: AIProviderId): void {
    if (provider === 'local') {
      this.setMode('local')
      return
    }
    this.cachedConfig.activeProvider = normalizeCloudProvider(provider)
    this.saveToDisk()
    this.syncToGlobalManager()
  }

  setModel(provider: AIProviderId, model: string): void {
    if (provider === 'local') {
      this.cachedConfig.models.local = model
    } else {
      this.cachedConfig.models[normalizeCloudProvider(provider)] = cleanStoredModel(model)
    }
    this.saveToDisk()
    this.syncToGlobalManager()
  }
}

export const aiKeyStore = new AiKeyStore()
