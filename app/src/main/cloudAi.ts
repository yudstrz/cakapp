import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, safeStorage } from 'electron'
import type { Llm } from './notes/enhance'
import { userDataDir } from './paths'
import { aiKeyStore, getAiApiBaseUrl } from './aiKeyStore'
import { buildByokHeaders } from './byokKey'
import { globalAiManager } from '../engine/providers/manager'
import {
  CloudProxyClientError,
  formatFallbackNotice,
  reconcileVerifiedModel,
} from '../engine/providers/gemini'
import type {
  AiUsageSnapshot,
  CloudProviderId,
  VerifiedModelInfo,
} from '../engine/providers/types'

let cachedModelsMap: Record<CloudProviderId, VerifiedModelInfo[]> | null = null
let cachedModelsAt = 0
const CLIENT_MODELS_TTL_MS = 5 * 60_000

export function emitAiFallbackNotice(reason: string): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('ai:fallback-notice', reason)
      }
    }
  } catch {
    // Ignore when running outside Electron window context (tests).
  }
}

export async function buildDesktopAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}

  try {
    const { getBetterAuthClient } = await import('./betterAuthClient')
    const client = getBetterAuthClient() as unknown as { getCookie?: () => string }
    const cookie = client.getCookie?.()
    if (cookie) {
      headers.Cookie = cookie
      return headers
    }
  } catch {
    // Fallback to Neon session token if BetterAuth client is not initialized.
  }

  try {
    const sessionFile = join(userDataDir(), 'auth-session.bin')
    if (existsSync(sessionFile) && safeStorage?.isEncryptionAvailable?.()) {
      const stored = JSON.parse(safeStorage.decryptString(readFileSync(sessionFile))) as Record<string, string>
      if (stored.neon_session) {
        const parsed = JSON.parse(stored.neon_session) as { token?: string }
        if (parsed.token) {
          headers.Authorization = `Bearer ${parsed.token}`
        }
      }
    }
  } catch {
    // Unauthenticated guest session; server will return 401 and trigger Local AI fallback.
  }

  return headers
}

export async function fetchVerifiedCloudModels(opts: { force?: boolean; provider?: CloudProviderId } = {}): Promise<{
  models: Record<CloudProviderId, VerifiedModelInfo[]>
  allowPremium: boolean
}> {
  const activeProv = opts.provider ?? aiKeyStore.getPublicConfig().activeProvider
  const byokHeaders = buildByokHeaders(activeProv)
  const hasByok = Object.keys(byokHeaders).length > 0

  if (!opts.force && !hasByok && cachedModelsMap && Date.now() - cachedModelsAt < CLIENT_MODELS_TTL_MS) {
    return { models: cachedModelsMap, allowPremium: false }
  }

  const authHeaders = await buildDesktopAuthHeaders()
  const resp = await fetch(`${getAiApiBaseUrl()}/api/ai/models`, {
    method: 'GET',
    headers: { ...authHeaders, ...byokHeaders },
  })

  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    throw new CloudProxyClientError(
      body?.error?.code || 'PROVIDER_ERROR',
      body?.error?.message || `Gagal memuat daftar model (${resp.status}).`,
      resp.status
    )
  }

  const data = (await resp.json()) as {
    models: Record<CloudProviderId, VerifiedModelInfo[]>
    allowPremium?: boolean
  }

  if (!hasByok) {
    cachedModelsMap = data.models
    cachedModelsAt = Date.now()
  }

  const pub = aiKeyStore.getPublicConfig()
  for (const p of ['gemini', 'openai', 'anthropic'] as const) {
    const reconciled = reconcileVerifiedModel(pub.models[p], data.models[p] ?? [])
    if (reconciled !== pub.models[p]) {
      aiKeyStore.setModel(p, reconciled)
    }
  }

  return { models: data.models, allowPremium: Boolean(data.allowPremium) }
}

export async function fetchCloudUsage(): Promise<AiUsageSnapshot> {
  const authHeaders = await buildDesktopAuthHeaders()
  const resp = await fetch(`${getAiApiBaseUrl()}/api/ai/usage`, {
    method: 'GET',
    headers: authHeaders,
  })
  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    throw new CloudProxyClientError(
      body?.error?.code || 'PROVIDER_ERROR',
      body?.error?.message || `Gagal memuat kuota harian (${resp.status}).`,
      resp.status
    )
  }
  return (await resp.json()) as AiUsageSnapshot
}

