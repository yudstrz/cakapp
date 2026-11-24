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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-zinc-100 mb-2">Gagal Memuat Dashboard</h2>
        <p className="text-xs text-zinc-400 mb-6">
          {error.message || 'Terjadi kendala saat menghubungkan ke database cloud.'}
        </p>
        <button
          onClick={() => reset()}
          type="button"
          className="rounded-lg bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-white transition-colors"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
