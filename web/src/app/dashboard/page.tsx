import React from 'react';
import Link from 'next/link';
import { getDb } from '@/lib/neon';
import { getCurrentUser } from '@/lib/auth';
import { SHOWCASE_MEETING } from '@/lib/showcase';

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

  const showcaseDateStr = new Date(SHOWCASE_MEETING.started_at).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

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
                Akun: {user.email}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-zinc-400">
            {user
              ? `Selamat datang, ${user.full_name}. Di bawah ini adalah daftar rapat pribadi yang terekam dari komputer Anda.`
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

      {/* Guest notice banner with call to action */}
      {!user && (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-zinc-300">
            <span className="font-semibold text-zinc-100 block sm:inline mr-2">
              Pratinjau Showcase Contoh Rapat
            </span>
            Data rapat Anda bersifat pribadi dan tidak dipublikasikan ke publik. Di bawah ini ditampilkan 1 contoh hasil rekaman percakapan kombinasi bahasa beserta ringkasan AI.
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

      {/* Database warning notice if any */}
      {!isConfigured && (
        <div className="mt-6 rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-xs text-amber-200">
          <div className="font-medium mb-1">Perhatian Konfigurasi Database:</div>
          <div>{statusNotice}</div>
        </div>
      )}

      {/* LOGGED IN USER: Personal Meetings */}
      {user && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            Rapat Pribadi Saya ({userMeetings.length})
          </h2>

          {userMeetings.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30 mb-8">
              <h3 className="text-sm font-semibold text-zinc-200">Belum Ada Sesi Rapat Pribadi</h3>
              <p className="mt-1 text-xs text-zinc-400 max-w-sm mx-auto">
                Buka aplikasi Cakapp di komputer Anda saat rapat online. Hasil rekaman otomatis tersinkron ke akun ini.
              </p>
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
        </div>
      )}

      {/* SHOWCASE SECTION (Always available as high-craft reference) */}
      <div className={user ? 'mt-8 border-t border-zinc-800/80 pt-8' : 'mt-6'}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Contoh Hasil Notulen & Transkrip (Showcase)
          </h2>
          <span className="rounded bg-zinc-800 border border-zinc-700/60 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            Showcase Demo
          </span>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 hover:bg-zinc-900/50 transition-colors">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                  {SHOWCASE_MEETING.app}
                </span>
                <span className="rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-400">
                  {SHOWCASE_MEETING.language}
                </span>
              </div>
              <h3 className="font-semibold text-sm sm:text-base text-zinc-100">
                {SHOWCASE_MEETING.title}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                <span>{showcaseDateStr}</span>
                <span className="text-zinc-600">•</span>
                <span>Durasi: 37 detik</span>
                <span className="text-zinc-600">•</span>
                <span>{SHOWCASE_MEETING.attendees.length} Peserta (Budi Santoso, Sarah Wijaya)</span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-2 sm:mt-0 shrink-0">
              <Link
                href="/dashboard/meetings/showcase-demo"
                className="w-full sm:w-auto text-center rounded-md bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-white transition-colors"
              >
                Buka Notulen Contoh &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
