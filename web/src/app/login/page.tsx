'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Gagal masuk. Periksa kembali email dan password Anda.');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Terjadi kendala jaringan. Coba lagi dalam beberapa saat.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:py-24">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 sm:p-8 backdrop-blur-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold text-zinc-100 tracking-tight">
            Masuk ke Cakapp Portal
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-zinc-400">
            Akses seluruh transkrip dan notulen rapat Anda dari mana saja.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="email">
              Email Kantor / Pribadi
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@perusahaan.com"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-zinc-100 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white disabled:opacity-50"
          >
            {loading ? 'Memproses...' : 'Masuk ke Akun'}
          </button>
        </form>

        <div className="mt-6 border-t border-zinc-800/80 pt-5 text-center text-xs text-zinc-400">
          Belum memiliki akun?{' '}
          <a href="/register" className="font-medium text-zinc-200 hover:text-white underline">
            Daftar sekarang
          </a>
        </div>
      </div>
    </div>
  );
}
