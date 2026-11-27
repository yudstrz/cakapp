'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { DESKTOP_SCHEME, buildDesktopCallbackUrl, popElectronAuthCookie } from '@/lib/desktop-scheme';

export default function ElectronRedirectGuard() {
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const checkAndTrigger = useCallback(() => {
    const code = popElectronAuthCookie();
    if (!code) return false;
    const url = buildDesktopCallbackUrl(code, DESKTOP_SCHEME);
    setHandoffUrl(url);
    setDismissed(false);
    // Defer redirect slightly so fallback banner renders in case the browser blocks automatic custom-scheme launch.
    window.setTimeout(() => {
      try {
        window.location.assign(url);
      } catch {
        // Fallback button remains visible for manual click.
      }
    }, 80);
    return true;
  }, []);

  useEffect(() => {
    checkAndTrigger();
    const start = Date.now();
    const timer = window.setInterval(() => {
      if (checkAndTrigger() || Date.now() - start > 15_000) {
        window.clearInterval(timer);
      }
    }, 250);
    const onManual = () => { checkAndTrigger(); };
    window.addEventListener('cakapp:electron-handoff', onManual);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('cakapp:electron-handoff', onManual);
    };
  }, [checkAndTrigger]);

  if (!handoffUrl || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-secondary-solid/30 bg-secondary-soft/80 px-4 py-3 text-ink"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs sm:text-sm">
          <p className="font-semibold text-ink">
            Login berhasil. Menghubungkan akun ke aplikasi desktop Cakapp...
          </p>
          <p className="text-written">
            Jika Cakapp Desktop tidak terbuka otomatis, klik tombol di sebelah kanan.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={handoffUrl}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-ink hover:opacity-90 transition-opacity"
          >
            Buka Cakapp Desktop
          </a>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-control bg-float px-3 py-2 text-xs font-medium text-ink hover:bg-chrome transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
