import React from 'react';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      {/* Hero Section */}
      <section className="pt-16 sm:pt-24 pb-16 sm:pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-300 mb-6 sm:mb-8">
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
        <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <a
            href="/download"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Cakapp Desktop
          </a>

          <a
            href="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            Buka Web Dashboard
            <span aria-hidden="true">&rarr;</span>
          </a>
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          Mendukung Windows 10/11 x64, macOS (Apple Silicon & Intel), dan Linux.
        </p>
      </section>

      {/* Feature Grid */}
      <section className="border-t border-zinc-800/80 py-16 sm:py-20">
        <div className="text-center mb-12 sm:mb-16">
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
                Shareable Web Links
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                Bagikan ringkasan rapat ke rekan kerja atau klien. Penerima cukup membuka tautan browser tanpa harus memasang aplikasi desktop.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
