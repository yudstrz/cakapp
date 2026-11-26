import React from 'react';
import Link from 'next/link';
import { getDb } from '@/lib/neon';
import { getCurrentUser } from '@/lib/auth';
import WebAudioStudioCard from '@/components/WebAudioStudioCard';

export const revalidate = 0;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  let userMeetings: any[] = [];
  let isConfigured = true;
  let statusNotice = '';

  const sql = getDb();
  if (!sql) {
    isConfigured = false;
    statusNotice = 'DATABASE_URL belum ditambahkan di menu Environment Variables Vercel.';
  } else if (user) {
    try {
      userMeetings = (await sql`
        SELECT id, user_id, title, started_at, attendees, language, sync_version 
        FROM meetings 
        WHERE user_id = ${user.id}
        ORDER BY started_at DESC 
        LIMIT 30;
      `) as any[];
    } catch (err: any) {
      statusNotice = err.message || 'Gagal memuat data dari database cloud.';
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100">
              Dashboard Rapat
            </h1>
            {user && (
              <span className="rounded-full bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-0.5 text-[10px] font-medium text-emerald-300">
                {user.email}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-zinc-400">
            {user
              ? `Selamat datang, ${user.full_name}. Di bawah ini adalah daftar rapat pribadi Anda.`
              : 'Portal viewer hasil rekaman notulen dan transkrip audio rapat.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/download"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Unduh Recorder PC
          </Link>
        </div>
      </div>

      {/* Database warning notice if any */}
      {!isConfigured && (
        <div className="mt-6 rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-xs text-amber-200">
          <div className="font-medium mb-1">Perhatian Konfigurasi Database:</div>
          <div>{statusNotice}</div>
        </div>
      )}

      {/* GUEST VIEW: Prompts to Login/Register with direct link to Home Showcase */}
      {!user && (
        <div className="mt-8 space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-8 text-center max-w-xl mx-auto">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 mb-4">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            <h2 className="text-base sm:text-lg font-semibold text-zinc-100">
              Akses Ruang Rapat Pribadi
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Data rekaman dan notulen Anda bersifat privat. Masuk atau buat akun baru untuk melihat daftar rapat yang tersinkronisasi dari komputer Anda.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/login"
                className="w-full sm:w-auto rounded-lg border border-zinc-700 bg-zinc-800 px-5 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                Login ke Akun
              </Link>
              <Link
                href="/register"
                className="w-full sm:w-auto rounded-lg bg-zinc-100 px-5 py-2 text-xs font-semibold text-zinc-950 hover:bg-white transition-colors"
              >
                Register Akun Baru
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/20 p-4 text-center max-w-xl mx-auto">
            <p className="text-xs text-zinc-400">
              Ingin melihat contoh hasil transkrip audio dan ringkasan AI?{' '}
              <Link href="/" className="font-medium text-zinc-200 hover:underline">
                Buka Showcase Demo di Halaman Home &rarr;
              </Link>
            </p>
          </div>
        </div>
      )}

      {user && (
        <div className="mt-8">
          <WebAudioStudioCard />

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Rapat Pribadi Saya ({userMeetings.length})
            </h2>
          </div>

          {userMeetings.length === 0 ? (
            <div className="text-center py-14 px-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30 mb-8">
              <h3 className="text-sm font-semibold text-zinc-200">Belum Ada Sesi Rapat Pribadi</h3>
              <p className="mt-1 text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                Nyalakan aplikasi Cakapp di komputer Anda saat rapat online. Hasil rekaman dan transkrip otomatis tersinkron ke akun ini.
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <Link
                  href="/download"
                  className="rounded-lg bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-white transition-colors"
                >
                  Download Cakapp Desktop
                </Link>
                <Link
                  href="/"
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Lihat Showcase di Home &rarr;
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/80 rounded-xl border border-zinc-800 bg-zinc-900/20 overflow-hidden mb-8">
              {userMeetings.map((m) => {
                const dateStr = m.started_at
                  ? new Date(Number(m.started_at)).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Waktu tidak tersedia';
                const attendeeCount = Array.isArray(m.attendees) ? m.attendees.length : 0;

                return (
                  <div
                    key={m.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 hover:bg-zinc-900/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <h4 className="font-medium text-sm sm:text-base text-zinc-100 truncate">
                        {m.title || 'Rapat Tanpa Judul'}
                      </h4>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                        <span>{dateStr}</span>
                        <span className="text-zinc-600">•</span>
                        <span>Bahasa: {(m.language || 'id').toUpperCase()}</span>
                        <span className="text-zinc-600">•</span>
                        <span>{attendeeCount} Peserta</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-2 sm:mt-0">
                      <Link
                        href={`/dashboard/meetings/${m.id}`}
                        className="w-full sm:w-auto text-center rounded-md bg-zinc-800 border border-zinc-700 px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors"
                      >
                        Buka Notulen
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Discreet link to Showcase Demo */}
          <div className="mt-8 rounded-xl border border-zinc-800/60 bg-zinc-900/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span className="text-zinc-400">
              Contoh format notulen dan audio player dapat dilihat di halaman Showcase Demo.
            </span>
            <Link
              href="/dashboard/meetings/showcase-demo"
              className="text-zinc-300 hover:text-white font-medium underline-offset-4 hover:underline shrink-0"
            >
              Lihat Notulen Showcase &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
