export type ShowcaseMeeting = {
  id: string;
  title: string;
  started_at: number;
  ended_at: number;
  app: string;
  language: string;
  audioUrl?: string;
  duration_ms: number;
  attendees: Array<{ name: string; email: string }>;
  notes: {
    enhanced: string;
    mine: string;
  };
  transcripts: Array<{
    id: number;
    speaker: string;
    role?: string;
    track: 'me' | 'them';
    start_ms: number;
    end_ms: number;
    text: string;
  }>;
};

export const SHOWCASE_MEETING: ShowcaseMeeting = {
  id: 'showcase-demo',
  title: 'Contoh Showcase: Rapat Koordinasi Produk & Sprint Q3',
  started_at: Date.now() - 3600000,
  ended_at: Date.now() - 3600000 + 37290,
  app: 'Google Meet',
  language: 'Bilingual (ID & EN)',
  audioUrl: '/audio/showcase.wav',
  duration_ms: 37290,
  attendees: [
    { name: 'Budi Santoso (Product Manager)', email: 'budi@cakapp.ai' },
    { name: 'Sarah Wijaya (Tech Lead)', email: 'sarah@cakapp.ai' },
  ],
  notes: {
    enhanced: `### Ringkasan Eksekutif
Rapat koordinasi mingguan tim produk dan engineering membahas performa transkripsi model Whisper lokal serta alur sinkronisasi cloud dua arah. Evaluasi membuktikan bahwa transkripsi suara di komputer lokal berjalan lancar dan akurat mengenali percakapan campuran (Bahasa Indonesia & Bahasa Inggris).

### Pokok Keputusan (Key Decisions)
1. **Model Whisper Lokal Bilingual**: Mode multi-bahasa terbukti efektif menangkap istilah teknis bahasa Inggris ("Whisper local transcription", "action items", "deployment to production") tanpa kesalahan eja.
2. **Sinkronisasi Otomatis**: Semua data notulen dan transkrip per pembicara langsung disinkronkan ke portal cloud Neon secara instan setelah panggilan selesai.
3. **Penyajian Web Responsif**: Dasbor web menyajikan intisari notulen dan transkrip interaktif yang tersinkron langsung dengan rekaman audio asli.

### Daftar Tugas & Tindak Lanjut (Action Items)
- [ ] **Sarah (Tech Lead)**: Siapkan jadwal deployment to production untuk rilis model Whisper lokal dan modul sinkronisasi database.
- [ ] **Budi (Product Manager)**: Monitor keterbacaan ringkasan eksekutif dan validasi akurasi pembagian track pembicara (Mic vs Speaker).`,
    mine: 'Rapat koordinasi produk Q3: Uji Whisper bilingual, sinkronisasi cloud, dan penampil notulen web.',
  },
  transcripts: [
    {
      id: 1,
      speaker: 'Budi Santoso',
      role: 'Product Manager',
      track: 'me',
      start_ms: 0,
      end_ms: 10500,
      text: 'Halo selamat pagi tim. Welcome to our weekly product sync meeting. Agenda kita adalah review Whisper local transcription dan follow up action items.',
    },
    {
      id: 2,
      speaker: 'Sarah Wijaya',
      role: 'Tech Lead',
      track: 'them',
      start_ms: 10500,
      end_ms: 22000,
      text: 'Morning Budi. From engineering, the bilingual Whisper model is running smoothly on local CPU. All transcripts and executive notes sync directly to our cloud portal.',
    },
    {
      id: 3,
      speaker: 'Budi Santoso',
      role: 'Product Manager',
      track: 'me',
      start_ms: 22000,
      end_ms: 30500,
      text: 'Sangat bagus. Tolong pastikan web dashboard menampilkan action items dan transkrip per pembicara dengan akurat.',
    },
    {
      id: 4,
      speaker: 'Sarah Wijaya',
      role: 'Tech Lead',
      track: 'them',
      start_ms: 30500,
      end_ms: 37290,
      text: 'Understood Budi. All action items and deployment to production are scheduled.',
    },
  ],
};
