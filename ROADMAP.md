# Dokumentasi Fitur & Roadmap Pengembangan Terintegrasi 5 Hari

## Cakapp: Dari Local-First ke Hybrid Multi-User Enterprise Platform

Dokumen ini adalah **panduan utama arsitektur, integrasi fitur, jadwal pengembangan 5 hari (Selasa – Senin), dan skenario pengujian perusahaan (*Enterprise QA Testing*)**.

Seluruh **fitur yang sudah ada (eksisting) di dalam codebase Cakapp** telah **dimasukkan dan dipetakan secara logis ke dalam setiap hari pengembangan**. Dengan demikian, Anda dapat langsung menguji (*testing*) dan memverifikasi kesiapan setiap fitur eksisting bersamaan dengan fitur baru yang dibangun sesuai skenario nyata di perusahaan Anda.

---

## 1. Bentuk Aplikasi & Strategi Dukungan Platform (Model Hybrid Mirip Fathom: Desktop App + Web Portal)

Platform ini mengadopsi model arsitektur hybrid modern **persis seperti Fathom Video (fathom.video)** atau Fireflies: memadukan keunggulan **Aplikasi Desktop Mandiri** untuk perekaman audio sistem tanpa bot dengan **Website Portal (Web App)** untuk login, penayangan, berbagi notulen, dan kolaborasi tim dari mana saja.

```text
+--------------------------------------------------------------------------------------------------+
|                                        EKOSISTEM CAKAPP                                          |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|   [ PILAR 1: DESKTOP APP (PC) ]                      [ PILAR 2: WEBSITE PORTAL (WEB & HP) ]      |
|   (Windows, macOS, Linux)                            (Browser Desktop, Laptop, Android & iOS)    |
|   * The Silent Recorder & AI Engine                  * The Cloud Hub & Collaboration Viewer      |
|   ---------------------------------                  ---------------------------------------     |
|   - Rekam audio sistem (WASAPI/CoreAudio)            - Login & Dashboard riwayat rapat terpusat  |
|   - Deteksi Zoom/Meet/Teams otomatis                 - Pemutar audio + transkrip karaoke (Fathom)|
|   - Transkripsi suara Whisper lokal                  - Baca AI Summary & Checklist Action Items  |
|   - Floating Mini-Widget saat panggilan              - Shareable Public/Team Link (tanpa install)|
|   - AI on-device (offline) / Cloud API               - Tanya AI (Ask AI) lintas riwayat rapat    |
|   - Auto-sync 2 arah ke Neon Postgres DB             - Akses mobile responsif via browser HP     |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

---

### A. Pilar 1: Aplikasi Desktop Mandiri (Windows, macOS, Linux) — *"The Engine & Silent Recorder"*

Aplikasi desktop adalah jantung penangkap data yang di-download dan di-install di komputer pengguna (PC/Laptop).

**Mengapa harus ada aplikasi desktop?**

1. **Perekaman Audio Sistem Tanpa Bot (*No-Bot Recording*):** Website biasa dan ekstensi browser terkunci di dalam *sandbox browser* sehingga **tidak bisa** merekam suara lawan bicara dari aplikasi lain (seperti Zoom, Microsoft Teams, Slack Huddle, Discord) kecuali pengguna melakukan *share screen*. Aplikasi desktop memiliki akses langsung ke driver audio sistem operasi (WASAPI di Windows, CoreAudio di Mac, PulseAudio/PipeWire di Linux).
2. **Tidak Ada Bot Mengganggu di Ruang Rapat:** Tidak perlu mengundang bot pihak ketiga (seperti *"Cakapp Notetaker Bot"*) yang sering kali canggung, memicu kecurigaan peserta lain, atau bahkan diblokir oleh admin keamanan IT perusahaan.
3. **Identifikasi Nama Pembicara Otomatis (*Speaker Diarization*):** Aplikasi desktop memanfaatkan OS Accessibility API untuk membaca langsung nama orang yang sedang berbicara di jendela panggilan Zoom/Meet/Teams tanpa perlu bot.
4. **Komputasi AI Cepat & Privat:** Model transkripsi suara Whisper dan LLM GGUF (Qwen 3 / Gemma 4) dapat dijalankan 100% lokal pada CPU/GPU/NPU tanpa mengirim audio sensitif ke luar jika perusahaan menginginkan privasi mutlak.
5. **Floating Mini Widget:** Widget melayang yang praktis di pojok layar saat rapat untuk kendali Mute, Pause, Resume, Bookmark, atau mengetik catatan kilat.

**Format Distribusi PC:**

* **Windows:** File installer executable `.exe` (Windows 10/11 x64).
* **macOS:** File installer `.dmg` (Universal binary: Apple Silicon M1-M4 & Intel).
* **Linux:** File paket `.AppImage` (Ubuntu 22.04+ / distribusi modern).

---

### B. Pilar 2: Website Portal / Cloud Web App (Mirip Fathom) — *"The Cloud Hub & Viewer"*

Website portal cloud (misal `https://app.cakapp.com` atau domain kantor Anda) di-hosting di **Vercel** menggunakan **Next.js (App Router)** sebagai tempat pengguna dan seluruh anggota tim login melalui browser internet apa saja (Chrome, Safari, Edge, Firefox) untuk mengakses hasil rekaman dan mendownload aplikasi.

#### 1. Rekomendasi Framework & Infrastruktur Hosting

* **Framework Utama (Sangat Direkomendasikan): Next.js 15 (App Router, React 19, TypeScript, Tailwind CSS)**
  * **Hosting:** **Vercel** (Edge Network Global, Serverless Functions, 1-Click Git Deployment).
  * **Mengapa Next.js di Vercel adalah Pilihan Terbaik?**
    1. **Kompatibel Sempurna dengan Neon PostgreSQL:** Driver `@neondatabase/serverless` yang kita gunakan didesain khusus oleh tim Neon untuk bekerja native di atas Vercel Serverless/Edge Functions tanpa batas koneksi pool atau masalah timeout.
    2. **Pratinjau Link Dinamis (*Dynamic OpenGraph Cards*):** Ketika tautan rapat (`cakapp.com/share/:id`) dibagikan ke WhatsApp, Slack, atau LinkedIn, Next.js dapat membuat gambar thumbnail dan ringkasan dinamis secara otomatis via `@vercel/og`.
    3. **Server Components & Streaming:** Halaman ringkasan rapat dan ribuan baris transkrip dapat di-stream seketika dengan kecepatan tinggi tanpa membebani browser pengguna.
    4. **Monorepo Ready:** Next.js dapat hidup berdampingan di folder `web/` di dalam monorepo pnpm bersama aplikasi desktop `app/`, sehingga tipe data TypeScript rapat (`Meeting`, `Transcript`, `Notes`) dapat dibagikan (*shared*) tanpa duplikasi kode.
