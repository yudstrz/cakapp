import React from 'react';

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/15 blur-[120px] pointer-events-none rounded-full" />

      {/* Hero Section */}
      <section className="relative mx-auto max-w-5xl px-6 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1.5 text-xs font-semibold text-blue-300 mb-8 backdrop-blur-md">
          <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          Ekosistem Hybrid Mirip Fathom — Desktop Recorder + Cloud Web Portal
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-tight md:leading-tight">
          Rekam Rapat Tanpa Bot, <br />
          <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
            Akses Notulen dari Mana Saja.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base md:text-lg text-slate-300 leading-relaxed">
          Cakapp merekam audio Zoom, Google Meet, dan Microsoft Teams secara native tanpa mengundang bot mengganggu ke room. Hasil rekaman langsung diringkas oleh AI dan otomatis tersinkron ke cloud portal ini.
        </p>

        {/* Primary CTA Buttons */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="/download"
            className="flex items-center gap-3 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-xl shadow-blue-600/25 transition-all hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Cakapp Desktop (.exe)
          </a>

          <a
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3.5 text-base font-semibold text-slate-200 transition-all hover:bg-slate-800 hover:border-slate-600"
          >
            Buka Web Dashboard
            <span aria-hidden="true">&rarr;</span>
          </a>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Tersedia untuk Windows 10/11 x64, macOS (Apple Silicon & Intel), dan Linux.
        </p>
      </section>

      {/* Feature Grid (Fathom-like) */}
      <section className="border-t border-slate-800/80 bg-slate-900/20 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-white">Dirancang untuk Profesional & Tim Modern</h2>
            <p className="mt-3 text-slate-400">Dua pilar aplikasi yang saling melengkapi untuk produktivitas maksimal.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 backdrop-blur-sm transition-all hover:border-slate-700">
              <div className="h-12 w-12 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center text-2xl mb-6">
                🛡️
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">100% Perekaman Tanpa Bot</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Aplikasi desktop Cakapp terhubung langsung ke audio sistem operasi (WASAPI/CoreAudio). Tidak ada bot aneh yang masuk ke room meeting.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 backdrop-blur-sm transition-all hover:border-slate-700">
              <div className="h-12 w-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-2xl mb-6">
                🎵
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Pemutar Audio Karaoke Interaktif</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Teks transkrip tersorot sinkron saat audio berbicara di website. Cukup klik sembarang kata untuk melompat langsung ke momen audio tersebut.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 backdrop-blur-sm transition-all hover:border-slate-700">
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center text-2xl mb-6">
                🔗
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Shareable Meeting Links</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Bagikan link ringkasan rapat ke rekan kerja atau klien. Penerima dapat langsung membuka, membaca, dan mendengarkan rekaman tanpa harus install apa pun.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
