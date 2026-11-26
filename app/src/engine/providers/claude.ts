import type { AIProvider, GenerateNotesParams, GenerateNotesResult, GenerateTitleParams, StreamChatParams } from './types'
import { buildNotesPrompt, buildTitlePrompt } from './promptBuilder'

export class ClaudeProvider implements AIProvider {
  readonly id = 'claude'
  readonly name = 'Anthropic Claude'
  private apiKey: string
  private model: string

  constructor(apiKey = '', model = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey
    this.model = model
  }

  setApiKey(key: string) {
    this.apiKey = key
  }

  setModel(model: string) {
    this.model = model
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0)
  }

  async generateNotes(params: GenerateNotesParams): Promise<GenerateNotesResult> {
    if (!this.isAvailable()) {
      throw new Error('API Key Anthropic Claude belum dikonfigurasi')
    }

    const prompt = buildNotesPrompt(params)
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
      signal: params.signal,
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`Claude API error (${resp.status}): ${errText || resp.statusText}`)
    }

    const data = (await resp.json()) as { content?: Array<{ text?: string }> }
    const text = data.content?.[0]?.text?.trim() || ''

    if (params.onToken && text) {
      params.onToken(text)
    }

    return {
      enhanced: text,
      provider: 'claude',
      model: this.model,
      fallbackUsed: false,
    }
  }

  async streamChat(params: StreamChatParams): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('API Key Anthropic Claude belum dikonfigurasi')
    }

    const messages = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }))

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages,
        temperature: 0.3,
      }),
      signal: params.signal,
    })

    if (!resp.ok) {
      throw new Error(`Claude API error (${resp.status})`)
    }

    const data = (await resp.json()) as { content?: Array<{ text?: string }> }
    const text = data.content?.[0]?.text?.trim() || ''
    if (params.onToken && text) {
      params.onToken(text)
    }
    return text
  }

  async generateTitle(params: GenerateTitleParams): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('API Key Anthropic Claude belum dikonfigurasi')
    }

    const prompt = buildTitlePrompt(params)
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 40,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
      signal: params.signal,
    })

    if (!resp.ok) {
      throw new Error(`Claude API error (${resp.status})`)
    }

    const data = (await resp.json()) as { content?: Array<{ text?: string }> }
    return data.content?.[0]?.text?.trim().replace(/^["']|["']$/g, '') || 'Rapat Koordinasi'
  }
}
