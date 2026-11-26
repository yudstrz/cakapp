import type { AIProvider, GenerateNotesParams, GenerateNotesResult, GenerateTitleParams, StreamChatParams } from './types'
import { buildNotesPrompt, buildTitlePrompt } from './promptBuilder'

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini'
  readonly name = 'Google Gemini'
  private apiKey: string
  private model: string

  constructor(apiKey = '', model = 'gemini-2.0-flash') {
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
      throw new Error('API Key Google Gemini belum dikonfigurasi')
    }

    const prompt = buildNotesPrompt(params)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey.trim()}`

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      }),
      signal: params.signal,
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`Gemini API error (${resp.status}): ${errText || resp.statusText}`)
    }

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''

    if (params.onToken && text) {
      params.onToken(text)
    }

    return {
      enhanced: text,
      provider: 'gemini',
      model: this.model,
      fallbackUsed: false,
    }
  }

  async streamChat(params: StreamChatParams): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('API Key Google Gemini belum dikonfigurasi')
    }

    const contents = params.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey.trim()}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.3 },
      }),
      signal: params.signal,
    })

    if (!resp.ok) {
      throw new Error(`Gemini API error (${resp.status})`)
    }

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    if (params.onToken && text) {
      params.onToken(text)
    }
    return text
  }

  async generateTitle(params: GenerateTitleParams): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('API Key Google Gemini belum dikonfigurasi')
    }

    const prompt = buildTitlePrompt(params)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey.trim()}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 60 },
      }),
      signal: params.signal,
    })

    if (!resp.ok) {
      throw new Error(`Gemini API error (${resp.status})`)
    }

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/^["']|["']$/g, '') ||
      'Rapat Koordinasi'
    )
  }
}
