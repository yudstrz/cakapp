import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Llm } from './notes/enhance'

// Load environment configuration
for (const envPath of [
  join(process.cwd(), '.env'),
  join(process.cwd(), '.env.local'),
  join(process.cwd(), 'app/.env'),
  join(process.cwd(), 'app/.env.local'),
  join(__dirname, '../../.env'),
  join(__dirname, '../../../.env'),
]) {
  if (existsSync(envPath)) dotenv.config({ path: envPath, quiet: true })
}

export function getCloudAiKeys() {
  const agentKey = process.env.AGENT_API_KEY || process.env.FLASH_MODEL_API_KEY || ''
  const openaiKey = process.env.OPENAI_API_KEY || ''
  const geminiKey = process.env.GEMINI_API_KEY || ''
  const agentBaseUrl = process.env.AGENT_API_BASE_URL || 'https://api.openai.com/v1'
  const agentModel = process.env.AGENT_MODEL_ID || 'gemini-2.0-flash-lite'
  const defaultProvider = process.env.DEFAULT_AI_PROVIDER || (agentKey ? 'agnes' : geminiKey ? 'gemini' : openaiKey ? 'openai' : 'local')

  return { agentKey, openaiKey, geminiKey, agentBaseUrl, agentModel, defaultProvider }
}

export function isCloudAiAvailable(): boolean {
  const { agentKey, openaiKey, geminiKey, defaultProvider } = getCloudAiKeys()
  if (defaultProvider === 'local') return false
  return !!(agentKey || openaiKey || geminiKey)
}

/**
 * Utama: Panggil Agnes AI (Flash Model Tier)
 * Fallback: Gemini 2.0 Flash -> OpenAI gpt-4o-mini
 */
export async function askAgnesOrFallback(
  prompt: string,
  onToken?: (token: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const { agentKey, openaiKey, geminiKey, agentBaseUrl, agentModel } = getCloudAiKeys()

  // 1. Coba Agnes AI terlebih dahulu (Prioritas Utama)
  if (agentKey) {
    try {
      console.info('[Cloud AI] Menggunakan Agnes AI (Prioritas Utama)...')
      const resp = await fetch(`${agentBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${agentKey}`,
        },
        body: JSON.stringify({
          model: agentModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
        signal,
      })

      if (resp.ok) {
        const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
        const text = data.choices?.[0]?.message?.content?.trim()
        if (text) {
          if (onToken) onToken(text)
          return text
        }
      } else {
        console.warn(`[Cloud AI] Agnes AI merespons status ${resp.status}, beralih ke fallback Gemini...`)
      }
    } catch (err: unknown) {
      if (signal?.aborted) throw err
      console.warn('[Cloud AI] Agnes AI request error, beralih ke fallback:', err instanceof Error ? err.message : String(err))
    }
  }

  // 2. Fallback ke Google Gemini 2.0 Flash
  if (geminiKey) {
    try {
      console.info('[Cloud AI] Fallback: Memanggil Gemini 2.0 Flash...')
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 },
          }),
          signal,
        }
      )

      if (resp.ok) {
        const gData = (await resp.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
        const text = gData.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (text) {
          if (onToken) onToken(text)
          return text
        }
      } else {
        console.warn(`[Cloud AI] Gemini merespons status ${resp.status}, beralih ke OpenAI fallback...`)
      }
    } catch (err: unknown) {
      if (signal?.aborted) throw err
      console.warn('[Cloud AI] Gemini error, beralih ke OpenAI:', err instanceof Error ? err.message : String(err))
    }
  }

  // 3. Fallback ke OpenAI (gpt-4o-mini)
  if (openaiKey) {
    try {
      console.info('[Cloud AI] Fallback: Memanggil OpenAI gpt-4o-mini...')
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
        signal,
      })

      if (resp.ok) {
        const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
        const text = data.choices?.[0]?.message?.content?.trim()
        if (text) {
          if (onToken) onToken(text)
          return text
        }
      }
    } catch (err: unknown) {
      if (signal?.aborted) throw err
      console.warn('[Cloud AI] OpenAI error:', err instanceof Error ? err.message : String(err))
    }
  }

  throw new Error('Semua provider AI (Agnes AI, Gemini, OpenAI) gagal menghasilkan respons')
}

export function createCloudLlm(signal?: AbortSignal): Llm {
  return {
    contextSize: 32_768,
    count: async (texts: string[]) => texts.map((t) => Math.ceil(t.length / 4)),
    chat: async (prompt: string, onToken: (t: string) => void, opts) => {
      let fullPrompt = prompt
      if (opts?.before && opts.before.length > 0) {
        fullPrompt = `Konteks sebelumnya:\n${opts.before.join('\n')}\n\nTugas:\n${prompt}`
      }
      return askAgnesOrFallback(fullPrompt, onToken, signal)
    },
    readAhead: async () => {},
  }
}
