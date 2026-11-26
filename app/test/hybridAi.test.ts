import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildNotesPrompt,
  buildTitlePrompt,
  LocalProvider,
  OpenAIProvider,
  GeminiProvider,
  ClaudeProvider,
  AIProviderManager,
} from '../src/engine/providers'
import {
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
  sanitizeLog,
  AiKeyStore,
} from '../src/main/aiKeyStore'

describe('Day 3 (Kamis) - Hybrid AI Engine & Unified Provider Verification', () => {
  // TC-3.1: Perbandingan Kualitas Notulen Lokal vs Cloud
  describe('TC-3.1: Perbandingan Struktur Notulen Lokal & Cloud', () => {
    it('LocalProvider generates enterprise-standard structured notes', async () => {
      const local = new LocalProvider()
      const sampleTranscript = `
Budi (PM): Selamat pagi rekan-rekan. Agenda kita adalah finalisasi rilis fitur transkripsi bilingual.
Sarah (Tech Lead): Dari sisi teknis, model sudah teruji di CPU lokal tanpa internet.
Dimas (QA): Tolong follow up action item jadwal deployment dan PIC pengujian ke tim kami.
Budi (PM): Baik, disepakati rilis dijadwalkan hari Jumat ini.
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
      expect(result.enhanced).toContain('- [ ]')
      expect(result.enhanced).toContain('Budi Santoso')
    })

    it('buildNotesPrompt creates uniform prompt with all required enterprise sections for Cloud AI', () => {
      const prompt = buildNotesPrompt({
        transcript: 'Manager: Kita harus pastikan integrasi Cloud AI berjalan stabil.',
        language: 'id',
        title: 'Review Arsitektur Hybrid',
        attendees: ['Manager A', 'Engineer B'],
      })

      expect(prompt).toContain('### STRUKTUR WAJIB:')
      expect(prompt).toContain('1. ### Ringkasan Eksekutif')
      expect(prompt).toContain('2. ### Pokok Keputusan (Key Decisions)')
      expect(prompt).toContain('3. ### Daftar Tugas & Tindak Lanjut (Action Items)')
      expect(prompt).toContain('Judul Pertemuan: Review Arsitektur Hybrid')
      expect(prompt).toContain('Peserta Rapat: Manager A, Engineer B')
      expect(prompt).toContain('=== TRANSKRIP PERCAKAPAN RAPAT ===')
    })
  })

  // TC-3.2: Penggabungan Catatan Manual Pengguna
  describe('TC-3.2: Penggabungan Catatan Manual Pengguna (Prioritas Tinggi)', () => {
    it('prioritizes user manual notes in prompt construction', () => {
      const manualNotes = 'Catatan Direktur: Anggaran disetujui maks 100 juta dan harus selesai Q3.'
      const prompt = buildNotesPrompt({
        transcript: 'Speaker A: Kita diskusikan alokasi anggaran.',
        mine: manualNotes,
        language: 'id',
      })

      expect(prompt).toContain('=== CATATAN MANUAL PENGGUNA (PRIORITAS TINGGI) ===')
      expect(prompt).toContain(manualNotes)
      expect(prompt).toContain('MENCERMINKAN FOKUS UTAMA dan HARUS DIPRIORITASKAN')
    })

    it('LocalProvider embeds manual notes into executive summary', async () => {
      const local = new LocalProvider()
      const manualNote = 'Catatan Direktur: Anggaran disetujui maks 100 juta'
      const result = await local.generateNotes({
        transcript: 'Rapat anggaran proyek.',
        mine: manualNote,
        language: 'id',
      })

      expect(result.enhanced).toContain('Prioritas Catatan Pengguna: Catatan Direktur: Anggaran disetujui maks 100 juta')
    })
  })

  // TC-3.3: Uji Fitur "Write Again" (Instruksi Kustom Pengguna)
  describe('TC-3.3: Fitur Write Again (Prompt Ulang Kustom)', () => {
    it('injects custom user rewrite instruction into prompt', () => {
      const customInstruction = 'Tulis ulang seringkas mungkin dalam 3 poin bullet saja'
      const prompt = buildNotesPrompt({
        transcript: 'Percakapan panjang 30 menit mengenai strategi pasar...',
        instruction: customInstruction,
        language: 'id',
      })

      expect(prompt).toContain('=== INSTRUKSI KHUSUS ("WRITE AGAIN") ===')
      expect(prompt).toContain(customInstruction)
    })

    it('LocalProvider reflects custom instruction in generated notes', async () => {
      const local = new LocalProvider()
      const instruction = 'Format ulang untuk email eksekutif kepada CEO'
      const result = await local.generateNotes({
        transcript: 'Diskusi rencana ekspansi kantor cabang baru.',
        instruction,
        language: 'id',
      })

      expect(result.enhanced).toContain(`Catatan Penyesuaian: ${instruction}`)
    })
  })

  // TC-3.4: Keamanan & Enkripsi API Key
  describe('TC-3.4: Keamanan & Enkripsi API Key (Safe Storage & Log Redaction)', () => {
    it('encrypts API key so it is not stored as plain text on disk', () => {
      const rawKey = 'sk-proj-1234567890abcdefghijklmnopqrstuvwxyz'
      const encrypted = encryptApiKey(rawKey)

      expect(encrypted).not.toBe(rawKey)
      expect(encrypted.length).toBeGreaterThan(0)

      const decrypted = decryptApiKey(encrypted)
      expect(decrypted).toBe(rawKey)
    })

    it('masks API keys properly for safe UI presentation', () => {
      const key = 'sk-ant-api03-123456789abcdefghijkl'
      const masked = maskApiKey(key)

      expect(masked).toBe('sk-a••••••••ijkl')
      expect(masked).not.toContain('123456789')

      expect(maskApiKey('')).toBe('')
      expect(maskApiKey('12345')).toBe('••••••••')
    })

    it('redacts sensitive API keys from application logs', () => {
      const logWithOpenAi = 'Error calling https://api.openai.com: Bearer sk-1234567890abcdef1234567890'
      const sanitizedOpenAi = sanitizeLog(logWithOpenAi)
      expect(sanitizedOpenAi).not.toContain('sk-1234567890')
      expect(sanitizedOpenAi).toContain('[REDACTED_OPENAI_KEY]')

      const logWithGemini = 'Request to Gemini failed: key=AIzaSyD123456789012345678901234567890123'
      const sanitizedGemini = sanitizeLog(logWithGemini)
      expect(sanitizedGemini).not.toContain('AIzaSyD1234567890')
      expect(sanitizedGemini).toContain('[REDACTED_GEMINI_KEY]')

      const logWithClaude = 'Anthropic client init: sk-ant-api03-1234567890abcdef123456'
      const sanitizedClaude = sanitizeLog(logWithClaude)
      expect(sanitizedClaude).not.toContain('sk-ant-api03')
      expect(sanitizedClaude).toContain('[REDACTED_CLAUDE_KEY]')
    })

    it('AiKeyStore manages encrypted keys without exposing them in public config', () => {
      const store = new AiKeyStore(':memory:')
      store.setApiKey('openai', 'sk-test-secret-key-12345')

      const publicConfig = store.getPublicConfig()
      expect(publicConfig.hasKey.openai).toBe(true)
      expect(publicConfig.maskedKeys.openai).toContain('••••••••')
      expect(publicConfig.maskedKeys.openai).not.toBe('sk-test-secret-key-12345')

      // Internal getter retrieves decrypted key
      expect(store.getDecryptedKey('openai')).toBe('sk-test-secret-key-12345')

      store.clearApiKey('openai')
      expect(store.getPublicConfig().hasKey.openai).toBe(false)
    })
  })

  // TC-3.5: Uji Smart Fallback Otomatis
  describe('TC-3.5: Smart Fallback Otomatis saat Cloud Error / Offline', () => {
    it('gracefully falls back to LocalProvider when Cloud AI throws 429 Quota Exceeded error', async () => {
      const manager = new AIProviderManager({
        mode: 'cloud',
        activeProvider: 'gemini',
        keys: { gemini: 'fake-quota-exhausted-key' },
      })

      // Mock Gemini to throw 429 Quota Exceeded
      const gemini = manager.getProvider('gemini') as GeminiProvider
      vi.spyOn(gemini, 'generateNotes').mockRejectedValueOnce(
        new Error('Gemini API error (429): RESOURCE_EXHAUSTED / Quota exceeded for model')
      )

      const result = await manager.generateNotes({
        transcript: 'Pembahasan migrasi server ke kubernetes.',
        language: 'id',
        attendees: ['DevOps Lead', 'Backend Engineer'],
      })

      // Did not crash!
      expect(result).toBeDefined()
      expect(result.fallbackUsed).toBe(true)
      expect(result.provider).toBe('local')
      expect(result.error).toContain('RESOURCE_EXHAUSTED')
      expect(result.enhanced).toContain('### Ringkasan Eksekutif')
      expect(result.enhanced).toContain('### Pokok Keputusan (Key Decisions)')
    })

    it('gracefully falls back to LocalProvider when Cloud AI experiences network disconnection', async () => {
      const manager = new AIProviderManager({
        mode: 'cloud',
        activeProvider: 'openai',
        keys: { openai: 'valid-looking-key' },
      })

      // Mock OpenAI to throw network disconnected error
      const openai = manager.getProvider('openai') as OpenAIProvider
      vi.spyOn(openai, 'generateNotes').mockRejectedValueOnce(
        new TypeError('Failed to fetch: ENOTFOUND api.openai.com')
      )

      const result = await manager.generateNotes({
        transcript: 'Evaluasi performa database kuartal ini.',
        language: 'id',
      })

      expect(result.fallbackUsed).toBe(true)
      expect(result.provider).toBe('local')
      expect(result.error).toContain('ENOTFOUND')
      expect(result.enhanced).toContain('### Ringkasan Eksekutif')
    })

    it('automatically falls back to local title generation when Cloud AI fails', async () => {
      const manager = new AIProviderManager({
        mode: 'cloud',
        activeProvider: 'claude',
        keys: { claude: 'some-key' },
      })

      const claude = manager.getProvider('claude') as ClaudeProvider
      vi.spyOn(claude, 'generateTitle').mockRejectedValueOnce(new Error('Connection timeout'))

      const title = await manager.generateTitle({
        transcript: 'Speaker A: Rapat evaluasi pipeline CI CD dan deployment.',
        language: 'id',
      })

      expect(title).toBeDefined()
      expect(title.length).toBeGreaterThan(0)
    })
  })
})