export async function testCloudHealth(provider: CloudProviderId): Promise<{
  ok: boolean
  message?: string
  error?: string
}> {
  try {
    const authHeaders = await buildDesktopAuthHeaders()
    const byokHeaders = buildByokHeaders(provider)
    const resp = await fetch(`${getAiApiBaseUrl()}/api/ai/health`, {
      method: 'GET',
      headers: { ...authHeaders, ...byokHeaders },
    })

    const data = (await resp.json().catch(() => null)) as {
      ok?: boolean
      killSwitch?: boolean
      providers?: Record<
        string,
        { configured?: boolean; defaultModel?: string; defaultModelReady?: boolean; availableModels?: number }
      >
      error?: { message?: string }
    } | null

    if (!resp.ok) {
      return { ok: false, error: data?.error?.message || `Uji koneksi gagal (${resp.status}).` }
    }
    if (data?.killSwitch) {
      return { ok: false, error: 'Layanan Cloud AI sedang dinonaktifkan sementara oleh pemilik.' }
    }
    const pInfo = data?.providers?.[provider]
    if (!pInfo?.configured) {
      return { ok: false, error: `Provider ${provider} belum dikonfigurasi di server.` }
    }
    if (!pInfo.availableModels) {
      return { ok: false, error: `Tidak ada model aktif untuk ${provider} saat ini.` }
    }
    if (!pInfo.defaultModelReady) {
      return {
        ok: true,
        message: `Terhubung. Model utama digantikan model aktif cadangan (${pInfo.availableModels} model tersedia).`,
      }
    }
    return {
      ok: true,
      message: `Koneksi siap. Model utama (${pInfo.defaultModel}) aktif di provider.`,
    }
  } catch {
    return { ok: false, error: 'Tidak dapat menghubungi server Cloud AI. Periksa koneksi internet Anda.' }
  }
}

const CLIENT_TTFT_CHAT_MS = 28_000
const CLIENT_TTFT_DEFAULT_MS = 58_000