* **Opsi Framework Alternatif:**
  * *Remix / React Router v7:* Sangat baik untuk penanganan form dan data fetching, namun ekosistem integrasi Vercel dan pembuatan pratinjau sosial (OG preview) jauh lebih matang di Next.js.
  * *Astro / SvelteKit:* Sangat cepat untuk blog/dokumentasi statis, namun untuk aplikasi kaya fitur interaktif (pemutar audio sinkron karaoke, editor teks notulen kaya TipTap, dashboard multi-user terautentikasi), ekosistem React/Next.js jauh lebih unggul dan mudah dipelihara.

#### 2. Fitur Pusat Download Aplikasi Desktop di Website (`/` dan `/download`)

Website portal tidak hanya berfungsi sebagai dashboard, tetapi juga sebagai **Pusat Distribusi Resmi Aplikasi Desktop**:

1. **Smart OS Auto-Detection:** Saat pengunjung membuka website dari komputer, sistem otomatis mendeteksi sistem operasi mereka dan menampilkan tombol unduh utama yang tepat:
   * Pengguna Windows $\rightarrow$ Tombol menonjol: **"Download for Windows (.exe)"**
   * Pengguna Mac $\rightarrow$ Tombol menonjol: **"Download for macOS (.dmg / Apple Silicon & Intel)"**
   * Pengguna Linux $\rightarrow$ Tombol menonjol: **"Download for Linux (.AppImage)"**
2. **Pilihan Platform Lain:** Dropdown untuk mendownload installer OS lain atau versi portable jika dibutuhkan.
3. **Banner Download di Dalam Dashboard:** Pengguna yang sedang membuka web dashboard di browser akan melihat banner cerdas: *"Ingin merekam panggilan Zoom/Teams otomatis tanpa bot? Unduh Aplikasi Desktop Cakapp"* lengkap dengan tautan unduh instan.
4. **Petunjuk Pemasangan 3 Langkah:** Panduan visual cepat (1. Unduh $\rightarrow$ 2. Buka Installer $\rightarrow$ 3. Masuk ke Panggilan).

#### 3. Fitur Penayangan & Kolaborasi Web Portal (Mirip Fathom)

1. **Login & Akses dari Mana Saja:** Pengguna tidak harus selalu berada di depan laptop kerja utamanya untuk membaca hasil rapat. Cukup buka website di laptop lain, tablet, atau smartphone, lalu login.
2. **Interactive Audio & Transcript Player (Mirip Fathom):**
   * Pemutar rekaman audio yang tersinkronisasi langsung dengan teks transkrip.
   * Kata-kata yang sedang diucapkan otomatis tersorot (*karaoke-style auto highlight*).
   * Pengguna cukup mengklik kalimat apa pun di transkrip untuk langsung melompat (*jump to second*) ke momen audio tersebut diputar.
3. **Dashboard Ringkasan AI & Action Items:**
   * Menampilkan Ringkasan Eksekutif, Pokok Keputusan, dan Daftar Tugas (*Action Items*) lengkap dengan nama penanggung jawab (PIC) yang diekstrak oleh AI.
4. **Tautan Berbagi Publik & Tim (*Shareable Meeting Links*):**
   * Persis seperti fitur terbaik di Fathom: Pengguna dapat mengklik tombol **"Share"** dan mendapatkan link web (contoh: `cakapp.com/share/m-789xyz`).
   * Tautan ini dapat dikirim ke peserta rapat, atasan, atau klien via WhatsApp, Slack, atau Email. Penerima link dapat langsung membuka rekaman, membaca ringkasan, dan mendengarkan audio di browser mereka **tanpa perlu mendownload atau menginstall aplikasi desktop sama sekali!**
5. **Tanya AI Web (Ask AI / Meeting Intelligence):**
   * Kotak dialog chat di website tempat pengguna bisa bertanya: *"Apa yang disepakati dengan Klien A terkait diskon harga minggu lalu?"*, dan AI menjawab beserta link kutipan rapat terkait.
6. **Workspace Kolaborasi Tim (*Team Workspaces*):**
   * Folder tim bersama di mana seluruh rapat anggota divisi (Sales, Engineering, Direksi) otomatis terkumpul rapi sesuai hak akses.

---

### C. Strategi Dukungan Android & iOS (HP / Mobile) — Melalui Web Portal Responsif (PWA)

Untuk pengguna smartphone (Android & iPhone), kita menyediakan pengalaman web mobile yang cepat dan responsif:

| Kebutuhan di HP (Android / iOS) | Status | Solusi & Penjelasan Teknis |
| :--- | :---: | :--- |
| **Membaca Notulen, Action Items, & Transkrip di HP** | **BISA (100% Didukung)** | Buka Website Portal di Chrome (Android) atau Safari (iPhone), login, dan seluruh riwayat rapat yang direkam di PC langsung tersaji dalam tata letak mobile yang rapi. |
| **Mendengarkan Pemutaran Audio Rekaman di Perjalanan** | **BISA (100% Didukung)** | Audio player berbasis web dapat memutar rekaman audio rapat dari Cloud Storage langsung di browser HP pengguna saat sedang di perjalanan/mobil. |
| **Membuka Tautan Rapat yang Dibagikan Rekan Kerja** | **BISA (100% Didukung)** | Klik tautan shareable dari pesan WhatsApp/Slack di HP; halaman ringkasan rapat langsung terbuka instan di browser HP tanpa install apa pun. |
| **Merekam Rapat Tatap Muka (*In-Person Meeting*)** | **BISA (100% Didukung)** | Saat rapat tatap muka langsung di kafe atau ruang kantor, pengguna cukup menekan tombol "Rekam Suara" di website HP. Mikrofon HP akan menangkap percakapan dan mengunggahnya ke Cloud DB untuk ditranskripsi dan dirangkum. |
| **Merekam Panggilan Telepon / WhatsApp / Zoom di HP** | **TIDAK BISA (Dibatasi OS HP)** | Apple (iOS) dan Google (Android) menerapkan aturan keamanan privasi ketat (*Sandbox Audio Isolation*): aplikasi pihak ketiga **dilarang menyadap/merekam audio internal dari aplikasi panggilan lain**. Semua recorder panggilan di HP yang merekam WhatsApp/Zoom membutuhkan bot server eksternal yang diundang ke panggilan. Oleh karena itu, perekaman panggilan online tetap berpusat pada **Aplikasi Desktop PC**. |

