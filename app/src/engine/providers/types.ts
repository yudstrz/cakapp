export type CloudProviderId = 'gemini' | 'openai' | 'anthropic'
export type AIProviderId = 'local' | CloudProviderId | 'claude'

export function normalizeCloudProvider(id: string | undefined): CloudProviderId {
  if (id === 'openai') return 'openai'
  if (id === 'anthropic' || id === 'claude') return 'anthropic'
  return 'gemini'
}

export interface VerifiedModelInfo {
  id: string
  label: string
  tier: 'hemat' | 'standar' | 'premium'
  default?: boolean
  provider: CloudProviderId
}

export interface AiUsageSnapshot {
  tier: 'free' | 'pro'
  usedRequests: number
  limitRequests: number
  remainingRequests: number
  usedInputTokens: number
  limitInputTokens: number
  remainingInputTokens: number
  resetAt: string
}

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
  task?: 'notulen' | 'ringkasan'
  onToken?: (token: string) => void
  signal?: AbortSignal
}

export interface GenerateTitleParams {
  transcript: string
  language?: string
  signal?: AbortSignal
}

export type CloudTransportFn = (params: {
  provider: CloudProviderId
  model: string
  task: 'notulen' | 'ringkasan'
  input: string
  stream?: boolean
  onToken?: (chunk: string) => void
  signal?: AbortSignal
}) => Promise<{ text: string; model: string }>

export interface ProviderManagerConfig {
  mode: 'local' | 'cloud'
  activeProvider: AIProviderId
  models?: Partial<Record<AIProviderId, string>>
  transport?: CloudTransportFn
}

export interface AIProvider {
  id: AIProviderId
  name: string
  isAvailable(): boolean
  generateNotes(params: GenerateNotesParams): Promise<GenerateNotesResult>
  streamChat(params: StreamChatParams): Promise<string>
  generateTitle(params: GenerateTitleParams): Promise<string>
}
