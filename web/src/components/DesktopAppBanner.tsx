'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { detectVisitorOs } from './DesktopDownloadHub';

const DISMISS_KEY = 'cakapp:hide-desktop-banner';

export default function DesktopAppBanner({ hasDesktopMeetings }: { hasDesktopMeetings: boolean }) {
  const [visible, setVisible] = useState(false);
  const [osLabel, setOsLabel] = useState('Windows');

  useEffect(() => {
    if (hasDesktopMeetings) return;
    const ua = navigator.userAgent || '';
    // Do not show desktop installer banner on mobile phones.
    if (/android|iphone|ipad|mobile/i.test(ua)) return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      // Ignore storage error.
    }
    const os = detectVisitorOs(ua);
    setOsLabel(os === 'mac' ? 'macOS' : os === 'linux' ? 'Linux' : 'Windows');
    setVisible(true);
  }, [hasDesktopMeetings]);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore storage error.
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-line bg-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-accent">Belum ada rekaman dari aplikasi desktop?</p>
        <p className="text-xs sm:text-sm text-ink">
          Pasang Cakapp Desktop untuk {osLabel} agar panggilan Zoom, Google Meet, dan Teams otomatis direkam tanpa bot dan tersinkron ke sini.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <Link
          href="/download"
          className="inline-flex min-h-[44px] sm:min-h-[38px] items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-ink hover:opacity-90 transition-opacity"
        >
          Unduh Aplikasi Desktop
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex min-h-[44px] sm:min-h-[38px] items-center justify-center rounded-xl border border-control bg-float px-3 py-2 text-xs font-medium text-ink hover:bg-chrome transition-colors"
        >
          Tutup
        </button>
      </div>
    </div>
  );
}