---

## 2. Alur Logika Integrasi 5 Hari (Siklus Kerja Rapat Perusahaan)

Agar pengujian skenario perusahaan Anda berjalan runtut dan sistematis, seluruh fitur dikelompokkan ke dalam 5 fase rantai nilai (*value chain*) rapat bisnis:

```text
[HARI 1: SELASA] Input & Identitas      --> Siapa yang rapat & bagaimana audio rapat ditangkap di PC?
[HARI 2: RABU]   Transkripsi & Sinkron  --> Ubah suara jadi teks + simpan lokal & cloud (Neon DB) dua arah
[HARI 3: KAMIS]  Kecerdasan AI & Notes  --> Rangkum intisari, tugas, keputusan (Local LLM + Cloud AI)
[HARI 4: JUMAT]  Web Portal & Share     --> Website Fathom-like: Dashboard, Shareable Link, RAG, & Mobile HP
[HARI 5: SENIN]  Hardening & Rilis PC   --> Audit privasi, uji skenario E2E perusahaan, & build installer .exe
```

---

## 3. Arsitektur Target: Hybrid Multi-User Platform (Desktop + Web Portal)

```mermaid
flowchart TD
    subgraph PCClient ["1. Desktop App (PC: Win / Mac / Linux) - The Recorder"]
        UI["UI Layer & Settings (React 19)"]
        Capture["Audio Capture (WASAPI / CoreAudio)"]
        Whisper["Local Whisper ASR (whisper.cpp)"]
        SQLite[("Local SQLite (node:sqlite)")]
        Sync["Two-Way Sync Engine"]
        AI_Switch{"AI Switcher"}
        LocalLLM["Local LLM (node-llama-cpp)"]
        MiniWidget["Floating Mini Widget"]
    end

    subgraph WebPlatform ["2. Website Portal (Desktop Browser & Mobile HP) - Mirip Fathom"]
        WebDashboard["Web Meeting Dashboard (app.cakapp.com)"]
        InteractivePlayer["Interactive Audio & Karaoke Transcript Player"]
        ShareLinkViewer["Shareable Meeting Link Viewer (Public/Team)"]
        AskAIWeb["Ask AI Web Chatbot"]
        InPersonMic["In-Person Mobile Voice Recorder"]
    end

    subgraph CloudInfra ["3. Cloud Infrastructure & Storage"]
        Auth["Supabase / JWT Auth (Multi-Device)"]
        CloudDB[("Neon Serverless Postgres (RLS & Branching)")]
        Storage["Cloud Storage (Audio File Backup)"]
    end

    subgraph ExternalAI ["4. Cloud AI Providers (BYO API Key)"]
        OpenAI["OpenAI (GPT-4o / Mini)"]
        Gemini["Google Gemini 2.0"]
        Claude["Anthropic Claude 3.5"]
    end

    %% Desktop Connections
    Capture --> Whisper
    Whisper --> SQLite
    SQLite <--> Sync
    Sync <--> CloudDB
    UI <--> Auth
    MiniWidget <--> Capture

    SQLite --> AI_Switch
    AI_Switch -->|"Mode Offline / Local"| LocalLLM
    AI_Switch -->|"Mode Cloud (API Key)"| OpenAI
    AI_Switch -->|"Mode Cloud (API Key)"| Gemini
    AI_Switch -->|"Mode Cloud (API Key)"| Claude
    LocalLLM --> SQLite
    OpenAI --> SQLite
    Gemini --> SQLite
    Claude --> SQLite

    %% Web Platform Connections
    WebDashboard <--> CloudDB
    WebDashboard <--> Auth
    InteractivePlayer <--> CloudDB
    InteractivePlayer <--> Storage
    ShareLinkViewer <--> CloudDB
    AskAIWeb <--> CloudDB
    AskAIWeb <--> ExternalAI
    InPersonMic --> Storage
    Sync -.->|"Upload Audio Opsional"| Storage
```

---

## 4. Jadwal Pengembangan & Skenario Pengujian 5 Hari (Selasa – Senin)

---

### HARI 1: SELASA — Identitas Pengguna & Perekaman/Deteksi Panggilan Tanpa Bot

> **Alur Logika:** Sebelum rapat dimulai, sistem harus mengenali siapa pengguna yang sedang bekerja (Identitas/Akun) dan siap menangkap audio rapat dari berbagai platform tanpa memerlukan bot pihak ketiga.

#### 1. Fitur Eksisting Hari 1 yang Diuji & Diintegrasikan

* **Perekaman Audio Dual-Track (`app/src/main/capture.ts`, `app/src/main/audio.ts`):**
  * Saluran `track: me`: Suara pengguna dari mikrofon input.
  * Saluran `track: them`: Suara lawan bicara dari sistem audio/speaker OS (WASAPI/CoreAudio).
* **Deteksi Rapat Tanpa Bot (`app/src/main/detect.ts`):**
  * Otomatis mendeteksi saat aplikasi meeting aktif: Zoom, Google Meet, Microsoft Teams, Slack Huddle, Discord, Webex, dan FaceTime tanpa mengundang bot ke room.
* **Identifikasi Nama Pembicara (*Speaker Diarization* - `app/src/main/callNames`):**
  * Membaca nama peserta yang sedang berbicara langsung dari judul atau elemen window aplikasi panggilan via OS Accessibility API.
* **Pencegahan Gema Suara (*Acoustic Echo Cancellation* - `app/src/main/asr/echo.ts`):**
  * Menyaring suara speaker lawan bicara yang terpantul kembali ke mikrofon agar tidak terjadi transkripsi ganda.
* **Smart Auto-Stop (`app/src/main/detectSignals.ts`):**
  * Otomatis menghentikan perekaman saat panggilan meeting ditutup oleh pengguna.
