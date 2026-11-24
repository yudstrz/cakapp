import React from 'react';
import { getDb } from '@/lib/neon';

export const revalidate = 0; // Dynamic server component

export default async function DashboardPage() {
  let meetings: any[] = [];
  let errorMsg = '';

  try {
    const sql = getDb();
    meetings = (await sql`
      SELECT id, title, started_at, attendees, language, sync_version 
      FROM meetings 
      ORDER BY started_at DESC 
      LIMIT 20
    `) as any[];
  } catch (err: any) {
    errorMsg = err.message || 'Gagal memuat data dari database cloud.';
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-8 border-b border-slate-800">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Dashboard Riwayat Rapat</h1>
          <p className="text-sm text-slate-400 mt-1">Seluruh rapat yang direkam di desktop otomatis tersinkron ke sini.</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/download"
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Download PC Recorder
          </a>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <strong>Perhatian:</strong> {errorMsg} (Pastikan DATABASE_URL sudah dikonfigurasi di Vercel).
        </div>
      )}

      {meetings.length === 0 && !errorMsg ? (
        <div className="mt-16 text-center py-16 rounded-2xl border border-dashed border-slate-800 bg-slate-900/20">
          <div className="text-4xl mb-4">📭</div>
          <h2 className="text-lg font-semibold text-white">Belum Ada Rapat yang Tersinkron</h2>
          <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto">
            Buka aplikasi desktop Cakapp di PC Anda untuk mulai merekam panggilan Zoom/Google Meet pertama Anda.
          </p>
          <a
            href="/download"
            className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            Download Aplikasi Desktop
          </a>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {meetings.map((m) => (
            <div
              key={m.id}
              className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 transition-colors"
            >
              <div>
                <h3 className="font-semibold text-base text-white">{m.title || 'Rapat Tanpa Judul'}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  <span>📅 {new Date(Number(m.started_at)).toLocaleDateString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  <span>🌐 {m.language || 'id'}</span>
                  <span>👥 {Array.isArray(m.attendees) ? m.attendees.length : 0} Peserta</span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 w-full md:w-auto">
                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
                >
                  Buka Notulen & Audio
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
