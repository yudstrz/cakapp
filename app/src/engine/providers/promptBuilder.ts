import type { GenerateNotesParams, GenerateTitleParams } from './types'

export function buildNotesPrompt(params: GenerateNotesParams): string {
  const { transcript, mine, language = 'id', instruction, attendees = [], title } = params

  const langInstruction =
    language.toLowerCase().startsWith('en')
      ? 'Tulis seluruh notulen dalam Bahasa Inggris yang profesional.'
      : 'Tulis seluruh notulen dalam Bahasa Indonesia yang lugas dan profesional.'

  const sections: string[] = [
    'Anda adalah asisten notulis rapat AI profesional tingkat enterprise.',
    'Tugas Anda adalah menganalisis percakapan rapat dan menghasilkan notulen rapat terstruktur dengan format Markdown yang baku.',
    '',
    langInstruction,
    '',
    '### STRUKTUR WAJIB:',
    '1. ### Ringkasan Eksekutif: Paragraf ikhtisar yang memuat konteks dan hasil utama rapat.',
    '2. ### Pokok Keputusan (Key Decisions): Daftar bernomor (1., 2., 3.) berisi keputusan penting dengan format: `1. **Judul Keputusan**: Penjelasan ringkas`.',
    '3. ### Daftar Tugas & Tindak Lanjut (Action Items): Daftar checklist dengan format persis: `- [ ] **Nama PIC / Peran**: Deskripsi tugas yang harus diselesaikan`. Jika keputusan rapat memiliki implikasi tindak lanjut namun nama PIC tidak disebut eksplisit, cantumkan peran terkait (mis. `Manajemen / Tim Terkait`). Jika transkrip murni informasi tanpa tugas, tulis satu poin `- [ ] **Catatan**: Tidak ada daftar tugas atau tindak lanjut spesifik dalam transkrip.` (jangan pernah meninggalkan bagian ini kosong).',
    '',
  ]

  if (title) {
    sections.push(`Judul Pertemuan: ${title}`)
  }

  if (attendees.length > 0) {
    sections.push(`Peserta Rapat: ${attendees.join(', ')}`)
  }

  if (mine && mine.trim()) {
    sections.push(
      '',
      '=== CATATAN MANUAL PENGGUNA (PRIORITAS TINGGI) ===',
      'Pengguna secara manual mengetik poin-poin penting berikut selama rapat. Poin ini MENCERMINKAN FOKUS UTAMA dan HARUS DIPRIORITASKAN ke dalam ringkasan dan keputusan:',
      mine.trim(),
      '================================================='
    )
  }

  if (instruction && instruction.trim()) {
    sections.push(
      '',
      '=== INSTRUKSI KHUSUS ("WRITE AGAIN") ===',
      `Terapkan instruksi kustom ini pada format dan gaya penulisan akhir: ${instruction.trim()}`,
      '========================================='
    )
  }

  sections.push(
    '',
    '=== TRANSKRIP PERCAKAPAN RAPAT ===',
    transcript.trim(),
    '=================================='
  )

  return sections.join('\n')
}

export function buildTitlePrompt(params: GenerateTitleParams): string {
  const { transcript, language = 'id' } = params
  const langText = language.toLowerCase().startsWith('en') ? 'English' : 'Bahasa Indonesia'
  return [
    'Anda adalah asisten notulis AI.',
    `Buatkan 1 judul rapat yang ringkas, spesifik, dan profesional dalam ${langText} (maksimal 6-8 kata) berdasarkan kutipan transkrip berikut.`,
    'Hanya balas dengan judul saja tanpa tanda kutip, tanpa kata pengantar.',
    '',
    'Kutipan Transkrip:',
    transcript.slice(0, 3000),
  ].join('\n')
}