* **Upload Audio File Manual (`app/src/main/audioUpload.ts`):**
  * Mendukung impor file rekaman rapat masa lalu dalam format MP3, WAV, atau M4A.
* **Floating Mini Widget (`app/src/main/float.ts`):**
  * Widget melayang di layar saat rapat untuk Pause, Resume, Stop, atau mengetik catatan cepat.
* **Pengaturan Profil Pengguna Eksisting (`app/src/main/settings.ts`, `preferences.ts`):**
  * Pengaturan nama lokal (`myName`) dan preferensi bahasa antarmuka.
* **Kamus Lokalisasi Bahasa Indonesia (`app/src/shared/locales/id.json`):**
  * 726 baris teks UI lengkap dalam Bahasa Indonesia.

#### 2. Fitur Baru Hari 1 yang Dibangun

1. **Integrasi SDK Database Pihak Ketiga (BaaS):**
   * Pemasangan library `@supabase/supabase-js`.
   * Konfigurasi koneksi (URL & Anon Key) melalui file `.env`.
2. **Modul Autentikasi Pengguna (`app/src/main/auth.ts`):**
   * Fungsi `signUp(email, password, nama)`, `signIn()`, `signOut()`, dan `getCurrentUser()`.
   * Penyimpanan token sesi JWT terenkripsi dengan aman di OS menggunakan `electron.safeStorage` (Windows Credential Manager / macOS Keychain).
3. **Antarmuka Login, Register, & Mode Tamu (`app/src/renderer/`):**
   * Form Login & Register terintegrasi desain aplikasi.
   * Opsi *Google OAuth Login*.
   * Tombol **"Gunakan Mode Tamu / Offline"** (agar aplikasi tetap bisa dipakai tanpa internet/akun).
4. **Penyambungan Sesi Akun dengan Metadata Rapat:**
   * Setiap sesi perekaman baru otomatis mengaitkan `user_id` pengguna yang sedang login.

#### 3. Skenario Pengujian Perusahaan Hari 1 (Enterprise QA Checklist)

* [x] **TC-1.1 (Autentikasi Karyawan):** Daftarkan akun baru menggunakan email kantor. Keluar (*Sign Out*), lalu masuk kembali (*Sign In*). Pastikan sesi login tetap tersimpan saat aplikasi ditutup dan dibuka lagi.
* [x] **TC-1.2 (Mode Tamu / Offline):** Klik "Mode Tamu". Pastikan aplikasi tetap dapat digunakan untuk merekam tanpa perlu koneksi internet atau login.
* [x] **TC-1.3 (Deteksi Otomatis & Perekaman Tanpa Bot):** Buka panggilan Zoom atau Google Meet di komputer. Pastikan Cakapp otomatis mendeteksi rapat, Floating Widget muncul, dan tombol rekam aktif tanpa ada bot aneh yang masuk ke room meeting.
* [x] **TC-1.4 (Perekaman Audio Dual-Track & Anti-Gema):** Lakukan percakapan 2 menit dengan lawan bicara. Putar kembali rekaman audio: pastikan suara mic Anda (`me`) dan suara lawan bicara (`them`) terdengar jernih tanpa gema berulang.
* [x] **TC-1.5 (Identifikasi Nama Pembicara):** Periksa apakah nama lawan bicara di Zoom/Teams terbaca otomatis di interface perekaman.
* [x] **TC-1.6 (Unggah File Audio Manual):** Unggah file rekaman rapat eksternal (MP3/WAV berdurasi 5–10 menit). Pastikan file diterima dan siap diproses ke tahap transkripsi.

#### 4. Hasil Akhir (Deliverable Hari 1)

* [x] Sistem autentikasi pengguna aktif dan aman (Supabase Auth + Session Token terenkripsi `safeStorage`).
* [x] Mode Tamu / 100% Offline Lokal terpasang jelas dengan konfirmasi privasi.
* [x] Penyambungan `userId` dengan metadata rapat di database SQLite lokal (`user_id` column).
* [x] Modul penangkap audio rapat (panggilan langsung dual-track & upload file manual) terverifikasi 100% stabil untuk berbagai aplikasi rapat perusahaan (Zoom, Teams, Meet, Slack, Webex, Discord).

---

### HARI 2: RABU — Mesin Transkripsi Suara Lokal & Sinkronisasi Database Cloud Dua Arah

> **Alur Logika:** Setelah audio tertangkap, sistem mengubah audio menjadi teks secara lokal (cepat & privat), lalu menyimpannya ke database lokal (SQLite) serta menyinkronkannya ke Database Cloud pihak ketiga agar tidak hilang dan dapat diakses dari mana saja.

#### 1. Fitur Eksisting Hari 2 yang Diuji & Diintegrasikan

* **Mesin Transkripsi Whisper.cpp & Apple SpeechAnalyzer (`app/src/main/asr/`):**
  * Transkripsi suara ke teks (*Speech-to-Text*) 100% lokal di CPU/GPU/NPU tanpa biaya API per menit.
* **Live Word Streaming (`app/src/shared/liveWords.ts`):**
  * Teks hasil transkripsi mengalir muncul secara *real-time* di layar saat peserta berbicara.
* **Dukungan 99 Bahasa & Deteksi Bahasa Otomatis (`app/src/shared/spoken.ts`):**
  * Otomatis mengenali Bahasa Indonesia, Bahasa Inggris, serta percakapan campuran (*code-switching*) yang sering terjadi di rapat kantor.
* **Custom Jargon & Glosarium Bisnis (`app/src/shared/jargon.ts`):**
  * Memungkinkan pengguna memasukkan kamus istilah khusus perusahaan, singkatan proyek, atau nama orang agar Whisper mengeja dengan tepat.
* **Embedded SQLite Database (`app/src/main/store.ts` via `node:sqlite`):**
  * Penyimpanan lokal berkecepatan tinggi di `%APPDATA%\Cakapp\cakapp.db` (Windows) tanpa perlu install server database terpisah.
* **Manajemen Folder & Personalisasi Visual (`foldersIpc.ts`, `folderAppearance.ts`):**
  * Pengelompokan rapat ke folder proyek/divisi dengan warna dan ikon kustom.
* **Rapat Lifecycle Hooks (`app/src/main/meeting.ts`):**
  * Event `onMeetingStopSaved` dan `onMeetingChange` yang memicu proses pasca-rapat.

