import type {
  AIProvider,
  AIProviderId,
  GenerateNotesParams,
  GenerateNotesResult,
  GenerateTitleParams,
  ProviderManagerConfig,
  StreamChatParams,
} from './types'
import { LocalProvider, type LocalLlmRunner } from './local'
import { GeminiProvider } from './gemini'
import { OpenAIProvider } from './openai'
import { ClaudeProvider } from './claude'

export class AIProviderManager {
  private localProvider: LocalProvider
  private geminiProvider: GeminiProvider
  private openAIProvider: OpenAIProvider
  private claudeProvider: ClaudeProvider
  private config: ProviderManagerConfig

  constructor(initialConfig?: Partial<ProviderManagerConfig>, localRunner?: LocalLlmRunner) {
    this.localProvider = new LocalProvider(localRunner)
    this.geminiProvider = new GeminiProvider(initialConfig?.keys?.gemini || '', initialConfig?.models?.gemini || 'gemini-2.0-flash')
    this.openAIProvider = new OpenAIProvider(initialConfig?.keys?.openai || '', initialConfig?.models?.openai || 'gpt-4o-mini')
    this.claudeProvider = new ClaudeProvider(initialConfig?.keys?.claude || '', initialConfig?.models?.claude || 'claude-3-5-sonnet-20241022')

    this.config = {
      mode: initialConfig?.mode || 'local',
      activeProvider: initialConfig?.activeProvider || 'gemini',
      keys: initialConfig?.keys || {},
      models: initialConfig?.models || {},
    }
  }

  updateConfig(newConfig: Partial<ProviderManagerConfig>) {
    this.config = {
      ...this.config,
      ...newConfig,
      keys: { ...this.config.keys, ...newConfig.keys },
      models: { ...this.config.models, ...newConfig.models },
    }

    if (newConfig.keys?.gemini !== undefined) this.geminiProvider.setApiKey(newConfig.keys.gemini)
    if (newConfig.keys?.openai !== undefined) this.openAIProvider.setApiKey(newConfig.keys.openai)
    if (newConfig.keys?.claude !== undefined) this.claudeProvider.setApiKey(newConfig.keys.claude)

    if (newConfig.models?.gemini) this.geminiProvider.setModel(newConfig.models.gemini)
    if (newConfig.models?.openai) this.openAIProvider.setModel(newConfig.models.openai)
    if (newConfig.models?.claude) this.claudeProvider.setModel(newConfig.models.claude)
  }

  setLocalRunner(runner: LocalLlmRunner) {
    this.localProvider.setRunner(runner)
  }

  getConfig(): ProviderManagerConfig {
    return { ...this.config }
  }

  getProvider(id: AIProviderId): AIProvider {
    switch (id) {
      case 'gemini':
        return this.geminiProvider
      case 'openai':
        return this.openAIProvider
      case 'claude':
        return this.claudeProvider
      case 'local':
      default:
        return this.localProvider
    }
  }

  getActiveProvider(): AIProvider {
    if (this.config.mode === 'local') {
      return this.localProvider
    }
    return this.getProvider(this.config.activeProvider)
  }

  /**
   * Generates notes with smart fallback.
   * If the chosen Cloud AI fails (offline, 429 quota, invalid key), it gracefully falls back to Local AI.
   */
  async generateNotes(params: GenerateNotesParams): Promise<GenerateNotesResult> {
    const primary = this.getActiveProvider()

    // If local mode is selected, run local directly
    if (primary.id === 'local') {
      return primary.generateNotes(params)
    }

    // Cloud Mode: Try primary cloud provider
    try {
      if (!primary.isAvailable()) {
        throw new Error(`API Key untuk ${primary.name} belum diisi atau tidak valid`)
      }
      return await primary.generateNotes(params)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.warn(`[AI Engine] ${primary.name} gagal (${errMsg}). Mengaktifkan Smart Fallback ke AI Lokal...`)

      // Smart Fallback ke Local Provider
      try {
        const localResult = await this.localProvider.generateNotes(params)
        return {
          ...localResult,
          fallbackUsed: true,
          error: `Dialihkan ke AI Lokal karena kendala Cloud AI: ${errMsg}`,
        }
      } catch (localErr: unknown) {
        throw new Error(
          `Semua provider AI gagal. Cloud: ${errMsg}. Local: ${localErr instanceof Error ? localErr.message : String(localErr)}`
        )
      }
    }
  }

  async generateTitle(params: GenerateTitleParams): Promise<string> {
    const primary = this.getActiveProvider()
    if (primary.id === 'local') {
      return primary.generateTitle(params)
    }

    try {
      if (!primary.isAvailable()) throw new Error('Cloud provider not available')
      return await primary.generateTitle(params)
    } catch (err: unknown) {
      console.warn(`[AI Engine] Judul otomatis fallback ke lokal: ${err instanceof Error ? err.message : String(err)}`)
      return this.localProvider.generateTitle(params)
    }
  }

  async streamChat(params: StreamChatParams): Promise<string> {
    const primary = this.getActiveProvider()
    if (primary.id === 'local') {
      return primary.streamChat(params)
    }

    try {
      if (!primary.isAvailable()) throw new Error('Cloud provider not available')
      return await primary.streamChat(params)
    } catch (err: unknown) {
      console.warn(`[AI Engine] Tanya-jawab chat fallback ke lokal: ${err instanceof Error ? err.message : String(err)}`)
      return this.localProvider.streamChat(params)
    }
  }
}

// Global Singleton Instance
export const globalAiManager = new AIProviderManager()
