import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildNotesPrompt,
  LocalProvider,
  AIProviderManager,
  CloudProxyClientError,
  reconcileVerifiedModel,
  splitTranscriptChunks,
} from '../src/engine/providers'
import { AiKeyStore } from '../src/main/aiKeyStore'
import {
  buildByokHeaders,
  clearAllByokKeys,
  clearByokApiKey,
  getByokApiKey,
  getByokPublicStatus,
  maskApiKey,
  sanitizeLog,
  setByokApiKey,
} from '../src/main/byokKey'

describe('Hybrid AI Engine, Shared Proxy Client, Isolated BYOK, & Smart Fallback', () => {
  beforeEach(() => {
    clearAllByokKeys()
  })

  describe('TC-3.1: Struktur Notulen Lokal & Prompt Standar', () => {
    it('LocalProvider generates structured Indonesian meeting notes offline', async () => {
      const local = new LocalProvider()
      const sampleTranscript = `
Budi (PM): Selamat pagi rekan-rekan. Agenda kita adalah finalisasi rilis fitur transkripsi bilingual.
Sarah (Tech Lead): Dari sisi teknis, model sudah teruji di CPU lokal tanpa internet.
Dimas (QA): Tolong follow up action item jadwal deployment dan PIC pengujian ke tim kami.
`
      const result = await local.generateNotes({
        transcript: sampleTranscript,
        language: 'id',
        attendees: ['Budi Santoso', 'Sarah Wijaya', 'Dimas Pratama'],
        title: 'Rapat Sinkronisasi Rilis Q3',
      })

      expect(result.provider).toBe('local')
      expect(result.enhanced).toContain('### Ringkasan Eksekutif')
      expect(result.enhanced).toContain('### Pokok Keputusan (Key Decisions)')
      expect(result.enhanced).toContain('### Daftar Tugas & Tindak Lanjut (Action Items)')
      expect(result.enhanced).toContain('Budi Santoso')
    })

    it('embeds manual notes and custom rewrite instructions in LocalProvider fallback', async () => {
      const local = new LocalProvider()
      const result = await local.generateNotes({
        transcript: 'Diskusi alokasi anggaran.',
        mine: 'Catatan Direktur: Anggaran maks 100 juta',
        instruction: 'Ringkas untuk CEO',
        language: 'id',
      })

      expect(result.enhanced).toContain('Prioritas Catatan Pengguna: Catatan Direktur: Anggaran maks 100 juta')
      expect(result.enhanced).toContain('Catatan Penyesuaian: Ringkas untuk CEO')
      expect(buildNotesPrompt({ transcript: 'Halo', mine: 'Poin A' })).toContain('Poin A')
    })
  })

  describe('TC-3.2: Pemisahan Konfigurasi AI & Modul BYOK Sesi', () => {
    it('AiKeyStore stores zero cloud API keys and scrubs deprecated model IDs', () => {
      const store = new AiKeyStore(':memory:')
      store.setMode('cloud')
      store.setActiveProvider('claude')
      store.setModel('gemini', 'gemini-1.5-pro')

      const pub = store.getPublicConfig()
      expect(pub.activeProvider).toBe('anthropic')
      expect(pub.models.gemini).toBe('')

      store.setModel('gemini', 'gemini-3.5-flash-lite')
      expect(store.getPublicConfig().models.gemini).toBe('gemini-3.5-flash-lite')

      expect(store.getPublicConfig().sttMode).toBe('local')
      expect(store.getPublicConfig().sttProvider).toBe('gemini')
      store.setSttMode('cloud')
      store.setSttProvider('openai')
      expect(store.getPublicConfig().sttMode).toBe('cloud')
      expect(store.getPublicConfig().sttProvider).toBe('openai')
    })

    it('reconciles stored model to verified server default when retired', () => {
      const verified = [
        { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', tier: 'hemat' as const, default: true, provider: 'gemini' as const },
        { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', tier: 'standar' as const, provider: 'gemini' as const },
      ]
      expect(reconcileVerifiedModel('gemini-2.0-flash', verified)).toBe('gemini-3.5-flash-lite')
      expect(reconcileVerifiedModel('gemini-3.8-flash', verified)).toBe('gemini-3.8-flash')
      expect(reconcileVerifiedModel('gemini-3.8-flash', [])).toBe('')
    })

    it('manages optional BYOK keys in isolated memory module and redacts logs', () => {
      setByokApiKey('openai', 'sk-test-secret-key-1234567890')
      expect(getByokApiKey('openai')).toBe('sk-test-secret-key-1234567890')

      const status = getByokPublicStatus()
      expect(status.hasKey.openai).toBe(true)
      expect(status.maskedKeys.openai).toContain('••••••••')
      expect(buildByokHeaders('openai')).toEqual({
        'X-BYOK-Api-Key': 'sk-test-secret-key-1234567890',
        'X-BYOK-Provider': 'openai',
      })

      const dirty = 'Error: Bearer sk-1234567890abcdef1234567890 and AIzaSyD1234567890123456789012345'
      const clean = sanitizeLog(dirty)
      expect(clean).not.toContain('sk-1234567890')
      expect(clean).not.toContain('AIzaSyD123456')
      expect(maskApiKey('12345')).toBe('••••••••')

      clearByokApiKey('openai')
      expect(getByokPublicStatus().hasKey.openai).toBe(false)
    })
  })

  describe('TC-3.3: Chunking Map-Reduce & Smart Fallback Otomatis ke AI Lokal', () => {
    it('chunks long transcripts into map-reduce requests via server proxy transport', async () => {
      const seenTasks: string[] = []
      const transport = vi.fn(async (req: { task: 'notulen' | 'ringkasan'; model: string; onToken?: (t: string) => void }) => {
        seenTasks.push(req.task)
        const text = req.task === 'ringkasan' ? 'Intisari bagian' : '### Ringkasan Eksekutif\nNotulen final proxy'
        req.onToken?.(text)
        return { text, model: req.model }
      })

      const manager = new AIProviderManager({
        mode: 'cloud',
        activeProvider: 'gemini',
        models: { gemini: 'gemini-3.5-flash-lite' },
        transport,
      })

      const longTranscript = Array.from({ length: 400 }, (_, i) => `Pembicara ${i}: Pembahasan teknis poin ke-${i} mengenai arsitektur dan jadwal rilis aplikasi.`).join('\n')
      expect(splitTranscriptChunks(longTranscript, 24_000).length).toBeGreaterThan(1)

      const res = await manager.generateNotes({ transcript: longTranscript, language: 'id' })
      expect(res.fallbackUsed).toBe(false)
      expect(res.provider).toBe('gemini')
      expect(seenTasks.slice(0, -1).every((t) => t === 'ringkasan')).toBe(true)
      expect(seenTasks[seenTasks.length - 1]).toBe('notulen')
    })

    it.each([
      ['RATE_LIMITED', 429, 'Batas permintaan Cloud AI per menit tercapai'],
      ['QUOTA_EXCEEDED', 429, 'Kuota harian Cloud AI habis'],
      ['BUDGET_EXCEEDED', 429, 'Kuota bersama Cloud AI sedang penuh'],
      ['MODEL_UNAVAILABLE', 404, 'Model Cloud AI tidak tersedia'],
      ['TIMEOUT', 504, 'Waktu tunggu Cloud AI habis'],
    ])('falls back to Local AI with notice when server returns %s', async (code, status, expectedNotice) => {
      const notices: string[] = []
      const manager = new AIProviderManager({
        mode: 'cloud',
        activeProvider: 'openai',
        models: { openai: 'gpt-6-luna' },
        transport: async () => {
          throw new CloudProxyClientError(code, `Server returned ${code}`, status)
        },
      })
      manager.onFallback((msg) => notices.push(msg))

      const result = await manager.generateNotes({
        transcript: 'Pembahasan migrasi server ke arsitektur baru.',
        language: 'id',
      })

      expect(result.fallbackUsed).toBe(true)
      expect(result.provider).toBe('local')
      expect(notices[0]).toContain(expectedNotice)
      expect(result.enhanced).toContain('### Ringkasan Eksekutif')
    })

    it('falls back to Local AI when network is offline', async () => {
      const notices: string[] = []
      const manager = new AIProviderManager({
        mode: 'cloud',
        activeProvider: 'anthropic',
        models: { anthropic: 'claude-haiku-5-5' },
        transport: async () => {
          throw new TypeError('fetch failed: ENOTFOUND cakapp.vercel.app')
        },
      })
      manager.onFallback((msg) => notices.push(msg))

      const result = await manager.generateNotes({
        transcript: 'Evaluasi performa database kuartal ini.',
        language: 'id',
      })

      expect(result.fallbackUsed).toBe(true)
      expect(result.provider).toBe('local')
      expect(notices[0]).toContain('Cloud AI sedang tidak terjangkau')
    })
  })
})
