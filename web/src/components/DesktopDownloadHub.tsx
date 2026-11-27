'use client';

import React, { useEffect, useState } from 'react';

export type VisitorOs = 'windows' | 'mac' | 'linux';

export const WINDOWS_INSTALLER_URL = 'https://github.com/yudstrz/cakapp/releases/latest/download/Cakapp-windows-x64.exe';
export const RELEASES_PAGE_URL = 'https://github.com/yudstrz/cakapp/releases';
export const BUILD_GUIDE_URL = 'https://github.com/yudstrz/cakapp/blob/main/docs/building.md';

export function detectVisitorOs(userAgent: string): VisitorOs {
  const ua = userAgent.toLowerCase();
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'mac';
  if (ua.includes('linux') && !ua.includes('android')) return 'linux';
  return 'windows';
}

const OS_META: Record<
  VisitorOs,
  {
    name: string;
    subtitle: string;
    fileLabel: string;
    availableBinary: boolean;
    primaryUrl: string;
    primaryLabel: string;
  }
> = {
  windows: {
    name: 'Windows 10 / 11 (x64)',
    subtitle: 'Perekam audio sistem WASAPI tanpa bot, Whisper & LLM lokal + sinkronisasi cloud.',
    fileLabel: 'Cakapp-windows-x64.exe',
    availableBinary: true,
    primaryUrl: WINDOWS_INSTALLER_URL,
    primaryLabel: 'Unduh Cakapp untuk Windows (.exe)',
  },
  mac: {
    name: 'macOS (Apple Silicon)',
    subtitle: 'CoreAudio process tap + Apple SpeechAnalyzer. Installer .dmg sedang disiapkan di rilis berikutnya.',
    fileLabel: 'Cakapp-mac-arm64.dmg (Build dari source)',
    availableBinary: false,
    primaryUrl: BUILD_GUIDE_URL,
    primaryLabel: 'Lihat Panduan Build macOS (.dmg)',
  },
  linux: {
    name: 'Linux (x86_64 AppImage)',
    subtitle: 'PipeWire/ALSA native audio capture untuk Ubuntu 22.04+, siap unduh langsung sebagai AppImage.',
    fileLabel: 'Cakapp-linux-x86_64.AppImage',
    availableBinary: true,
    primaryUrl: 'https://github.com/yudstrz/cakapp/releases/latest/download/Cakapp-linux-x86_64.AppImage',
    primaryLabel: 'Unduh Cakapp untuk Linux (.AppImage)',
  },
};

export default function DesktopDownloadHub({ compact = false }: { compact?: boolean }) {
  const [os, setOs] = useState<VisitorOs>('windows');

  useEffect(() => {
    setOs(detectVisitorOs(navigator.userAgent || ''));
  }, []);

  const current = OS_META[os];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-card p-5 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 max-w-xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Sistem terdeteksi:</span>
              <span className="font-semibold text-ink">{current.name}</span>
              {current.availableBinary && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary-soft px-2 py-0.5 text-[11px] font-semibold text-secondary">
                  <span className="h-1.5 w-1.5 rounded-full bg-secondary-solid" aria-hidden="true" />
                  Siap Diunduh
                </span>
              )}
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-ink">
              {current.fileLabel}
            </h2>
            <p className="text-xs sm:text-sm text-written leading-relaxed">
              {current.subtitle}
            </p>
          </div>

          <div className="flex flex-col gap-2.5 shrink-0">
            <a
              href={current.primaryUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-ink hover:opacity-90 transition-opacity text-center"
            >
              {current.primaryLabel}
            </a>
            {!current.availableBinary && (
              <a
                href={WINDOWS_INSTALLER_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-control bg-float px-5 py-2.5 text-xs font-semibold text-ink hover:bg-chrome transition-colors text-center"
              >
                Unduh Installer Windows (.exe) yang Sudah Tersedia
              </a>
            )}
          </div>
        </div>

        {/* Secondary OS switcher */}
        <div className="mt-5 pt-4 border-t border-line flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Pilih Sistem Operasi">
            <span className="text-xs text-muted mr-1">Format lain:</span>
            {(['windows', 'mac', 'linux'] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={os === item}
                onClick={() => setOs(item)}
                className={`min-h-[44px] sm:min-h-[34px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  os === item
                    ? 'bg-primary text-primary-ink border border-primary'
                    : 'border border-control bg-float text-ink hover:bg-chrome'
                }`}
              >
                {item === 'windows' ? 'Windows (.exe)' : item === 'mac' ? 'macOS (.dmg)' : 'Linux (.AppImage)'}
              </button>
            ))}
          </div>

          <a
            href={RELEASES_PAGE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-accent hover:underline py-2"
          >
            Semua rilis di GitHub
          </a>
        </div>
      </div>

      {!compact && (
        <div className="rounded-2xl border border-line bg-float p-5 sm:p-7">
          <h3 className="font-display text-base sm:text-lg font-semibold text-ink mb-4">
            Panduan Instalasi Kilat
          </h3>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs sm:text-sm">
            <li className="rounded-xl border border-line bg-paper p-4 space-y-1">
              <span className="text-xs font-semibold text-accent">Langkah 1</span>
              <p className="font-semibold text-ink">Pasang Aplikasi</p>
              <p className="text-written leading-relaxed">
                Jalankan file installer Cakapp di komputer Anda. Jika belum ada binary untuk OS Anda, ikuti panduan build lokal.
              </p>
            </li>
            <li className="rounded-xl border border-line bg-paper p-4 space-y-1">
              <span className="text-xs font-semibold text-accent">Langkah 2</span>
              <p className="font-semibold text-ink">Masuk Akun Sekali</p>
              <p className="text-written leading-relaxed">
                Klik Masuk / Daftar di aplikasi agar notulen tersinkron otomatis ke web portal dan bisa memakai Cloud AI bersama.
              </p>
            </li>
            <li className="rounded-xl border border-line bg-paper p-4 space-y-1">
              <span className="text-xs font-semibold text-accent">Langkah 3</span>
              <p className="font-semibold text-ink">Rekam Tanpa Bot</p>
              <p className="text-written leading-relaxed">
                Buka Zoom, Google Meet, atau Teams seperti biasa. Cakapp merekam audio langsung dari sistem tanpa mengirim bot ke ruang rapat.
              </p>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
