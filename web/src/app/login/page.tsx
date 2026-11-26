'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

function useElectronQuery() {
  const [query, setQuery] = useState<Record<string, string>>({});
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next: Record<string, string> = {};
    for (const key of ['client_id', 'state', 'code_challenge']) {
      const val = params.get(key);
      if (val) next[key] = val;
    }
    setQuery(next);
  }, []);
  return query;
}

export default function LoginPage() {
  const router = useRouter();
  const electronQuery = useElectronQuery();
  const isElectronFlow = Boolean(electronQuery.client_id && electronQuery.code_challenge);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [handoffDone, setHandoffDone] = useState(false);

  useEffect(() => {
    const id = authClient.ensureElectronRedirect();
    return () => clearTimeout(id);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
        ...(isElectronFlow ? { fetchOptions: { query: electronQuery } } : {}),
      });
      if (res.error) {
        setError(res.error.message || 'Gagal masuk. Periksa kembali email dan password Anda.');
        return;
      }
      if (isElectronFlow) {
        setHandoffDone(true);
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

  async function handleGoogle() {
    setError('');
    setLoading(true);
    try {
      const res = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/dashboard',
        ...(isElectronFlow ? { fetchOptions: { query: electronQuery } } : {}),
      });
      if (res?.error) {
        setError(res.error.message || 'Login Google belum tersedia atau gagal.');
      }
    } catch {
      setError('Gagal memulai login Google.');
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
            {isElectronFlow
              ? 'Masuk di browser untuk mengaktifkan sesi aplikasi desktop Cakapp Anda.'
              : 'Akses seluruh transkrip dan notulen rapat Anda dari mana saja.'}
          </p>
        </div>

        {handoffDone && (
          <div className="mb-4 rounded-lg border border-emerald-800/60 bg-emerald-950/40 p-3 text-xs text-emerald-300">
            Login berhasil. Anda sedang dialihkan kembali ke aplikasi desktop Cakapp.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={handleGoogle}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/80 py-2.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          Lanjutkan dengan Google
        </button>

        <div className="relative my-4 flex items-center">
          <div className="flex-grow border-t border-zinc-800" />
          <span className="mx-3 text-[11px] text-zinc-500">atau email</span>
          <div className="flex-grow border-t border-zinc-800" />
        </div>

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