#### 2. Fitur Baru Hari 2 yang Dibangun

1. **Skema Database Cloud PostgreSQL (Supabase / Neon):**
   * Tabel `profiles`: `id`, `email`, `full_name`, `avatar_url`, `created_at`.
   * Tabel `workspaces`: `id`, `name`, `owner_id`.
   * Tabel `meetings`: `id`, `user_id`, `workspace_id`, `folder_id`, `title`, `started_at`, `ended_at`, `attendees`, `language`, `sync_version`.
   * Tabel `transcripts`: `id`, `meeting_id`, `track`, `speaker`, `start_ms`, `end_ms`, `text`.
   * Tabel `notes`: `meeting_id`, `mine`, `enhanced`, `updated_at`.
   * Tabel `folders`: `id`, `user_id`, `name`, `color`, `icon`.
   * **Row-Level Security (RLS):** Pengguna hanya diizinkan membaca dan menulis data miliknya sendiri.
2. **Mesin Sinkronisasi Dua Arah (*Two-Way Sync Engine* - `app/src/main/syncEngine.ts`):**
   * **Push Sync:** Begitu rapat selesai dan tersimpan di SQLite lokal, payload rapat langsung dikirim ke Cloud DB.
   * **Pull Sync:** Saat membuka aplikasi di perangkat lain, data rapat terbaru diunduh otomatis ke SQLite lokal.
   * **Offline Queue & Conflict Handling:** Jika laptop offline saat rapat selesai, data diberi tanda `sync_status = 'pending'`. Saat internet terhubung kembali, sistem langsung menyinkronkan tanpa menduplikasi data.

#### 3. Skenario Pengujian Perusahaan Hari 2 (Enterprise QA Checklist)

* [x] **TC-2.1 (Transkripsi Whisper Bilingual):** Uji coba bicara campuran bahasa Indonesia dan istilah bisnis bahasa Inggris (contoh: *"Tolong follow up action item rapat Q3 ke PIC terkait"*). Pastikan kata-kata tertranskripsi dengan akurat.
* [x] **TC-2.2 (Custom Jargon Perusahaan):** Daftarkan 3 istilah unik perusahaan Anda di menu Jargon (misal: nama produk atau singkatan internal). Uji bicara istilah tersebut dan pastikan Whisper tidak salah eja.
* [x] **TC-2.3 (Live Word Streaming):** Pastikan teks transkrip mengalir di layar secara *real-time* saat rapat berlangsung tanpa membuat komputer *freeze*.
* [x] **TC-2.4 (Pengorganisasian Folder):** Buat folder divisi (contoh: *"Divisi Finance"*, *"Rapat Direksi"*), pindahkan rapat ke dalam folder, dan pastikan metadata folder tersimpan rapi.
* [x] **TC-2.5 (Uji Ketahanan Offline & Auto-Push Sync):** Putuskan koneksi WiFi kantor. Lakukan rapat singkat 1 menit dan simpan. Hubungkan kembali WiFi. Periksa apakah data rapat otomatis terkirim (*synced*) ke Cloud DB tanpa error.
* [x] **TC-2.6 (Uji Pull Sync Multi-Device):** Login akun yang sama di Laptop B (atau hapus cache lokal). Pastikan seluruh daftar rapat, transkrip, dan folder dari Laptop A muncul kembali dengan sempurna.

#### 4. Hasil Akhir (Deliverable Hari 2)

* [x] Transkripsi suara lokal Whisper terkalibrasi untuk istilah perusahaan.
* [x] Database Cloud PostgreSQL aktif dengan pengamanan RLS, dan sinkronisasi dua arah berjalan otomatis di latar belakang.

---

### HARI 3: KAMIS — Hybrid AI Engine (Local LLM + Cloud AI Pihak Ketiga via API Key)

> **Alur Logika:** Transkrip yang panjang harus diubah menjadi notulen ringkas dan daftar tugas yang dapat ditindaklanjuti. Pengguna diberi kebebasan: menggunakan AI Lokal (hemat biaya & offline) atau Cloud AI (super cepat & berdaya analitik tinggi menggunakan API Key milik perusahaan/karyawan).

#### 1. Fitur Eksisting Hari 3 yang Diuji & Diintegrasikan

* **Engine LLM Lokal (`app/src/engine/llm.ts`, `node-llama-cpp`):**
  * Menjalankan model AI open-weight format GGUF (seperti Qwen 3 dan Gemma 4) yang terdaftar di `catalog/catalog.json`.
* **Ekstraksi Catatan Terstruktur (`app/src/main/notes/enhance.ts`, `queue.ts`):**
  * Menghasilkan Ringkasan Eksekutif, Pokok Pembahasan, Keputusan Strategis, dan Daftar Tindak Lanjut (*Action Items / Next Steps*) beserta penanggung jawabnya.
* **Integrasi Catatan Ketikan Manual Pengguna:**
  * Pengguna dapat mengetik catatan manual selama rapat via TipTap Rich Text Editor. AI otomatis menggabungkan catatan ketikan tersebut dengan transkrip audio.
* **Fitur "Write Again" (Prompt Ulang):**
  * Meminta AI menulis ulang notulen dengan instruksi khusus (misal: *"Format ulang untuk email ke klien"*, *"Sorot hanya aspek risiko legal"*).
* **Auto Title Generator:**
  * AI otomatis merumuskan judul rapat yang relevan berdasarkan isi percakapan.

#### 2. Fitur Baru Hari 3 yang Dibangun

1. **Arsitektur Provider AI Terpadu (*Unified AI Engine* - `app/src/engine/providers/`):**
   * Interface `AIProvider`: `generateNotes()`, `streamChat()`, `generateTitle()`.
   * `LocalProvider`: Menjalankan LLM lokal offline via `node-llama-cpp` (Qwen 3 / Gemma 4).
   * `OpenAIProvider`: Menghubungkan ke API OpenAI (`gpt-4o`, `gpt-4o-mini`).
   * `GeminiProvider`: Menghubungkan ke Google Gemini API (`gemini-2.0-flash`, `gemini-1.5-pro`).
   * `ClaudeProvider`: Menghubungkan ke Anthropic Claude API (`claude-3-5-sonnet`).
