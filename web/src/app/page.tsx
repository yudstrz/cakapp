import React from 'react';
import Link from 'next/link';
import AudioPlayer from '@/components/AudioPlayer';
import { SHOWCASE_MEETING } from '@/lib/showcase';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      {/* Hero Section */}
      <section className="pt-14 sm:pt-20 pb-12 sm:pb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-300 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Perekaman Audio Sistem Native + Web Hub
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-zinc-100 leading-[1.15]">
          Rekam Rapat Tanpa Bot, <br />
          <span className="text-zinc-400">Akses Notulen dari Mana Saja.</span>
        </h1>

        <p className="mx-auto mt-5 sm:mt-6 max-w-2xl text-sm sm:text-base md:text-lg text-zinc-400 leading-relaxed">
          Cakapp merekam audio Zoom, Google Meet, dan Microsoft Teams langsung melalui sistem operasi. Tanpa bot mengganggu di ruang rapat. Seluruh ringkasan AI otomatis tersinkron ke web portal ini.
        </p>

        {/* Primary CTA Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <Link
            href="/download"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Cakapp Desktop
          </Link>

          <Link
            href="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            Buka Web Dashboard
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          Tersedia untuk Windows 10/11 x64 (macOS dan Linux segera hadir).
        </p>
      </section>

      {/* SHOWCASE SECTION (LIVE ON HOMEPAGE) */}
      <section className="py-12 border-t border-zinc-800/80">
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 rounded bg-amber-950/80 border border-amber-800/60 px-2.5 py-0.5 text-xs font-medium text-amber-300 mb-3">
            Showcase Demo Interaktif
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100">
            Contoh Hasil Rekaman & Notulen AI
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
            Putar audio percakapan dwibahasa (ID & EN) di bawah ini. Teks transkrip tersorot otomatis (karaoke sinkron) dan klik baris mana pun untuk melompat ke detik audio tersebut.
          </p>
        </div>

        {/* Meeting Details Bar */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5 mb-6 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                  {SHOWCASE_MEETING.app}
                </span>
                <span className="rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-400">
                  {SHOWCASE_MEETING.language}
                </span>
                <span className="rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-400">
                  Durasi: 37 detik
                </span>
              </div>
              <h3 className="font-semibold text-base sm:text-lg text-zinc-100">
                {SHOWCASE_MEETING.title}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Peserta: Budi Santoso (Product Manager), Sarah Wijaya (Tech Lead)
              </p>
            </div>

            <Link
              href="/dashboard/meetings/showcase-demo"
              className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors"
            >
              Buka Halaman Khusus &rarr;
            </Link>
          </div>
        </div>

        {/* Interactive Audio Player & Synchronized Transcripts */}
        <div className="grid grid-cols-1 gap-6">
          <AudioPlayer
            audioUrl={SHOWCASE_MEETING.audioUrl || '/audio/showcase.wav'}
            transcripts={SHOWCASE_MEETING.transcripts}
          />

          {/* AI Structured Notes Card */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/80">
              <h3 className="text-sm sm:text-base font-semibold text-zinc-100 flex items-center gap-2">
                <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Notulen & Ringkasan AI Rapat
              </h3>
              <span className="text-[10px] uppercase font-mono text-zinc-500">
                Model: Whisper + LLM
              </span>
            </div>

            <div className="prose prose-invert max-w-none text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {SHOWCASE_MEETING.notes.enhanced}
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="border-t border-zinc-800/80 py-16 sm:py-20">
        <div className="text-center mb-12">
          <h2 className="text-xl sm:text-2xl font-semibold text-zinc-100">
            Arsitektur Hybrid untuk Privasi & Kolaborasi
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-zinc-400">
            Pemisahan yang jelas antara engine perekam lokal dan portal penayangan cloud.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 flex flex-col justify-between">
            <div>
              <div className="h-9 w-9 rounded-lg border border-zinc-700 bg-zinc-800 flex items-center justify-center text-zinc-200 mb-4">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                </svg>
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-zinc-100 mb-2">
                100% Perekaman Tanpa Bot
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                Terhubung langsung ke audio driver OS (WASAPI di Windows, CoreAudio di Mac). Tidak ada bot luar yang masuk ke room panggilan.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 flex flex-col justify-between">
            <div>
              <div className="h-9 w-9 rounded-lg border border-zinc-700 bg-zinc-800 flex items-center justify-center text-zinc-200 mb-4">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-zinc-100 mb-2">
                Audio & Karaoke Player
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                Teks transkrip tersorot sinkron detik demi detik saat audio diputar. Cukup klik sembarang kalimat untuk melompat ke momen tersebut.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 flex flex-col justify-between">
            <div>
              <div className="h-9 w-9 rounded-lg border border-zinc-700 bg-zinc-800 flex items-center justify-center text-zinc-200 mb-4">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-zinc-100 mb-2">
                Sinkronisasi Cloud Otomatis
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                Notulen tersinkronisasi aman ke database cloud terenkripsi. Akses dari perangkat apa pun tanpa perlu transfer file manual.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
