'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authClient.signUp.email({
        name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      if (res.error) {
        setError(res.error.message || 'Pendaftaran gagal. Periksa data Anda.');
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
      });
      if (res?.error) {
        setError(res.error.message || 'Daftar dengan Google belum tersedia atau gagal.');
      }
    } catch {
      setError('Gagal memulai pendaftaran dengan Google.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-20">
      <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">
            Buat Akun Cakapp
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-written">
            Daftar untuk menyinkronkan dan membagikan riwayat notulen rapat Anda.
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-700/40 bg-red-500/10 p-3 text-xs text-ink">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={handleGoogle}
          className="mb-4 flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-control bg-float py-2.5 text-xs font-semibold text-ink transition-colors hover:bg-chrome disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
            <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
          </svg>
          Daftar dengan Google
        </button>

        <div className="relative my-4 flex items-center">
          <div className="flex-grow border-t border-line" />
          <span className="mx-3 text-xs text-muted">atau email</span>
          <div className="flex-grow border-t border-line" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1.5" htmlFor="fullName">
              Nama Lengkap
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nama Anda"
              className="w-full min-h-[44px] rounded-xl border border-control bg-float px-3.5 py-2 text-sm text-ink placeholder:text-muted"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1.5" htmlFor="email">
              Email Kantor / Pribadi
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@perusahaan.com"
              className="w-full min-h-[44px] rounded-xl border border-control bg-float px-3.5 py-2 text-sm text-ink placeholder:text-muted"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1.5" htmlFor="password">
              Password (Minimal 8 karakter)
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
              className="w-full min-h-[44px] rounded-xl border border-control bg-float px-3.5 py-2 text-sm text-ink placeholder:text-muted"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Mendaftarkan...' : 'Daftar Sekarang'}
          </button>
        </form>

        <div className="mt-6 border-t border-line pt-5 text-center text-xs text-written">
          Sudah memiliki akun?{' '}
          <a href="/login" className="font-semibold text-accent hover:underline">
            Masuk di sini
          </a>
        </div>
      </div>
    </div>
  );
}
