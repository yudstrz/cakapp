import React from 'react';
import DesktopDownloadHub from '@/components/DesktopDownloadHub';

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 sm:py-16 space-y-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">
          Pusat Unduhan Desktop
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink tracking-tight">
          Unduh Cakapp Desktop
        </h1>
        <p className="text-sm sm:text-base text-written max-w-2xl leading-relaxed">
          Pasang aplikasi desktop di komputer Anda untuk merekam panggilan Zoom, Google Meet, dan Microsoft Teams secara native tanpa bot, lalu kelola notulennya di web portal ini.
        </p>
      </div>

      <DesktopDownloadHub />
    </div>
  );
}
