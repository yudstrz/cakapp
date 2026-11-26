import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { userDataDir } from './paths'
import { loadAppEnv } from './env'
import { globalAiManager } from '../engine/providers/manager'
import type { AIProviderId, ProviderManagerConfig } from '../engine/providers/types'

export interface StoredAiConfig {
  mode: 'local' | 'cloud'
  activeProvider: AIProviderId
  encryptedKeys: Partial<Record<AIProviderId, string>>
  models: Partial<Record<AIProviderId, string>>
}

export interface PublicAiConfig {
  mode: 'local' | 'cloud'
  activeProvider: AIProviderId
  hasKey: Record<AIProviderId, boolean>
  maskedKeys: Record<AIProviderId, string>
  models: Record<AIProviderId, string>
  fallbackAvailable: boolean
}

const OBFUSCATION_SALT = 'cakapp-ai-key-salt-v1'

function xorCipher(text: string, salt: string): string {
  const result: number[] = []
  for (let i = 0; i < text.length; i++) {
    result.push(text.charCodeAt(i) ^ salt.charCodeAt(i % salt.length))
  }
  return Buffer.from(result).toString('base64')
}

function xorDecipher(base64Text: string, salt: string): string {
  try {
    const bytes = Buffer.from(base64Text, 'base64')
    const chars: string[] = []
    for (let i = 0; i < bytes.length; i++) {
      chars.push(String.fromCharCode(bytes[i] ^ salt.charCodeAt(i % salt.length)))
    }
    return chars.join('')
  } catch {
    return ''
  }
}

export function encryptApiKey(plain: string): string {
  if (!plain || !plain.trim()) return ''
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plain.trim()).toString('base64')
    }
  } catch {
    // fallback to obfuscation
  }
  return `obf:${xorCipher(plain.trim(), OBFUSCATION_SALT)}`
}

export function decryptApiKey(cipher: string): string {
  if (!cipher || !cipher.trim()) return ''
  if (cipher.startsWith('obf:')) {
    return xorDecipher(cipher.slice(4), OBFUSCATION_SALT)
  }
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(cipher, 'base64'))
    }
  } catch {
    // fallback if was stored with obfuscation
    return xorDecipher(cipher, OBFUSCATION_SALT)
  }
  return ''
}

export function maskApiKey(key: string): string {
  if (!key || key.length === 0) return ''
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
}

export function sanitizeLog(msg: string): string {
  // Redact potential API keys matching Claude, OpenAI, or Gemini patterns
  return msg
    .replace(/sk-ant-[A-Za-z0-9_-]{10,}/g, '[REDACTED_CLAUDE_KEY]')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_OPENAI_KEY]')
    .replace(/AIza[0-9A-Za-z-_]{30,}/g, '[REDACTED_GEMINI_KEY]')
}

