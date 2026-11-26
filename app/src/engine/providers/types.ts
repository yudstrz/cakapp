export type AIProviderId = 'local' | 'openai' | 'gemini' | 'claude' | 'agnes'

export interface GenerateNotesParams {
  transcript: string
  mine?: string
  language?: string
  instruction?: string
  attendees?: string[]
  title?: string
  onToken?: (token: string) => void
  signal?: AbortSignal
}

export interface GenerateNotesResult {
  enhanced: string
  provider: AIProviderId
  model: string
  fallbackUsed?: boolean
  error?: string
}

export interface StreamChatParams {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  onToken?: (token: string) => void
  signal?: AbortSignal
}

export interface GenerateTitleParams {
  transcript: string
  language?: string
  signal?: AbortSignal
}

export interface ProviderManagerConfig {
  mode: 'local' | 'cloud'
  activeProvider: AIProviderId
  keys: Partial<Record<AIProviderId, string>>
  models?: Partial<Record<AIProviderId, string>>
}

export interface AIProvider {
  id: AIProviderId
  name: string
  isAvailable(): boolean
  generateNotes(params: GenerateNotesParams): Promise<GenerateNotesResult>
  streamChat(params: StreamChatParams): Promise<string>
  generateTitle(params: GenerateTitleParams): Promise<string>
}