2. **Penyimpanan API Key Aman di Pengaturan:**
   * Tab baru **Pengaturan $\rightarrow$ Kecerdasan Buatan (AI)**:
     * Pilihan Mode: `AI Lokal (100% Offline)` vs `Cloud AI (Gunakan API Key Sendiri)`.
     * Input API Key untuk OpenAI, Google Gemini, atau Anthropic Claude.
     * Enkripsi disk lokal menggunakan `safeStorage.encryptString()` agar API key tidak bisa dicuri malware.
3. **Mekanisme Smart Fallback Otomatis:**
   * Jika pengguna memilih Cloud AI tetapi internet putus atau kuota API habis, sistem memberi peringatan jelas dan menawarkan pemrosesan dialihkan ke Model AI Lokal.

#### 3. Skenario Pengujian Perusahaan Hari 3 (Enterprise QA Checklist)

* [x] **TC-3.1 (Perbandingan Kualitas Notulen Lokal vs Cloud):** Uji ringkasan rapat yang sama menggunakan Local LLM (Qwen 3) dan Cloud AI (Gemini 2.0 / GPT-4o). Periksa ketepatan penangkapan Action Items dan daftar PIC (penanggung jawab).
* [x] **TC-3.2 (Penggabungan Catatan Manual Pengguna):** Saat merekam, ketik di editor manual: *"Catatan Direktur: Anggaran disetujui maks 100 juta"*. Selesaikan rapat dan pastikan poin ketikan manual ini masuk dan diprioritaskan oleh AI dalam ringkasan akhir.
* [x] **TC-3.3 (Uji Fitur "Write Again"):** Gunakan tombol Write Again dengan instruksi: *"Tulis ulang seringkas mungkin dalam 3 poin bullet saja"*. Pastikan AI merespons instruksi tersebut secara akurat.
* [x] **TC-3.4 (Keamanan & Enkripsi API Key):** Masukkan API Key Gemini/OpenAI. Periksa file konfigurasi dan file log (`main.log`): pastikan string API Key tidak pernah tertulis dalam bentuk teks polos (*plain text*).
* [x] **TC-3.5 (Uji Smart Fallback):** Setel mode ke Cloud AI, lalu matikan internet. Jalankan peringkasan: pastikan aplikasi tidak *crash*, melainkan menampilkan notifikasi dan menawarkan beralih ke Model AI Lokal.

#### 4. Hasil Akhir (Deliverable Hari 3)

* [x] Opsi *Hybrid AI* aktif: pengguna di laptop spek rendah bisa memanfaatkan Cloud API Key yang super cepat, sementara pengguna yang butuh kerahasiaan 100% tetap bisa memakai LLM Lokal offline.

---

### HARI 4: JUMAT — Website Portal Next.js di Vercel (Mirip Fathom), Pusat Download Desktop App, Pemutar Audio & Transkrip Interaktif, & Shareable Links

> **Alur Logika:** Pengguna dan tim membutuhkan wadah cloud untuk login, melihat seluruh riwayat rekaman tanpa harus membuka laptop utama, mendengarkan audio rekaman, serta membagikan tautan rapat ke peserta lain persis seperti platform **Fathom Video**. Selain itu, website portal menjadi pusat resmi tempat pengguna dapat mengunduh aplikasi desktop (*Desktop App Download Hub*). Di hari ini, kita meluncurkan Website Portal Next.js di Vercel, halaman unduh multi-OS, interactive playback player, sistem berbagi link publik/tim, dan basis pengetahuan pencarian AI (RAG).

#### 1. Fitur Eksisting Hari 4 yang Diuji & Diintegrasikan

* **Chunking & Vector Embeddings Lokal (`app/src/main/library/`):**
  * Transkrip dipecah menjadi potongan teks dan diubah menjadi vektor menggunakan model embedding lokal.
* **Fitur "Ask" / Tanya-Jawab Lintas Rapat (`app/src/main/library/retrieve.ts`):**
  * Pengguna dapat bertanya ke AI mengenai isi rapat tertentu atau seluruh riwayat rapat masa lalu dengan sitasi rujukan sumber.
* **Pencarian Cepat (*Full-text & Fuzzy Search* - `app/src/main/library/searchQuery.ts`):**
  * Pencarian instan untuk judul, isi catatan, transkrip percakapan, maupun nama peserta rapat.
* **Server MCP Lokal Bawaan (`app/src/main/mcp/server.ts`):**
  * Standar *Model Context Protocol* yang memungkinkan IDE / AI tools eksternal (Claude Code, Cursor, Raycast) untuk membaca catatan rapat dan transkrip secara terstruktur.
* **Integrasi Kalender Sistem & iCal (`calendar.ts`, `ical.js`):**
  * Menghubungkan jadwal rapat melalui kalender sistem atau private link iCal (`.ics`).
* **Ekspor & Cadangan Data (`backup.ts`, `exportNotes.ts`):**
  * Ekspor catatan ke format Markdown (`.md`), copy ke clipboard, dan ekspor/impor seluruh database ke file ZIP.

#### 2. Fitur Baru Hari 4 yang Dibangun

1. **Inisialisasi Project Web Portal Next.js (`web/`) & Deploy Vercel:**
   * Membangun aplikasi web modern menggunakan **Next.js 15 (App Router)** di direktori `web/` monorepo.
   * Terhubung langsung dengan **Neon Serverless PostgreSQL** via `@neondatabase/serverless` dan **Supabase Auth**.
   * Konfigurasi continuous deployment otomatis ke platform **Vercel**.
2. **Pusat Download Aplikasi Desktop di Website (`/` dan `/download`):**
   * Deteksi OS otomatis: Tombol unduh otomatis menyesuaikan sistem operasi pengunjung (Windows `.exe`, Mac `.dmg`, Linux `.AppImage`).
   * Tombol unduh sekunder untuk format OS lain dan panduan instalasi kilat 3 langkah.
   * Banner cerdas di dalam dashboard web bagi pengguna yang belum memasang aplikasi desktop recorder.
3. **Dashboard Web & Pemutar Audio Interaktif (Fathom Experience):**
   * **Login Terpusat:** Karyawan login menggunakan akun kantor untuk melihat seluruh dashboard rapat.
   * **Interactive Player:** Audio player terintegrasi di mana kata-kata transkrip tersorot sinkron dengan audio yang sedang diputar (*karaoke highlight*); klik kalimat transkrip langsung melompat ke detik audio tersebut.
   * **Tampilan Ringkasan AI & Action Items:** Ringkasan eksekutif dan to-do list dapat langsung disalin atau dicentang di web.