export async function callVercelAiGenerate(params: {
  provider: CloudProviderId
  model: string
  task: 'notulen' | 'ringkasan' | 'tanya'
  input: string
  stream?: boolean
  onToken?: (chunk: string) => void
  signal?: AbortSignal
}): Promise<{ text: string; model: string }> {
  let modelId = params.model
  if (!modelId) {
    const { models } = await fetchVerifiedCloudModels({ provider: params.provider })
    modelId = reconcileVerifiedModel('', models[params.provider] ?? [])
    if (!modelId) {
      throw new CloudProxyClientError('MODEL_UNAVAILABLE', `Model untuk ${params.provider} tidak tersedia.`, 503)
    }
    aiKeyStore.setModel(params.provider, modelId)
  }

  const authHeaders = await buildDesktopAuthHeaders()
  const byokHeaders = buildByokHeaders(params.provider)
  const stream = params.stream ?? true

  const attemptController = new AbortController()
  let timedOut = false
  const linkAbort = () => attemptController.abort(params.signal?.reason)
  if (params.signal?.aborted) {
    linkAbort()
  } else {
    params.signal?.addEventListener('abort', linkAbort, { once: true })
  }
  const ttftMs = params.task === 'tanya' ? CLIENT_TTFT_CHAT_MS : CLIENT_TTFT_DEFAULT_MS
  const ttftTimer = setTimeout(() => {
    timedOut = true
    attemptController.abort(new Error('TIMEOUT'))
  }, ttftMs)
  const clearTtft = () => clearTimeout(ttftTimer)

  try {
    const resp = await fetch(`${getAiApiBaseUrl()}/api/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...byokHeaders,
      },
      body: JSON.stringify({
        provider: params.provider,
        model: modelId,
        task: params.task,
        input: params.input,
        stream,
      }),
      signal: attemptController.signal,
    })

    if (!resp.ok) {
      clearTtft()
      const body = (await resp.json().catch(() => null)) as {
        error?: { code?: string; message?: string; retryAfter?: number }
      } | null
      throw new CloudProxyClientError(
        body?.error?.code || 'PROVIDER_ERROR',
        body?.error?.message || `Server Cloud AI mengembalikan status ${resp.status}.`,
        resp.status,
        body?.error?.retryAfter
      )
    }

    if (!stream) {
      const data = (await resp.json()) as { text?: string; model?: string }
      clearTtft()
      const text = data.text ?? ''
      if (text && params.onToken) params.onToken(text)
      return { text, model: data.model ?? modelId }
    }

    if (!resp.body) {
      clearTtft()
      throw new CloudProxyClientError('PROVIDER_ERROR', 'Stream respons Cloud AI kosong.', 502)
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''
    let activeModel = modelId
    let currentEvent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const raw of lines) {
        const line = raw.trim()
        if (!line) {
          currentEvent = ''
          continue
        }
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim()
          continue
        }
        if (!line.startsWith('data:')) continue
        const payloadStr = line.slice(5).trim()
        if (!payloadStr) continue

        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(payloadStr) as Record<string, unknown>
        } catch {
          continue
        }

        if (currentEvent === 'token' && typeof parsed.text === 'string') {
          if (parsed.text) clearTtft()
          fullText += parsed.text
          params.onToken?.(parsed.text)
        } else if (currentEvent === 'done' && typeof parsed.model === 'string') {
          clearTtft()
          activeModel = parsed.model
        } else if (currentEvent === 'error') {
          clearTtft()
          throw new CloudProxyClientError(
            typeof parsed.code === 'string' ? parsed.code : 'PROVIDER_ERROR',
            typeof parsed.message === 'string' ? parsed.message : 'Streaming Cloud AI terputus.',
            502,
            typeof parsed.retryAfter === 'number' ? parsed.retryAfter : undefined
          )
        }
      }
    }

    return { text: fullText, model: activeModel }
  } catch (err) {
    if (timedOut && !params.signal?.aborted) {
      throw new CloudProxyClientError('TIMEOUT', 'Permintaan AI melebihi batas waktu.', 504)
    }
    throw err
  } finally {
    clearTtft()
    params.signal?.removeEventListener('abort', linkAbort)
  }
}

export async function callVercelAiTranscribe(params: {
  wavBuffer: Buffer
  provider?: 'gemini' | 'openai'
  language?: string
  prompt?: string
  signal?: AbortSignal
}): Promise<{ text: string; model: string }> {
  const cfg = aiKeyStore.getPublicConfig()
  const provider = params.provider ?? cfg.sttProvider
  const authHeaders = await buildDesktopAuthHeaders()
  const byokHeaders = buildByokHeaders(provider)

  const form = new FormData()
  form.set('file', new Blob([new Uint8Array(params.wavBuffer)], { type: 'audio/wav' }), 'chunk.wav')
  form.set('provider', provider)
  if (params.language) form.set('language', params.language)
  if (params.prompt) form.set('prompt', params.prompt.slice(0, 400))

  const resp = await fetch(`${getAiApiBaseUrl()}/api/ai/transcribe`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      ...byokHeaders,
    },
    body: form,
    signal: params.signal,
  })

  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as {
      error?: { code?: string; message?: string; retryAfter?: number }
    } | null
    throw new CloudProxyClientError(
      body?.error?.code || 'PROVIDER_ERROR',
      body?.error?.message || `Transkripsi Cloud AI gagal (${resp.status}).`,
      resp.status,
      body?.error?.retryAfter
    )
  }

  const data = (await resp.json()) as { text?: string; model?: string }
  return { text: (data.text ?? '').trim(), model: data.model ?? provider }
}

globalAiManager.setTransport(callVercelAiGenerate)
globalAiManager.onFallback((reason) => emitAiFallbackNotice(reason))

export function isCloudAiAvailable(): boolean {
  return aiKeyStore.getPublicConfig().mode === 'cloud'
}

export function createCloudLlm(
  signal?: AbortSignal,
  getLocalFallback?: () => Promise<Llm | null>
): Llm {
  return {
    contextSize: 32_768,
    count: async (texts: string[]) => texts.map((t) => Math.ceil(t.length / 4)),
    chat: async (prompt: string, onToken: (t: string) => void, opts) => {
      let fullInput = prompt
      if (opts?.before && opts.before.length > 0) {
        fullInput = `Konteks sebelumnya:\n${opts.before.join('\n')}\n\nTugas:\n${prompt}`
      }
      const pub = aiKeyStore.getPublicConfig()
      const provider = pub.activeProvider
      const task = opts?.task ?? (opts?.summary ? 'ringkasan' : 'notulen')

      try {
        const active = globalAiManager.getProvider(provider)
        return await active.streamChat({
          messages: [{ role: 'user', content: fullInput }],
          task,
          onToken,
          signal,
        })
      } catch (err: unknown) {
        if (signal?.aborted) throw err
        const notice = formatFallbackNotice(err)
        console.warn('[Cloud AI] Beralih otomatis ke AI Lokal:', err instanceof Error ? err.message : String(err))

        if (getLocalFallback) {
          const localLlm = await getLocalFallback().catch(() => null)
          if (localLlm) {
            emitAiFallbackNotice(notice)
            return localLlm.chat(prompt, onToken, opts)
          }
          emitAiFallbackNotice('Layanan Cloud AI sedang penuh/tidak terjangkau dan AI Lokal belum terpasang.')
          throw err
        }

        emitAiFallbackNotice(notice)
        const local = globalAiManager.getProvider('local')
        return local.streamChat({
          messages: [{ role: 'user', content: fullInput }],
          task,
          onToken,
          signal,
        })
      }
    },
    readAhead: async () => {},
  }
}
