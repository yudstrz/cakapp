import type {
  AIProvider,
  CloudProviderId,
  CloudTransportFn,
  GenerateNotesParams,
  GenerateNotesResult,
  GenerateTitleParams,
  StreamChatParams,
  VerifiedModelInfo,
} from './types'

export const CLIENT_CHUNK_MAX_CHARS = 24_000
const REDUCE_INPUT_CAP = 90_000

export class CloudProxyClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 500,
    public readonly retryAfter?: number
  ) {
    super(message)
    this.name = 'CloudProxyClientError'
  }
}

export function splitTranscriptChunks(text: string, maxChars = CLIENT_CHUNK_MAX_CHARS): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]

  const chunks: string[] = []
  const lines = trimmed.split('\n')
  let current = ''

  for (const line of lines) {
    if (line.length > maxChars) {
      if (current) {
        chunks.push(current.trim())
        current = ''
      }
      let idx = 0
      while (idx < line.length) {
        let end = Math.min(idx + maxChars, line.length)
        if (end < line.length) {
          const space = line.lastIndexOf(' ', end)
          if (space > idx + Math.floor(maxChars * 0.5)) end = space
        }
        chunks.push(line.slice(idx, end).trim())
        idx = end
      }
      continue
    }
    const candidate = current ? `${current}\n${line}` : line
    if (candidate.length > maxChars && current) {
      chunks.push(current.trim())
      current = line
    } else {
      current = candidate
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export function reconcileVerifiedModel(savedModel: string | undefined, verified: VerifiedModelInfo[]): string {
  if (verified.length === 0) return ''
  if (savedModel && verified.some((m) => m.id === savedModel)) return savedModel
  return verified.find((m) => m.default)?.id ?? verified[0].id
}

export function formatFallbackNotice(err: unknown): string {
  const code = err instanceof CloudProxyClientError ? err.code : ''
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()

  if (code === 'UNAUTHORIZED' || lower.includes('401') || lower.includes('autentikasi')) {
    return 'Silakan masuk akun untuk Cloud AI. Dialihkan otomatis ke AI Lokal.'
  }
  if (code === 'RATE_LIMITED' || lower.includes('429') || lower.includes('rate limit')) {
    return 'Batas permintaan Cloud AI per menit tercapai. Dialihkan ke AI Lokal.'
  }
  if (code === 'QUOTA_EXCEEDED' || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return 'Kuota harian Cloud AI habis. Dialihkan otomatis ke AI Lokal.'
  }
  if (code === 'BUDGET_EXCEEDED') {
    return 'Kuota bersama Cloud AI sedang penuh. Dialihkan otomatis ke AI Lokal.'
  }
  if (code === 'MODEL_UNAVAILABLE') {
    return 'Model Cloud AI tidak tersedia. Dialihkan otomatis ke AI Lokal.'
  }
  if (code === 'TIMEOUT' || lower.includes('timeout') || lower.includes('abort')) {
    return 'Waktu tunggu Cloud AI habis. Dialihkan otomatis ke AI Lokal.'
  }
  return 'Cloud AI sedang tidak terjangkau. Dialihkan otomatis ke AI Lokal.'
}

function buildMeetingInputPayload(params: GenerateNotesParams): string {
  const parts: string[] = []
  if (params.title) parts.push(`Judul Rapat: ${params.title}`)
  if (params.attendees?.length) parts.push(`Peserta: ${params.attendees.join(', ')}`)
  if (params.language) parts.push(`Bahasa: ${params.language}`)
  if (params.mine?.trim()) parts.push(`Catatan Manual Prioritas:\n${params.mine.trim()}`)
  if (params.instruction?.trim()) parts.push(`Instruksi Tambahan:\n${params.instruction.trim()}`)
  parts.push(`Transkrip:\n${params.transcript.trim()}`)
  return parts.join('\n\n')
}

export class CloudProxyProvider implements AIProvider {
  readonly id: CloudProviderId
  readonly name: string
  private model: string
  private transport?: CloudTransportFn

  constructor(id: CloudProviderId, name: string, model = '', transport?: CloudTransportFn) {
    this.id = id
    this.name = name
    this.model = model
    this.transport = transport
  }

  setModel(model: string) {
    this.model = model
  }

  getModel(): string {
    return this.model
  }

  setTransport(transport?: CloudTransportFn) {
    this.transport = transport
  }

  isAvailable(): boolean {
    return Boolean(this.transport)
  }

  private async runWithChunking(params: {
    task: 'notulen' | 'ringkasan'
    input: string
    onToken?: (tok: string) => void
    signal?: AbortSignal
  }): Promise<{ text: string; model: string }> {
    if (!this.transport) {
      throw new CloudProxyClientError('PROVIDER_ERROR', `Transport proxy ${this.name} belum siap.`, 503)
    }
    if (!this.model) {
      throw new CloudProxyClientError('MODEL_UNAVAILABLE', `Belum ada model terverifikasi untuk ${this.name}.`, 503)
    }

    const chunks = splitTranscriptChunks(params.input, CLIENT_CHUNK_MAX_CHARS)
    if (chunks.length === 0) {
      throw new CloudProxyClientError('INVALID_INPUT', 'Teks transkrip kosong.', 400)
    }

    if (chunks.length === 1) {
      return this.transport({
        provider: this.id,
        model: this.model,
        task: params.task,
        input: chunks[0],
        stream: true,
        onToken: params.onToken,
        signal: params.signal,
      })
    }

    const summaries: string[] = []
    for (let i = 0; i < chunks.length; i++) {
      params.signal?.throwIfAborted()
      const part = await this.transport({
        provider: this.id,
        model: this.model,
        task: 'ringkasan',
        input: `Bagian ${i + 1} dari ${chunks.length}:\n${chunks[i]}`,
        stream: false,
        signal: params.signal,
      })
      summaries.push(`### Ringkasan Bagian ${i + 1}\n${part.text.trim()}`)
    }

    return this.transport({
      provider: this.id,
      model: this.model,
      task: params.task,
      input: summaries.join('\n\n').slice(0, REDUCE_INPUT_CAP),
      stream: true,
      onToken: params.onToken,
      signal: params.signal,
    })
  }

  async generateNotes(params: GenerateNotesParams): Promise<GenerateNotesResult> {
    const input = buildMeetingInputPayload(params)
    const res = await this.runWithChunking({
      task: 'notulen',
      input,
      onToken: params.onToken,
      signal: params.signal,
    })
    return {
      enhanced: res.text,
      provider: this.id,
      model: res.model,
      fallbackUsed: false,
    }
  }

  async streamChat(params: StreamChatParams): Promise<string> {
    const combined = params.messages.map((m) => m.content).join('\n\n')
    const res = await this.runWithChunking({
      task: params.task ?? 'notulen',
      input: combined,
      onToken: params.onToken,
      signal: params.signal,
    })
    return res.text
  }

  async generateTitle(params: GenerateTitleParams): Promise<string> {
    const res = await this.runWithChunking({
      task: 'ringkasan',
      input: params.transcript.slice(0, 3000),
      signal: params.signal,
    })
    const firstHeading = res.text
      .split('\n')
      .map((l) => l.replace(/^[#*\-\d.\s]+/, '').replace(/\*\*/g, '').trim())
      .find((l) => l.length > 3)
    return (firstHeading ? firstHeading.split(/\s+/).slice(0, 7).join(' ') : 'Rapat Koordinasi').slice(0, 80)
  }
}
