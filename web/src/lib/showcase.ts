export type ShowcaseMeeting = {
  id: string;
  title: string;
  started_at: number;
  ended_at: number;
  app: string;
  language: string;
  attendees: Array<{ name: string; email: string }>;
  notes: {
    enhanced: string;
    mine: string;
  };
  transcripts: Array<{
    id: number;
    speaker: string;
    track: 'me' | 'them';
    start_ms: number;
    end_ms: number;
    text: string;
  }>;
};

export const SHOWCASE_MEETING: ShowcaseMeeting = {
  id: 'showcase-demo',
  title: 'Contoh Showcase: Rapat Koordinasi Produk & Sprint Q3',
  started_at: Date.now() - 3600000 * 2,
  ended_at: Date.now() - 3600000 * 2 + 1800000, // 30 mins
  app: 'Google Meet',
  language: 'Bilingual (ID & EN)',
  attendees: [
    { name: 'Budi Santoso', email: 'budi@cakapp.ai' },
    { name: 'Sarah Wijaya', email: 'sarah@cakapp.ai' },
    { name: 'Dimas Pratama', email: 'dimas@cakapp.ai' },
  ],
  notes: {
    enhanced: `### Ringkasan Eksekutif
Rapat koordinasi mingguan membahas kesiapan rilis fitur Whisper lokal dan sinkronisasi database cloud dua arah. Tim menyepakati bahwa performa transkripsi di komputer lokal sudah sangat cepat tanpa latensi server, dan integrasi cloud akan fokus pada kenyamanan akses tim.

### Pokok Keputusan (Key Decisions)
1. **Fitur Rekam Native Tanpa Bot**: Perekaman audio desktop tetap berfokus pada tangkapan langsung dari OS (WASAPI untuk Windows) agar peserta panggilan tidak merasa terganggu dengan adanya bot meeting.
2. **Kamus Jargon Bilingual**: Istilah bisnis dan teknis dalam bahasa Inggris diizinkan masuk ke kamus jargon internal agar transkripsi Whisper tetap akurat saat percakapan bercampur bahasa (code-switching).
3. **Penyimpanan Transkrip**: Notulen dan ringkasan eksekutif disinkronkan ke cloud, sementara rekaman audio mentah tetap tersimpan privat di perangkat lokal masing-masing pengguna.

### Daftar Tugas & Tindak Lanjut (Action Items)
- [ ] **Sarah (Tech Lead)**: Finalisasi skema database PostgreSQL di Neon dan pastikan Row-Level Security aktif sebelum deployment ke staging.
- [ ] **Dimas (Frontend)**: Selesaikan penampil notulen di web portal agar anggota tim bisa langsung membaca rangkuman tanpa perlu menginstall aplikasi desktop.
- [ ] **Budi (PM)**: Follow up jadwal testing dengan tim sales dan finance untuk uji coba transkripsi bilingual di panggilan Zoom besok pagi.`,
    mine: 'Rapat koordinasi mingguan sprint Q3. Fokus utama: akurasi Whisper bilingual dan sinkronisasi notulen ke portal web.',
  },
  transcripts: [
    {
      id: 1,
      speaker: 'Budi Santoso (Product Manager)',
      track: 'me',
      start_ms: 0,
      end_ms: 12500,
      text: 'Halo selamat pagi semuanya. Terima kasih sudah join di sync meeting hari ini. Agenda kita ada dua: pertama review hasil evaluasi Whisper lokal, dan kedua follow up integrasi cloud sync untuk notulen.',
    },
    {
      id: 2,
      speaker: 'Sarah Wijaya (Tech Lead)',
      track: 'them',
      start_ms: 13000,
      end_ms: 27500,
      text: 'Pagi Mas Budi. Dari tim engineering, performa Whisper di lokal sudah stabil banget. Kita uji coba percakapan campuran bahasa Indonesia dan istilah teknis bahasa Inggris, transkripsinya tetap akurat berkat custom jargon prompt yang kita pasang.',
    },
    {
      id: 3,
      speaker: 'Dimas Pratama (Frontend Engineer)',
      track: 'them',
      start_ms: 28000,
      end_ms: 41000,
      text: 'Betul, kemarin kita test kata-kata seperti "action items", "deployment ke production", dan "standup mingguan", semuanya tertranskrip sempurna tanpa salah eja.',
    },
    {
      id: 4,
      speaker: 'Budi Santoso (Product Manager)',
      track: 'me',
      start_ms: 41500,
      end_ms: 54000,
      text: 'Bagus sekali. Nah, untuk portal web, tolong pastikan notulen dan action items bisa dibaca rekan kerja lewat browser tanpa mereka harus download app desktop ya. Itu jadi killer feature kita.',
    },
    {
      id: 5,
      speaker: 'Sarah Wijaya (Tech Lead)',
      track: 'them',
      start_ms: 54500,
      end_ms: 68000,
      text: 'Siap Mas. Data rapat otomatis ter-push ke Neon PostgreSQL dengan enkripsi aman. Begitu rapat ditutup di PC, notulen langsung muncul di dashboard web dalam hitungan detik.',
    },
  ],
};
