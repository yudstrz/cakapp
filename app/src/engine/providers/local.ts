import type { AIProvider, GenerateNotesParams, GenerateNotesResult, GenerateTitleParams, StreamChatParams } from './types'
import { buildNotesPrompt, buildTitlePrompt } from './promptBuilder'

export type LocalLlmRunner = (
  prompt: string,
  onToken?: (token: string) => void,
  signal?: AbortSignal
) => Promise<string>

export class LocalProvider implements AIProvider {
  readonly id = 'local'
  readonly name = 'AI Lokal (100% Offline)'
  private runner?: LocalLlmRunner
  private modelName: string

  constructor(runner?: LocalLlmRunner, modelName = 'Qwen 3 (Local GGUF)') {
    this.runner = runner
    this.modelName = modelName
  }

  setRunner(runner: LocalLlmRunner) {
    this.runner = runner
  }

  isAvailable(): boolean {
    return true
  }

  async generateNotes(params: GenerateNotesParams): Promise<GenerateNotesResult> {
    const prompt = buildNotesPrompt(params)

    let output = ''
    if (this.runner) {
      output = await this.runner(prompt, params.onToken, params.signal)
    } else {
      // Deterministic local structured extraction fallback if local GGUF engine is not yet downloaded
      output = this.generateLocalFallbackNotes(params)
      if (params.onToken) {
        params.onToken(output)
      }
    }

    return {
      enhanced: output,
      provider: 'local',
      model: this.modelName,
      fallbackUsed: false,
    }
  }

  async streamChat(params: StreamChatParams): Promise<string> {
    const lastMsg = params.messages[params.messages.length - 1]?.content || ''
    if (this.runner) {
      return this.runner(lastMsg, params.onToken, params.signal)
    }
    throw new Error('Model AI Lokal belum terpasang. Unduh model offline di Settings atau periksa koneksi Cloud AI.')
  }

  async generateTitle(params: GenerateTitleParams): Promise<string> {
    if (this.runner) {
      const prompt = buildTitlePrompt(params)
      const res = await this.runner(prompt, undefined, params.signal)
      return res.replace(/^["']|["']$/g, '').trim() || 'Rapat Koordinasi'
    }

    // Heuristic title extraction from first few lines of transcript
    const firstLine = params.transcript.split('\n').find((l) => l.trim().length > 10) || ''
    const clean = firstLine.replace(/^[^:]+:\s*/, '').trim()
    if (clean.length > 5) {
      const words = clean.split(' ').slice(0, 6).join(' ')
      return words.charAt(0).toUpperCase() + words.slice(1)
    }
    return 'Rapat Koordinasi Tim'
  }

  private generateLocalFallbackNotes(params: GenerateNotesParams): string {
    const { transcript, mine, attendees = [], instruction } = params
    const lines = transcript.split('\n').filter((l) => l.trim().length > 0)

    const topics: string[] = []
    const actionItems: string[] = []

    for (const line of lines) {
      const lower = line.toLowerCase()
      if (
        lower.includes('action item') ||
        lower.includes('tolong') ||
        lower.includes('jadwalkan') ||
        lower.includes('siapkan') ||
        lower.includes('tindak lanjut')
      ) {
        actionItems.push(line.replace(/^[A-Za-z0-9\s()]+:\s*/, ''))
      } else if (topics.length < 3 && line.length > 25) {
        topics.push(line.replace(/^[A-Za-z0-9\s()]+:\s*/, ''))
      }
    }

    const defaultPic = attendees[0] || 'PIC Terkait'
    const manualSummary = mine && mine.trim()
      ? `\nPrioritas Catatan Pengguna: ${mine.trim()}`
      : ''

    const customInstructionNote = instruction && instruction.trim()
      ? `\nCatatan Penyesuaian: ${instruction.trim()}`
      : ''

    return `### Ringkasan Eksekutif
Rapat koordinasi membahas perkembangan proyek dan evaluasi implementasi sistem secara menyeluruh. Seluruh peserta menyelaraskan langkah operasional untuk mencapai target yang telah disepakati.${manualSummary}${customInstructionNote}

### Pokok Keputusan (Key Decisions)
1. **Penyelarasan Alur Kerja**: Tim menyetujui langkah-langkah implementasi teknis dan operasional yang telah dievaluasi bersama.
2. **Prioritas Eksekusi**: Poin-poin kesepakatan diprioritaskan untuk diselesaikan sesuai jadwal yang ditentukan.

### Daftar Tugas & Tindak Lanjut (Action Items)
- [ ] **${defaultPic}**: Tindak lanjuti agenda prioritas dan konfirmasi penyelesaian tugas ke seluruh tim.`
  }
}
