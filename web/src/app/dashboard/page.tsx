import React from 'react';
import Link from 'next/link';
import { getDb } from '@/lib/neon';
import { getCurrentUser } from '@/lib/auth';

export const revalidate = 0;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  let meetings: any[] = [];
  let isConfigured = true;
  let statusNotice = '';

  const sql = getDb();
  if (!sql) {
    isConfigured = false;
    statusNotice = 'DATABASE_URL belum ditambahkan di menu Environment Variables Vercel.';
  } else {
    try {
      if (user) {
        // Query user's meetings (or unassigned meetings for demonstration)
        meetings = (await sql`
          SELECT id, user_id, title, started_at, attendees, language, sync_version 
          FROM meetings 
          WHERE user_id = ${user.id} OR user_id IS NULL
          ORDER BY started_at DESC 
          LIMIT 30;
        `) as any[];
      } else {
        // Guest mode / public preview
        meetings = (await sql`
          SELECT id, user_id, title, started_at, attendees, language, sync_version 
          FROM meetings 
          ORDER BY started_at DESC 
          LIMIT 20;
        `) as any[];
      }
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
              Riwayat Rapat Cloud
            </h1>
            {user && (
              <span className="rounded-full bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-0.5 text-[10px] font-medium text-emerald-300">
                Terhubung: {user.email}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-zinc-400">
            {user
              ? `Selamat datang, ${user.full_name}. Notulen rapat Anda tersimpan rapi dan aman di cloud.`
              : 'Notulen dan rekaman yang terekam dari aplikasi desktop tersinkron ke sini.'}
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

      {/* Guest notice banner */}
      {!user && isConfigured && (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-zinc-300">
            <span className="font-semibold text-zinc-100 block sm:inline mr-2">
              Mode Tamu / Pratinjau Publik
            </span>
            Masuk atau buat akun baru agar hasil rekaman panggilan di laptop Anda tersimpan eksklusif di ruang rapat pribadi Anda.
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors"
            >
              Masuk
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-white transition-colors"
            >
              Daftar Akun
            </Link>
          </div>
        </div>
      )}

      {/* Database warning notice */}
      {!isConfigured && (
        <div className="mt-6 rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-xs text-amber-200">
          <div className="font-medium mb-1">Perhatian Konfigurasi Database:</div>
          <div>{statusNotice}</div>
          <div className="mt-2 text-zinc-400">
            Buka Vercel $\rightarrow$ Project Settings $\rightarrow$ Environment Variables $\rightarrow$ tambahkan <code className="text-amber-300">DATABASE_URL</code> dengan connection string Neon Anda.
          </div>
        </div>
      )}

      {isConfigured && statusNotice && (
        <div className="mt-6 rounded-lg border border-red-800/60 bg-red-950/30 p-4 text-xs text-red-200">
          {statusNotice}
        </div>
      )}

      {/* Empty State */}
      {meetings.length === 0 && isConfigured && !statusNotice && (
        <div className="mt-12 text-center py-16 px-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30">
          <div className="mx-auto w-10 h-10 rounded-full border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400 mb-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          </div>
          <h2 className="text-sm sm:text-base font-semibold text-zinc-200">Belum Ada Sesi Rapat</h2>
          <p className="mt-1.5 text-xs text-zinc-400 max-w-sm mx-auto">
            Jalankan aplikasi desktop Cakapp di PC Anda saat panggilan Zoom atau Google Meet untuk mulai merekam. Notulen akan otomatis tersinkron ke sini.
          </p>
          <Link
            href="/download"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-white transition-colors"
          >
            Unduh Aplikasi Desktop
          </Link>
        </div>
      )}

      {/* Meeting List */}
      {meetings.length > 0 && (
        <div className="mt-6 divide-y divide-zinc-800/80 rounded-xl border border-zinc-800 bg-zinc-900/20 overflow-hidden">
          {meetings.map((m) => {
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
                  <h3 className="font-medium text-sm sm:text-base text-zinc-100 truncate">
                    {m.title || 'Rapat Tanpa Judul'}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {dateStr}
                    </span>
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
    </div>
  );
}