export class AiKeyStore {
  private configPath: string
  private cachedConfig: StoredAiConfig
  private decryptedKeys: Partial<Record<AIProviderId, string>> = {}
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
      encryptedKeys: {},
      models: {
        gemini: 'gemini-2.0-flash',
        openai: 'gpt-4o-mini',
        claude: 'claude-3-5-sonnet-20241022',
        local: 'Qwen 3 (Local GGUF)',
      },
    }

    if (this.configPath === ':memory:') {
      return defaultConfig
    }

    // Load environment variable fallbacks
    const envGemini = process.env.GEMINI_API_KEY || ''
    const envOpenai = process.env.OPENAI_API_KEY || ''
    const envClaude = process.env.CLAUDE_API_KEY || ''
    const envAgnes = process.env.AGENT_API_KEY || process.env.FLASH_MODEL_API_KEY || ''

    if (envGemini) this.decryptedKeys.gemini = envGemini
    if (envOpenai) this.decryptedKeys.openai = envOpenai
    if (envClaude) this.decryptedKeys.claude = envClaude
    if (envAgnes) this.decryptedKeys.agnes = envAgnes

    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, 'utf8')
        const parsed = JSON.parse(raw) as Partial<StoredAiConfig>
        const merged: StoredAiConfig = {
          mode: parsed.mode || defaultConfig.mode,
          activeProvider: parsed.activeProvider || defaultConfig.activeProvider,
          encryptedKeys: parsed.encryptedKeys || {},
          models: { ...defaultConfig.models, ...parsed.models },
        }

        // Decrypt saved keys into memory (overrides env fallbacks)
        for (const [p, enc] of Object.entries(merged.encryptedKeys)) {
          if (enc) {
            this.decryptedKeys[p as AIProviderId] = decryptApiKey(enc)
          }
        }

        return merged
      }
    } catch {
      console.warn('Failed to read ai_config.json, using defaults')
    }

    // Default to Cloud AI automatically when user provided Cloud API keys in .env
    if (envGemini || envOpenai || envClaude || envAgnes) {
      defaultConfig.mode = 'cloud'
      defaultConfig.activeProvider = envGemini ? 'gemini' : envOpenai ? 'openai' : envClaude ? 'claude' : 'gemini'
    }

    return defaultConfig
  }

  private saveToDisk(): void {
    if (this.configPath === ':memory:') {
      return
    }
    try {
      const dir = dirname(this.configPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(this.configPath, JSON.stringify(this.cachedConfig, null, 2), 'utf8')
    } catch (err: unknown) {
      console.error('Failed to save ai_config.json to disk', err)
    }
  }

  private syncToGlobalManager(): void {
    globalAiManager.updateConfig({
      mode: this.cachedConfig.mode,
      activeProvider: this.cachedConfig.activeProvider,
      keys: { ...this.decryptedKeys },
      models: { ...this.cachedConfig.models },
    })
    const pub = this.getPublicConfig()
    for (const cb of this.listeners) cb(pub)
  }

  getPublicConfig(): PublicAiConfig {
    const hasKey: Record<AIProviderId, boolean> = {
      local: true,
      gemini: Boolean(this.decryptedKeys.gemini),
      openai: Boolean(this.decryptedKeys.openai),
      claude: Boolean(this.decryptedKeys.claude),
      agnes: Boolean(this.decryptedKeys.agnes),
    }

    const maskedKeys: Record<AIProviderId, string> = {
      local: '',
      gemini: maskApiKey(this.decryptedKeys.gemini || ''),
      openai: maskApiKey(this.decryptedKeys.openai || ''),
      claude: maskApiKey(this.decryptedKeys.claude || ''),
      agnes: maskApiKey(this.decryptedKeys.agnes || ''),
    }

    return {
      mode: this.cachedConfig.mode,
      activeProvider: this.cachedConfig.activeProvider,
      hasKey,
      maskedKeys,
      models: {
        local: this.cachedConfig.models.local || 'Qwen 3 (Local GGUF)',
        gemini: this.cachedConfig.models.gemini || 'gemini-2.0-flash',
        openai: this.cachedConfig.models.openai || 'gpt-4o-mini',
        claude: this.cachedConfig.models.claude || 'claude-3-5-sonnet-20241022',
        agnes: 'gemini-2.0-flash-lite',
      },
      fallbackAvailable: true,
    }
  }

  setMode(mode: 'local' | 'cloud'): void {
    this.cachedConfig.mode = mode
    this.saveToDisk()
    this.syncToGlobalManager()
  }

  setActiveProvider(provider: AIProviderId): void {
    this.cachedConfig.activeProvider = provider
    this.saveToDisk()
    this.syncToGlobalManager()
  }

  setModel(provider: AIProviderId, model: string): void {
    this.cachedConfig.models[provider] = model
    this.saveToDisk()
    this.syncToGlobalManager()
  }

  setApiKey(provider: AIProviderId, plainKey: string): void {
    const trimmed = plainKey.trim()
    this.decryptedKeys[provider] = trimmed
    this.cachedConfig.encryptedKeys[provider] = encryptApiKey(trimmed)
    this.saveToDisk()
    this.syncToGlobalManager()
  }

  getDecryptedKey(provider: AIProviderId): string {
    return this.decryptedKeys[provider] || ''
  }

  clearApiKey(provider: AIProviderId): void {
    delete this.decryptedKeys[provider]
    delete this.cachedConfig.encryptedKeys[provider]
    this.saveToDisk()
    this.syncToGlobalManager()
  }
}

export const aiKeyStore = new AiKeyStore()
