import React from 'react';

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-20 text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-300 mb-6">
        Versi Stabil v0.3.66 Terbaru
      </div>

      <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">
        Download Cakapp Desktop App
      </h1>
      <p className="mt-4 text-slate-300 max-w-xl mx-auto">
        Pasang aplikasi desktop di komputer Anda untuk mulai merekam panggilan Zoom, Google Meet, dan Microsoft Teams secara otomatis tanpa bot.
      </p>

      {/* OS Cards Grid */}
      <div className="mt-12 grid md:grid-cols-3 gap-6 text-left">
        {/* Windows Card */}
        <div className="relative rounded-2xl border-2 border-blue-500/60 bg-slate-900/80 p-6 shadow-xl shadow-blue-500/10 flex flex-col justify-between">
          <div>
            <div className="inline-block rounded-md bg-blue-500/20 px-2 py-0.5 text-[11px] font-bold text-blue-300 mb-3">
              PALING POPULER
            </div>
            <div className="text-3xl mb-3">🪟</div>
            <h2 className="text-xl font-bold text-white">Windows</h2>
            <p className="text-xs text-slate-400 mt-1">Windows 10 versi 2004 atau Windows 11 (64-bit)</p>
          </div>
          <div className="mt-8">
            <a
              href="https://github.com/yudstrz/cakapp/releases"
              target="_blank"
              rel="noreferrer"
              className="block w-full text-center rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-500 transition-colors"
            >
              Download Installer (.exe)
            </a>
          </div>
        </div>

        {/* macOS Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div>
            <div className="text-3xl mb-3">🍎</div>
            <h2 className="text-xl font-bold text-white">macOS</h2>
            <p className="text-xs text-slate-400 mt-1">Universal: Apple Silicon (M1/M2/M3/M4) & Intel x64</p>
          </div>
          <div className="mt-8">
            <a
              href="https://github.com/yudstrz/cakapp/releases"
              target="_blank"
              rel="noreferrer"
              className="block w-full text-center rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              Download Disk (.dmg)
            </a>
          </div>
        </div>

        {/* Linux Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div>
            <div className="text-3xl mb-3">🐧</div>
            <h2 className="text-xl font-bold text-white">Linux</h2>
            <p className="text-xs text-slate-400 mt-1">Ubuntu 22.04+ & Distribusi Modern (glibc 2.35+)</p>
          </div>
          <div className="mt-8">
            <a
              href="https://github.com/yudstrz/cakapp/releases"
              target="_blank"
              rel="noreferrer"
              className="block w-full text-center rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              Download .AppImage
            </a>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-16 rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-left max-w-2xl mx-auto">
        <h3 className="text-base font-semibold text-white mb-4">Cara Memulai dalam 3 Langkah:</h3>
        <ol className="space-y-3 text-sm text-slate-300 list-decimal list-inside">
          <li>Unduh file installer sesuai sistem operasi komputer Anda.</li>
          <li>Buka file installer dan ikuti petunjuk pemasangan satu-klik.</li>
          <li>Buka panggilan meeting di Zoom/Google Meet, dan Cakapp otomatis merekam tanpa bot!</li>
        </ol>
      </div>
    </div>
  );
}