4. **Fitur Tautan Berbagi Rapat (*Shareable Meeting Links*):**
   * Tombol **"Share / Bagikan"** yang menghasilkan tautan web instan (misal `https://app.cakapp.com/share/abc-123`):
     * *Private:* Hanya dapat dibaca oleh pemilik rapat.
     * *Team Workspace:* Otomatis dapat dibaca oleh rekan satu tim di organisasi/divisi yang sama.
     * *Public Web Link:* Tautan web aman (*read-only*) untuk dikirim ke klien, peserta luar, atau atasan via WhatsApp/Slack/Email. **Penerima link dapat langsung mendengar rekaman dan membaca notulen di browser tanpa harus install aplikasi desktop.**
5. **Akses Mobile Responsif (Android & iOS):**
   * Seluruh tampilan website dioptimalkan untuk browser ponsel (Chrome di Android, Safari di iPhone).
   * **Perekam Suara Rapat Tatap Muka (*In-Person Voice Recorder*):** Fitur rekam memo suara langsung dari mikrofon HP untuk rapat tatap muka di kafe atau ruang kantor offline.
6. **Role & Hak Akses Organisasi:**
   * Tingkatan izin: `Owner` (pemilik), `Editor` (dapat mengedit catatan), dan `Viewer` (hanya baca).
7. **Penyimpanan Rekaman Audio Cloud Opsional:**
   * Pengaturan: *"Upload file audio ke Cloud Storage"* (Supabase Storage / S3 / Cloudflare R2) bagi rapat yang ingin didengarkan ulang oleh tim dari browser web.

#### 3. Skenario Pengujian Perusahaan Hari 4 (Enterprise QA Checklist)

* [ ] **TC-4.1 (Uji Login & Dashboard Website Portal di Vercel):** Buka Website Portal Next.js yang terdeploy di Vercel. Login dengan akun yang sama. Pastikan seluruh daftar rapat yang baru selesai direkam di PC desktop langsung muncul dengan status *synced*.
* [ ] **TC-4.2 (Uji Download Aplikasi Desktop dari Website):** Buka halaman `/download` dari browser Windows dan Mac. Pastikan sistem mendeteksi OS dengan benar dan tautan download file installer (`.exe` / `.dmg`) dapat diunduh tanpa kendala.
* [ ] **TC-4.3 (Uji Pemutar Audio & Transkrip Karaoke Interaktif):** Putar rekaman rapat di web portal. Pastikan teks transkrip tersorot secara otomatis (*highlight*) mengikuti audio yang berbicara. Klik salah satu kata di menit ke-02:15, pastikan pemutaran audio langsung melompat tepat ke detik tersebut.
* [ ] **TC-4.4 (Uji Tautan Berbagi / Shareable Link Mirip Fathom):** Klik tombol Share $\rightarrow$ Public Link. Buka tautan tersebut di jendela Incognito / perangkat rekan kerja tanpa login. Pastikan penerima link dapat membaca notulen dan memutar audio rapat secara bersih tanpa akses ke rapat lain.
* [ ] **TC-4.5 (Uji Akses HP Android & iPhone):** Buka link Website Portal atau link shareable di browser HP (Chrome Android / Safari iOS). Pastikan tampilan responsif, nyaman dibaca satu tangan, dan audio dapat diputar lancar.
* [ ] **TC-4.6 (Uji Tanya RAG Lintas Rapat di Web & Desktop):** Buka fitur "Ask". Ajukan pertanyaan spesifik perusahaan: *"Apa saja keputusan terkait timeline proyek X pada rapat 3 hari lalu?"*. Pastikan AI menjawab dengan tepat disertai sitasi tautan rapat terkait.
* [ ] **TC-4.7 (Uji Integrasi Local MCP Server):** Hubungkan Cursor atau Claude Code ke MCP Server Cakapp lokal. Jalankan perintah untuk membaca ringkasan rapat terakhir dan pastikan AI eksternal dapat mengambil konteksnya.

#### 4. Hasil Akhir (Deliverable Hari 4)

* Website Portal Next.js (mirip Fathom) aktif ter-deploy di Vercel lengkap dengan halaman download aplikasi desktop PC.
* Pemutar audio karaoke interaktif dan pembagian link rapat publik/tim berfungsi mulus.
* Pengguna Android dan iOS dapat mengakses dan membaca seluruh hasil rapat melalui browser smartphone.
* Pengetahuan rapat perusahaan dapat dicari seketika via RAG & Search.

---

### HARI 5: SENIN — Hardening Keamanan, Pengujian E2E Skenario Perusahaan, & Build Installer PC Production

> **Alur Logika:** Sebelum aplikasi diluncurkan ke seluruh karyawan perusahaan, seluruh sistem harus melewati audit keamanan ketat (data privasi tidak bocor antar karyawan), pengujian alur lengkap (*End-to-End Stress Test*), dan dikompilasi menjadi file installer executable desktop PC (.exe/.dmg) yang siap di-install oleh siapa saja.

#### 1. Fitur Eksisting Hari 5 yang Diuji & Diintegrasikan

* **Sistem Build & Packaging PC (`app/electron-builder.yml`, `package.json`, skrip `app/scripts/native.mjs`):**
  * Konfigurasi kompilasi native addon (`whisper.cpp`, `node-llama-cpp`, `node:sqlite`).
* **Test Suite Otomatis (`app/vitest.config.ts`, `app/playwright.config.ts`):**
  * Pengujian unit test dan browser/desktop automation test.
* **Logging & Penanganan Crash (`app/src/main/log.ts`, `crashPolicy.ts`):**
  * Pencatatan log sistem dan proteksi error tak terduga tanpa membocorkan data pengguna.
* **Dukungan Multi-Platform PC:**
  * Windows (`.exe`), macOS (`.dmg`), dan Linux (`.AppImage`).

#### 2. Fitur Baru Hari 5 & Aktivitas Finalisasi

