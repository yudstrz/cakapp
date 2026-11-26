import {
  normalizeCloudProvider,
  type AIProvider,
  type AIProviderId,
  type CloudTransportFn,
  type GenerateNotesParams,
  type GenerateNotesResult,
  type GenerateTitleParams,
  type ProviderManagerConfig,
  type StreamChatParams,
} from './types'
import { LocalProvider, type LocalLlmRunner } from './local'
import { formatFallbackNotice } from './gemini'
import { GeminiProvider, OpenAIProvider } from './openai'
import { AnthropicProvider } from './claude'

export class AIProviderManager {
  private localProvider: LocalProvider
  private geminiProvider: GeminiProvider
  private openAIProvider: OpenAIProvider
  private anthropicProvider: AnthropicProvider
  private config: ProviderManagerConfig
  private fallbackListeners = new Set<(reason: string) => void>()

  constructor(initialConfig?: Partial<ProviderManagerConfig>, localRunner?: LocalLlmRunner) {
    const transport = initialConfig?.transport
    this.localProvider = new LocalProvider(localRunner)
    this.geminiProvider = new GeminiProvider(initialConfig?.models?.gemini || '', transport)
    this.openAIProvider = new OpenAIProvider(initialConfig?.models?.openai || '', transport)
    this.anthropicProvider = new AnthropicProvider(
      initialConfig?.models?.anthropic || initialConfig?.models?.claude || '',
      transport
    )

    this.config = {
      mode: initialConfig?.mode || 'local',
      activeProvider: initialConfig?.activeProvider === 'local' ? 'local' : normalizeCloudProvider(initialConfig?.activeProvider),
      models: initialConfig?.models || {},
      transport,
    }
  }

  onFallback(listener: (reason: string) => void): () => void {
    this.fallbackListeners.add(listener)
    return () => this.fallbackListeners.delete(listener)
  }

  private notifyFallback(reason: string) {
    for (const cb of this.fallbackListeners) {
      try {
        cb(reason)
      } catch {
        // Ignore listener error.
      }
    }
  }

  setTransport(transport: CloudTransportFn | undefined) {
    this.config.transport = transport
    this.geminiProvider.setTransport(transport)
    this.openAIProvider.setTransport(transport)
    this.anthropicProvider.setTransport(transport)
  }

  updateConfig(newConfig: Partial<ProviderManagerConfig>) {
    const nextActive =
      newConfig.activeProvider !== undefined
        ? newConfig.activeProvider === 'local'
          ? 'local'
          : normalizeCloudProvider(newConfig.activeProvider)
        : this.config.activeProvider

    this.config = {
      ...this.config,
      ...newConfig,
      activeProvider: nextActive,
      models: { ...this.config.models, ...newConfig.models },
    }

    if (newConfig.transport !== undefined) {
      this.setTransport(newConfig.transport)
    }
    if (newConfig.models?.gemini !== undefined) this.geminiProvider.setModel(newConfig.models.gemini)
    if (newConfig.models?.openai !== undefined) this.openAIProvider.setModel(newConfig.models.openai)
    const anthModel = newConfig.models?.anthropic ?? newConfig.models?.claude
    if (anthModel !== undefined) this.anthropicProvider.setModel(anthModel)
  }

  setLocalRunner(runner: LocalLlmRunner) {
    this.localProvider.setRunner(runner)
  }

  getConfig(): ProviderManagerConfig {
    return { ...this.config }
  }

  getProvider(id: AIProviderId): AIProvider {
    if (id === 'local') return this.localProvider
    switch (normalizeCloudProvider(id)) {
      case 'gemini':
        return this.geminiProvider
      case 'openai':
        return this.openAIProvider
      case 'anthropic':
        return this.anthropicProvider
    }
  }

  getActiveProvider(): AIProvider {
    if (this.config.mode === 'local') {
      return this.localProvider
    }
    return this.getProvider(this.config.activeProvider)
  }

  /**
   * Run Cloud AI via server proxy; on rate limit, quota/budget exhaustion, unavailable model,
   * timeout, or network failure, switch to Local AI without crashing and emit a short notice.
   */
  async generateNotes(params: GenerateNotesParams): Promise<GenerateNotesResult> {
    const primary = this.getActiveProvider()
    if (primary.id === 'local') {
      return primary.generateNotes(params)
    }

    try {
      if (!primary.isAvailable()) {
        throw new Error(`Layanan Cloud AI (${primary.name}) belum terhubung.`)
      }
      return await primary.generateNotes(params)
    } catch (err: unknown) {
      if (params.signal?.aborted) throw err
      const rawMsg = err instanceof Error ? err.message : String(err)
      const notice = formatFallbackNotice(err)
      console.warn(`[AI Engine] ${primary.name} gagal (${rawMsg}). Beralih ke AI Lokal.`)
      this.notifyFallback(notice)

      const localResult = await this.localProvider.generateNotes(params)
      return {
        ...localResult,
        fallbackUsed: true,
        error: `${notice} (${rawMsg})`,
      }
    }
  }

  async generateTitle(params: GenerateTitleParams): Promise<string> {
    const primary = this.getActiveProvider()
    if (primary.id === 'local') {
      return primary.generateTitle(params)
    }

    try {
      if (!primary.isAvailable()) throw new Error('Cloud provider unavailable')
      return await primary.generateTitle(params)
    } catch (err: unknown) {
      if (params.signal?.aborted) throw err
      console.warn('[AI Engine] Judul otomatis beralih ke AI Lokal.')
      return this.localProvider.generateTitle(params)
    }
  }

  async streamChat(params: StreamChatParams): Promise<string> {
    const primary = this.getActiveProvider()
    if (primary.id === 'local') {
      return primary.streamChat(params)
    }

    try {
      if (!primary.isAvailable()) throw new Error('Cloud provider unavailable')
      return await primary.streamChat(params)
    } catch (err: unknown) {
      if (params.signal?.aborted) throw err
      const notice = formatFallbackNotice(err)
      this.notifyFallback(notice)
      return this.localProvider.streamChat(params)
    }
  }
}

export const globalAiManager = new AIProviderManager()
