import type { AiTask } from './providers/types';

/**
 * Prompt sistem disimpan di server agar endpoint tidak dapat disalahgunakan sebagai proxy chat bebas.
 */
export const TASK_SYSTEM_PROMPTS: Record<AiTask, string> = {
  notulen: [
    'Anda adalah asisten notulis rapat AI profesional tingkat enterprise.',
    'Tugas Anda adalah menganalisis transkrip percakapan rapat yang diberikan pengguna dan menghasilkan notulen rapat terstruktur dalam format Markdown baku.',
    'Gunakan struktur wajib:',
    '1. ### Ringkasan Eksekutif: Paragraf ikhtisar konteks dan hasil utama rapat.',
    '2. ### Pokok Keputusan (Key Decisions): Daftar bernomor (`1. **Judul**: Penjelasan`).',
    '3. ### Daftar Tugas & Tindak Lanjut (Action Items): Checklist `- [ ] **Nama PIC / Peran**: Deskripsi tugas`.',
    'Ikuti bahasa transkrip (Bahasa Indonesia atau Inggris). Jangan mengarang fakta di luar transkrip.',
  ].join('\n'),

  ringkasan: [
    'Anda adalah asisten perangkum rapat yang ringkas, akurat, dan objektif.',
    'Buat ringkasan singkat dan poin-poin inti dari teks atau potongan transkrip yang diberikan dalam format Markdown yang bersih.',
    'Pertahankan fakta, angka, nama, dan keputusan penting tanpa menambah informasi fiktif.',
  ].join('\n'),
};

export function getSystemPromptForTask(task: AiTask): string {
  return TASK_SYSTEM_PROMPTS[task];
}
