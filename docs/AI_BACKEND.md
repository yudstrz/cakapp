# Dokumentasi Backend Proxy Cloud AI Cakapp

Dokumen ini menjelaskan arsitektur proxy Cloud AI terpusat di Vercel (`web/`), kontrol kuota per akun, proteksi anggaran harian, mekanisme BYOK terpisah, serta panduan operasional dan pengujian manual.

## 1. Arsitektur Singkat

Seluruh panggilan Cloud AI dari aplikasi desktop Electron (`app/`, file `.exe`) maupun portal web (`web/`) dialihkan ke backend Next.js App Router (runtime Node.js) di Vercel:

- **`POST /api/ai/generate`**: Validasi body dengan Zod, injeksi prompt sistem di sisi server (`notulen` dan `ringkasan`), verifikasi model aktif, penegakan rate limit dan anggaran global, streaming SSE (`text/event-stream`), serta auto-fallback ke model default provider saat terjadi `404` atau model dihentikan.
- **`GET /api/ai/models`**: Mengembalikan irisan antara daftar kurasi manual (`MODEL_SEED` di `web/src/lib/ai/models.ts`) dan respons langsung *List Models API* tiap provider, di-cache di Upstash Redis selama 1 jam.
- **`GET /api/ai/usage`**: Mengembalikan sisa kuota request dan token input harian pengguna (reset setiap pukul `00:00 WIB`).
- **`GET /api/ai/health`**: Memeriksa status autentikasi, kill switch, konfigurasi kunci provider, dan ketersediaan model default di *List Models API* tanpa memakai token berbayar.
- **Pemisahan Modul Kunci API**:
  - Server: `web/src/lib/ai/keys.ts` mengelola pembacaan kunci server (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`), resolusi header opsional BYOK, dan sanitasi pesan error.
  - Desktop (`.exe`): `app/src/main/byokKey.ts` mengelola kunci BYOK opsional khusus di memori sesi proses utama (tidak pernah ditulis ke `ai_config.json`, terpisah penuh dari `aiKeyStore.ts`).
  - Web: `web/src/lib/ai/byok-client.ts` menyimpan BYOK opsional hanya di `sessionStorage` tab aktif.

### Keputusan Arsitektur BYOK

Mode opsional **Bring Your Own Key (BYOK)** diimplementasikan dengan mengirim kunci melalui header HTTPS `X-BYOK-Api-Key` dan `X-BYOK-Provider` ke endpoint `/api/ai/*` milik Cakapp (tidak pernah dicatat di log, tidak disimpan di database/Redis bersama, dan melewati kuota bersama), bukan memanggil API provider langsung dari browser/renderer. Alasan keamanan dan pemeliharaan:

1. Prompt sistem (`notulen`, `ringkasan`), validasi ukuran input, blokir model usang, dan sanitasi error tetap terjaga di satu pintu.
2. Menghindari kendala CORS browser pada provider pihak ketiga serta mencegah kunci terekspos di kode renderer.
3. Daftar model pada mode BYOK tetap diverifikasi terhadap akun kunci milik pengguna itu sendiri melalui `GET /api/ai/models`.

## 2. Daftar Environment Variables (Server Vercel)

Tambahkan variabel berikut di **Vercel Project Settings > Environment Variables** (khusus server, **JANGAN** gunakan prefix `NEXT_PUBLIC_`):

```bash
# Kunci bersama Cloud AI (server-only)
GEMINI_API_KEY=""
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""

# Upstash Redis (rate limit, kuota harian WIB, cache List Models, anggaran global)
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""

# Kontrol biaya & akses global
AI_DAILY_BUDGET_USD="5"
AI_KILL_SWITCH="false"
AI_ALLOW_PREMIUM="false"

# Autentikasi & Database (Better Auth + Neon PostgreSQL)
BETTER_AUTH_SECRET=""
BETTER_AUTH_URL="https://cakapp.vercel.app"
DATABASE_URL=""
DATABASE_URL_UNPOOLED=""
```

## 3. Cara Deploy di Vercel & Batas Teknis

1. Pastikan root monorepo memiliki `vercel.json` yang mengarahkan layanan `web` ke direktori `web/`.
2. Buat database Redis di Upstash Console, lalu salin `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` ke Vercel.
3. Isi minimal satu kunci provider (`GEMINI_API_KEY`, `OPENAI_API_KEY`, atau `ANTHROPIC_API_KEY`) menggunakan API key khusus aplikasi (bukan kunci pribadi umum).
4. Jalankan deploy melalui Vercel Git integration atau `vercel --prod`.
5. Catatan batas teknis Vercel (diverifikasi 26 Nov 2026):
   - Batas ukuran body request/response: **4,5 MB** (route membatasi body maks 1 MB dan `MAX_INPUT_CHARS = 100.000`).
   - Durasi fungsi: `maxDuration = 60` detik dengan `AbortController` internal 55 detik. Transkrip panjang dipecah di sisi client (*map-reduce chunking* per 24.000 karakter) dan file audio/video **tidak pernah** dikirim ke fungsi Vercel.
   - **Penting terkait Plan Vercel**: Plan **Hobby** hanya mengizinkan penggunaan pribadi non-komersial. Karena arsitektur ini melayani banyak akun dengan kunci bersama untuk produk/organisasi, gunakan plan **Vercel Pro** pada lingkungan produksi.

## 4. Cara Mengubah Limit & Mematikan Layanan Darurat

- **Tanpa redeploy (lewat Vercel Env Vars)**:
  - Matikan seluruh panggilan Cloud AI seketika: ubah `AI_KILL_SWITCH="true"` (client otomatis beralih ke AI Lokal).
  - Ubah plafon biaya global harian: ubah `AI_DAILY_BUDGET_USD` (dalam USD).
  - Izinkan model tier premium: ubah `AI_ALLOW_PREMIUM="true"`.
- **Lewat konfigurasi kode (`web/src/lib/ai/limits.ts`)**:
  - `TIER_LIMITS.free`: default `5` req/menit, `30` req/hari, `300.000` token input/hari (reset `00:00 WIB`).
  - `TIER_LIMITS.pro`: default `20` req/menit, `200` req/hari, `2.000.000` token input/hari.
  - `IP_REQ_PER_MINUTE`: default `20` req/menit per IP.
  - `MAX_INPUT_CHARS`: default `100_000` karakter per request.

## 5. Cara Menambah atau Menghapus Model di Seed

1. Buka `web/src/lib/ai/models.ts` pada objek `MODEL_SEED`.
2. Cek ID model aktif dan harga resmi terbaru per 1 juta token input/output di:
   - Gemini: `https://ai.google.dev/gemini-api/docs/pricing`
   - OpenAI: `https://developers.openai.com/api/docs/pricing`
   - Anthropic: `https://platform.claude.com/docs/en/about-claude/pricing`
3. Tambahkan entri `{ id, label, tier, inputPer1M, outputPer1M, default? }` beserta komentar tanggal pengecekan.
   - `inputPer1M` dan `outputPer1M` wajib bernilai positif (`> 0`). Model tanpa harga valid otomatis ditolak oleh `hasValidPricing()` agar tidak menimbulkan biaya tak terhitung.
   - Pastikan tepat satu model hemat/stabil per provider memiliki `default: true`.
4. Untuk menghapus model yang sudah pensiun/deprecated, hapus barisnya dari `MODEL_SEED`. Bahkan sebelum redeploy dilakukan, Lapis 2 (*List Models API*) otomatis menyembunyikan model yang sudah dihapus provider setelah cache 1 jam berakhir, dan Lapis 3 otomatis mengalihkan pengguna ke model default aktif jika provider membalas `404`.
5. Jalankan `pnpm --filter cakapp-web test` sebelum commit.

## 6. Prosedur Rotasi API Key

1. Buat API key baru khusus aplikasi Cakapp di konsol provider terkait (Google AI Studio, OpenAI Platform, atau Anthropic Console).
2. Perbarui nilai `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` di Vercel Environment Variables.
3. Redeploy proyek di Vercel agar fungsi serverless memuat variabel baru.
4. Klik tombol **Uji Koneksi** di Pengaturan AI aplikasi (memanggil `GET /api/ai/health`) dan pastikan status provider aktif.
5. Cabut (*revoke*) API key lama di konsol provider.

## 7. Cara Memantau Penggunaan

- **Vercel Logs**: Setiap request mencatat JSON metadata satu baris (`event`, `userId`, `provider`, `model`, `task`, `inputTokens`, `outputTokens`, `latencyMs`, `status`, `byok`) tanpa pernah mencatat isi transkrip, hasil notulen, atau API key.
- **Upstash Redis Data Browser**:
  - `ai:budget:usd:YYYY-MM-DD`: akumulasi estimasi biaya global hari berjalan (USD).
  - `ai:daily:req:YYYY-MM-DD:<userId>` & `ai:daily:tok:YYYY-MM-DD:<userId>`: pemakaian harian per akun.
  - `ai:models:v1:<provider>`: cache daftar ID model aktif hasil *List Models API*.

## 8. Checklist Pengujian Manual

- [ ] **1. Tanpa login**: Panggil `POST /api/ai/generate` tanpa cookie/token sesi. Pastikan server menolak dengan HTTP `401` (`UNAUTHORIZED`) dan aplikasi desktop otomatis beralih ke AI Lokal beserta notifikasi singkat.
- [ ] **2. Melebihi rate limit**: Kirim lebih dari 5 request dalam 1 menit dari akun `free` yang sama. Pastikan request ke-6 ditolak HTTP `429` (`RATE_LIMITED`) dengan header `Retry-After` dan `X-RateLimit-Remaining: 0`, lalu client fallback ke AI Lokal.
- [ ] **3. Model di luar daftar**: Kirim `POST /api/ai/generate` dengan `"model": "gemini-1.5-pro"` atau model premium saat `AI_ALLOW_PREMIUM="false"`. Pastikan ditolak dengan HTTP `400` (`INVALID_INPUT`).
- [ ] **4. Kuota harian habis lalu fallback ke AI Lokal**: Set counter Redis `ai:daily:req:<YYYY-MM-DD>:<userId>` ke `30`, lalu buat notulen di aplikasi. Pastikan server membalas `429` (`QUOTA_EXCEEDED`), notifikasi toast tampil, dan notulen tetap selesai dibuat oleh AI Lokal tanpa crash.
- [ ] **5. Kill switch aktif**: Set `AI_KILL_SWITCH="true"` di env server, lalu buat notulen atau tekan **Uji Koneksi**. Pastikan request ditolak (`BUDGET_EXCEEDED` / status nonaktif) dan pembuatan notulen beralih ke AI Lokal.
- [ ] **6. Input terlalu panjang**: Kirim teks lebih dari `100.000` karakter langsung ke `POST /api/ai/generate` dan pastikan ditolak `400` (`INVALID_INPUT`). Uji pula transkrip panjang (> 24.000 karakter) lewat aplikasi client dan pastikan client memecahnya menjadi beberapa ringkasan bagian (*map-reduce*) hingga berhasil.
- [ ] **7. Model default dihapus dari List Models lalu aplikasi tetap berfungsi**: Simulasikan respons *List Models API* tanpa model default seed (namun model standar lain masih ada). Pastikan `/api/ai/models` mempromosikan model aktif berikutnya sebagai default, `/api/ai/health` memberi tahu perpindahan ke model cadangan, dan pembuatan notulen tetap berjalan.
- [ ] **8. Model tersimpan di pengaturan user sudah tidak tersedia**: Simpan nama model lama di `ai_config.json` (misal `gemini-2.0-flash` atau model yang tidak lagi ada di `/api/ai/models`), buka Pengaturan AI, dan pastikan pilihan otomatis berpindah ke model default yang terverifikasi aktif.
