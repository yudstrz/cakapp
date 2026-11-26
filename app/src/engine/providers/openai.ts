import type { AIProvider, GenerateNotesParams, GenerateNotesResult, GenerateTitleParams, StreamChatParams } from './types'
import { buildNotesPrompt, buildTitlePrompt } from './promptBuilder'

export class OpenAIProvider implements AIProvider {
  readonly id = 'openai'
  readonly name = 'OpenAI'
  private apiKey: string
  private model: string

  constructor(apiKey = '', model = 'gpt-4o-mini') {
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
      throw new Error('API Key OpenAI belum dikonfigurasi')
    }

    const prompt = buildNotesPrompt(params)
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
      signal: params.signal,
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`OpenAI API error (${resp.status}): ${errText || resp.statusText}`)
    }

    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const text = data.choices?.[0]?.message?.content?.trim() || ''

    if (params.onToken && text) {
      params.onToken(text)
    }

    return {
      enhanced: text,
      provider: 'openai',
      model: this.model,
      fallbackUsed: false,
    }
  }

  async streamChat(params: StreamChatParams): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('API Key OpenAI belum dikonfigurasi')
    }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: params.messages,
        temperature: 0.3,
      }),
      signal: params.signal,
    })

    if (!resp.ok) {
      throw new Error(`OpenAI API error (${resp.status})`)
    }

    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const text = data.choices?.[0]?.message?.content?.trim() || ''
    if (params.onToken && text) {
      params.onToken(text)
    }
    return text
  }

  async generateTitle(params: GenerateTitleParams): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('API Key OpenAI belum dikonfigurasi')
    }

    const prompt = buildTitlePrompt(params)
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 30,
      }),
      signal: params.signal,
    })

    if (!resp.ok) {
      throw new Error(`OpenAI API error (${resp.status})`)
    }

    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') || 'Rapat Koordinasi'
  }
}
