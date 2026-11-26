import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Llm } from './notes/enhance'
import { globalAiManager } from '../engine/providers/manager'

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
  const cfg = globalAiManager.getConfig()
  const agentKey = process.env.AGENT_API_KEY || process.env.FLASH_MODEL_API_KEY || cfg.keys.agnes || ''
  const openaiKey = cfg.keys.openai || process.env.OPENAI_API_KEY || ''
  const geminiKey = cfg.keys.gemini || process.env.GEMINI_API_KEY || ''
  const claudeKey = cfg.keys.claude || process.env.CLAUDE_API_KEY || ''
  const agentBaseUrl = process.env.AGENT_API_BASE_URL || 'https://api.openai.com/v1'
  const agentModel = process.env.AGENT_MODEL_ID || 'gemini-2.0-flash-lite'
  const defaultProvider = cfg.mode === 'local' ? 'local' : cfg.activeProvider

  return { agentKey, openaiKey, geminiKey, claudeKey, agentBaseUrl, agentModel, defaultProvider }
}

export function isCloudAiAvailable(): boolean {
  const cfg = globalAiManager.getConfig()
  if (cfg.mode === 'local') return false
  const active = globalAiManager.getActiveProvider()
  if (active.id === 'local') return false
  return Boolean(active.isAvailable())
}

/**
 * Panggil Provider AI aktif dengan fallback berantai:
 * Aktif -> Gemini -> OpenAI -> Claude -> Agnes -> Local
 */
export async function askAgnesOrFallback(
  prompt: string,
  onToken?: (token: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const active = globalAiManager.getActiveProvider()

  // 1. Coba provider aktif jika bukan local
  if (active.id !== 'local' && active.isAvailable()) {
    try {
      console.info(`[Cloud AI] Memanggil provider utama: ${active.name}...`)
      return await active.streamChat({
        messages: [{ role: 'user', content: prompt }],
        onToken,
        signal,
      })
    } catch (err: unknown) {
      if (signal?.aborted) throw err
      console.warn(`[Cloud AI] ${active.name} gagal, mengaktifkan Smart Fallback:`, err instanceof Error ? err.message : String(err))
    }
  }

  const { agentKey, openaiKey, geminiKey, claudeKey, agentBaseUrl, agentModel } = getCloudAiKeys()

  // 2. Fallback ke Google Gemini
  if (geminiKey && active.id !== 'gemini') {
    try {
      console.info('[Cloud AI] Fallback: Memanggil Gemini...')
      const gemini = globalAiManager.getProvider('gemini')
      return await gemini.streamChat({
        messages: [{ role: 'user', content: prompt }],
        onToken,
        signal,
      })
    } catch (err: unknown) {
      if (signal?.aborted) throw err
      console.warn('[Cloud AI] Gemini fallback error:', err instanceof Error ? err.message : String(err))
    }
  }

  // 3. Fallback ke OpenAI
  if (openaiKey && active.id !== 'openai') {
    try {
      console.info('[Cloud AI] Fallback: Memanggil OpenAI...')
      const openai = globalAiManager.getProvider('openai')
      return await openai.streamChat({
        messages: [{ role: 'user', content: prompt }],
        onToken,
        signal,
      })
    } catch (err: unknown) {
      if (signal?.aborted) throw err
      console.warn('[Cloud AI] OpenAI fallback error:', err instanceof Error ? err.message : String(err))
    }
  }

  // 4. Fallback ke Anthropic Claude
  if (claudeKey && active.id !== 'claude') {
    try {
      console.info('[Cloud AI] Fallback: Memanggil Claude...')
      const claude = globalAiManager.getProvider('claude')
      return await claude.streamChat({
        messages: [{ role: 'user', content: prompt }],
        onToken,
        signal,
      })
    } catch (err: unknown) {
      if (signal?.aborted) throw err
      console.warn('[Cloud AI] Claude fallback error:', err instanceof Error ? err.message : String(err))
    }
  }

  // 5. Fallback ke Agnes AI jika ada
  if (agentKey) {
    try {
      console.info('[Cloud AI] Fallback: Memanggil Agnes AI...')
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
      }
    } catch (err: unknown) {
      if (signal?.aborted) throw err
    }
  }

  // 6. Terakhir: Smart Fallback ke Local Provider
  console.info('[Cloud AI] Seluruh Cloud AI gagal/tidak tersedia. Menjalankan Smart Fallback ke AI Lokal.')
  const local = globalAiManager.getProvider('local')
  return local.streamChat({
    messages: [{ role: 'user', content: prompt }],
    onToken,
    signal,
  })
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