1. **Audit Keamanan Multi-Tenant & Kebocoran Privasi:**
   * Verifikasi Row-Level Security (RLS) PostgreSQL: Memastikan Karyawan A tidak bisa mengakses catatan rapat Karyawan B dengan memanipulasi UUID meeting.
   * Sanitasi Log: Memastikan token autentikasi, API Key AI, dan transkrip rahasia tidak pernah tercatat di file `main.log`.
2. **Simulasi Alur Lengkap Skenario Perusahaan (End-to-End Test):**
   * *Simulasi 1:* Rapat hybrid 1 jam di Zoom $\rightarrow$ Audio terekam 2 arah $\rightarrow$ Transkrip Whisper berjalan $\rightarrow$ Ringkasan terbuat via Cloud AI $\rightarrow$ Tersinkron ke Cloud $\rightarrow$ Manajer membaca notulen di mobil melalui HP.
   * *Simulasi 2:* Kondisi internet kantor mati total $\rightarrow$ Rapat tetap terekam dan diringkas oleh Local LLM $\rightarrow$ Internet menyala kembali $\rightarrow$ Auto-sync berjalan mulus tanpa konflik.
3. **Kompilasi Installer PC Siap Pakai:**
   * Menjalankan build production multi-platform:

     ```bash
     pnpm run build
     ```

   * Menghasilkan file installer mandiri:
     * **Windows:** `Cakapp Setup.exe` (x64)
     * **macOS:** `Cakapp.dmg` (Universal / Apple Silicon & Intel)
     * **Linux:** `Cakapp.AppImage`
4. **Penyusunan Dokumentasi Panduan Deployment Perusahaan:**
   * Panduan instalasi satu klik untuk karyawan.
   * Panduan setup environment backend database untuk tim IT perusahaan.

#### 3. Skenario Pengujian Perusahaan Hari 5 (Enterprise QA Checklist)

* [ ] **TC-5.1 (Clean Install Test):** Ambil laptop Windows standar karyawan yang bersih (tanpa Node.js/tools developer). Jalankan file `Cakapp Setup.exe`. Pastikan aplikasi terpasang sempurna dan langsung dapat digunakan.
* [ ] **TC-5.2 (Uji Isolasi Data Antar-Karyawan):** Buat 2 akun berbeda (Akun Karyawan & Akun Direktur). Pastikan Akun Karyawan tidak dapat melihat catatan rahasia yang disimpan di Akun Direktur.
* [ ] **TC-5.3 (Stress Test Rapat Panjang):** Uji perekaman rapat berdurasi panjang (> 90 menit). Pantau penggunaan memori RAM dan CPU: pastikan aplikasi stabil, tidak terjadi *memory leak*, dan tidak crash.
* [ ] **TC-5.4 (Validasi Skenario Full-Flow):** Uji alur lengkap dari awal hingga akhir: Buka Zoom $\rightarrow$ Deteksi otomatis $\rightarrow$ Rekam $\rightarrow$ Selesai $\rightarrow$ AI generate notulen $\rightarrow$ Sync cloud $\rightarrow$ Buka di browser HP $\rightarrow$ Berbagi link ke rekan kerja.

#### 4. Hasil Akhir (Deliverable Hari 5)

* File installer desktop PC production (`.exe` / `.dmg`) siap dibagikan ke seluruh tim.
* Web Companion aktif untuk akses mobile.
* Dokumentasi deployment IT dan checklist kepatuhan privasi lengkap.

---

## 5. Panduan Variabel Lingkungan (`.env`)

Untuk menjalankan sistem yang terhubung dengan cloud dan AI eksternal, siapkan file `.env` di direktori proyek:

```env
# Neon Serverless PostgreSQL (Koneksi Pooler Cloud DB)
DATABASE_URL="postgresql://neondb_owner:YOUR_DATABASE_PASSWORD@ep-floral-union-bemtepa2-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DATABASE_URL_UNPOOLED="postgresql://neondb_owner:YOUR_DATABASE_PASSWORD@ep-floral-union-bemtepa2.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Autentikasi Pengguna & Storage (Supabase)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Konfigurasi AI Default (Jika disediakan terpusat oleh IT Perusahaan)
DEFAULT_AI_PROVIDER=local
OPENAI_API_BASE_URL=https://api.openai.com/v1
GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta

# Cloud Storage untuk Backup Rekaman Audio (Opsional)
CLOUD_STORAGE_BUCKET=meeting-audio
```

---

## 6. Matriks Kesiapan Rilis Perusahaan (Definition of Done)

* [x] **Identitas & Akses:** Karyawan bisa Register/Login akun kantor, atau memilih Mode Tamu / 100% Offline.
* [x] **Perekaman Sistem:** Deteksi otomatis Zoom, Meet, Teams, Slack tanpa bot pihak ketiga; audio dual-track jernih tanpa gema.
* [x] **Konektivitas Cloud Database:** Neon Serverless PostgreSQL terkoneksi aktif dengan skema multi-tabel (`profiles`, `workspaces`, `folders`, `meetings`, `transcripts`, `notes`).
* [ ] **Transkripsi Cepat:** Whisper STT lokal mendukung Bahasa Indonesia, istilah teknis perusahaan (Custom Jargon), dan live streaming.
* [ ] **Sinkronisasi Otomatis:** Catatan tersimpan di SQLite lokal dan Cloud PostgreSQL (Neon) dengan ketahanan offline (*offline queue*).
* [ ] **Fleksibilitas AI (Hybrid):** Pengguna bebas beralih antara Local LLM (gratis & offline) atau Cloud AI (GPT-4o/Gemini/Claude via API Key terenkripsi).
* [ ] **Website Portal (Mirip Fathom):** Dashboard web cloud tempat login, melihat riwayat meeting, pemutar audio karaoke transkrip interaktif, dan pembagian share link publik/tim.
* [ ] **Akses Mobile (HP):** Ringkasan rapat dan transkrip dapat dibuka responsif dari HP Android & iOS melalui Web Portal (PWA).
* [ ] **Kolaborasi & Berbagi:** Notulen rapat dapat dibagikan via tautan shareable aman tanpa penerima harus menginstall aplikasi desktop.
* [ ] **Basis Pengetahuan (RAG):** Pengguna dapat mencari dan menanyakan isi rapat masa lalu dengan sitasi akurat.
* [ ] **Distribusi Mandiri:** File installer PC (`.exe` / `.dmg`) berhasil di-build dan berjalan lancar pada komputer pengguna awam.
