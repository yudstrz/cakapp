import React from 'react';

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-20 text-center">
      <div className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-300 mb-6">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Versi Desktop v1.0.0
      </div>

      <h1 className="text-2xl sm:text-4xl md:text-5xl font-semibold text-zinc-100 tracking-tight">
        Download Cakapp Desktop
      </h1>
      <p className="mt-3 text-xs sm:text-sm md:text-base text-zinc-400 max-w-xl mx-auto">
        Pasang aplikasi desktop di komputer Anda untuk mulai merekam panggilan Zoom, Google Meet, dan Microsoft Teams secara native tanpa bot.
      </p>

      {/* OS Cards Grid */}
      <div className="mt-10 sm:mt-12 grid grid-cols-1 md:grid-cols-3 gap-5 text-left">
        {/* Windows Card */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Windows</span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-300">Default</span>
            </div>
            <div className="h-8 w-8 rounded-md border border-zinc-700 bg-zinc-800 flex items-center justify-center text-zinc-200 mb-3">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="8" height="8" />
                <rect x="13" y="3" width="8" height="8" />
                <rect x="3" y="13" width="8" height="8" />
                <rect x="13" y="13" width="8" height="8" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-zinc-100">Windows 10 / 11</h2>
            <p className="text-xs text-zinc-400 mt-1">Kompatibel 64-bit (x64), WASAPI Audio Recorder</p>
          </div>
          <div className="mt-6">
            <a
              href="https://github.com/yudstrz/cakapp/releases"
              target="_blank"
              rel="noreferrer"
              className="block w-full text-center rounded-lg bg-zinc-100 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white"
            >
              Unduh Installer (.exe)
            </a>
          </div>
        </div>

        {/* macOS Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 flex flex-col justify-between opacity-80">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">macOS</span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20">Coming Soon</span>
            </div>
            <div className="h-8 w-8 rounded-md border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400 mb-3">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20.94c1.88 0 3.05-.9 4.14-.9 1.1 0 2.14.9 4.1.9 2.5 0 4.76-2.02 4.76-5.02 0-3.32-2.12-5.07-4.22-5.07-1.48 0-2.67.8-3.6.8-.95 0-2.2-.8-3.7-.8-2.6 0-5.48 2.15-5.48 6.3 0 4.14 2.87 7.79 4 7.79Z" />
                <path d="M15.5 2c.2 1.3-.4 2.6-1.2 3.4-.8.8-2 1.4-3.3 1.3-.2-1.3.4-2.5 1.2-3.4.8-.8 2.1-1.4 3.3-1.3Z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-zinc-200">macOS Universal</h2>
            <p className="text-xs text-zinc-400 mt-1">Apple Silicon (M1-M4) & Intel, CoreAudio</p>
          </div>
          <div className="mt-6">
            <button
              type="button"
              disabled
              className="block w-full text-center rounded-lg border border-zinc-800 bg-zinc-900/60 py-2.5 text-xs font-medium text-zinc-500 cursor-not-allowed select-none"
            >
              Coming Soon (.dmg)
            </button>
          </div>
        </div>

        {/* Linux Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 flex flex-col justify-between opacity-80">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Linux</span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20">Coming Soon</span>
            </div>
            <div className="h-8 w-8 rounded-md border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400 mb-3">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-zinc-200">Linux Standalone</h2>
            <p className="text-xs text-zinc-400 mt-1">Ubuntu 22.04+, glibc 2.35+, PipeWire/ALSA</p>
          </div>
          <div className="mt-6">
            <button
              type="button"
              disabled
              className="block w-full text-center rounded-lg border border-zinc-800 bg-zinc-900/60 py-2.5 text-xs font-medium text-zinc-500 cursor-not-allowed select-none"
            >
              Coming Soon (.AppImage)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
