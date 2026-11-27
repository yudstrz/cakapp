'use client';

import React from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
        <h2 className="font-display text-lg font-semibold text-ink mb-2">Gagal Memuat Dashboard</h2>
        <p className="text-xs sm:text-sm text-written mb-6">
          {error.message || 'Terjadi kendala saat menghubungkan ke database cloud.'}
        </p>
        <button
          onClick={() => reset()}
          type="button"
          className="min-h-[44px] rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-ink hover:opacity-90 transition-opacity"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
