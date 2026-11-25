import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/lib/neon';
import { getCurrentUser } from '@/lib/auth';
import { SHOWCASE_MEETING } from '@/lib/showcase';

export const revalidate = 0;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}d`;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  let meeting: any;
  let notes: any = null;
  let transcriptRows: any[] = [];
  const isShowcase = id === 'showcase-demo';

  if (isShowcase) {
    meeting = SHOWCASE_MEETING;
    notes = SHOWCASE_MEETING.notes;
    transcriptRows = SHOWCASE_MEETING.transcripts;
  } else {
    if (!user) {
      redirect('/login');
    }

    const sql = getDb();
    if (!sql) {
      return (
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-zinc-400">
          Database cloud tidak tersedia.
        </div>
      );
    }

    const meetingRows = (await sql`
      SELECT id, user_id, title, started_at, ended_at, attendees, language, app, state
      FROM meetings
      WHERE id = ${id} AND (user_id = ${user.id} OR user_id IS NULL)
      LIMIT 1
    `) as any[];

    if (meetingRows.length === 0) {
      notFound();
    }

    meeting = meetingRows[0];

    const noteRows = (await sql`
      SELECT mine, enhanced, updated_at
      FROM notes
      WHERE meeting_id = ${id}
      LIMIT 1
    `) as any[];
    notes = noteRows[0] || null;

    transcriptRows = (await sql`
      SELECT id, track, start_ms, end_ms, text, speaker
      FROM transcripts
      WHERE meeting_id = ${id}
      ORDER BY start_ms ASC
    `) as any[];
  }

  const dateStr = meeting.started_at
    ? new Date(Number(meeting.started_at)).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Waktu tidak tersedia';

  const durationMs = meeting.ended_at && meeting.started_at ? Number(meeting.ended_at) - Number(meeting.started_at) : null;
  const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12">
      {/* Back button */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Kembali ke Riwayat Rapat
        </Link>
      </div>

      {/* Header Card */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-8 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {isShowcase && (
            <span className="rounded bg-amber-950/80 border border-amber-800/60 px-2.5 py-0.5 text-[10px] font-medium text-amber-300">
              Showcase Demo
            </span>
          )}
          <span className="rounded bg-zinc-800 px-2.5 py-0.5 text-[10px] font-medium text-zinc-300 uppercase tracking-wider">
            {meeting.app || 'Panggilan'}
          </span>
          <span className="rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-400">
            Bahasa: {meeting.language || 'ID'}
          </span>
          {durationMs && (
            <span className="rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-400">
              Durasi: {formatDuration(durationMs)}
            </span>
          )}
        </div>

        <h1 className="text-xl sm:text-3xl font-semibold text-zinc-100 tracking-tight">
          {meeting.title || 'Rapat Tanpa Judul'}
        </h1>

        <div className="mt-2 text-xs sm:text-sm text-zinc-400">
          <span>{dateStr}</span>
          {attendees.length > 0 && (
            <span className="ml-3 text-zinc-500">
              • Peserta: {attendees.map((a: any) => a.name || a.email).join(', ')}
            </span>
          )}
        </div>

        {isShowcase && (
          <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-200">
                <svg className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </span>
              <div>
                <div className="text-xs font-medium text-zinc-200">Pemutar Audio Rekaman (Simulasi Sinkron Karaoke)</div>
                <div className="text-[11px] text-zinc-400">Menangkap audio percakapan dual-track langsung dari sistem operasi</div>
              </div>
            </div>
            <span className="text-xs font-mono text-zinc-400 shrink-0">01:08 / 30:00</span>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="mt-8 grid grid-cols-1 gap-8">
        {/* AI Notes Section */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/80">
            <h2 className="text-sm sm:text-base font-semibold text-zinc-100 flex items-center gap-2">
              <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Notulen & Ringkasan Rapat
            </h2>
          </div>

          {notes?.enhanced ? (
            <div className="prose prose-invert max-w-none text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {notes.enhanced}
            </div>
          ) : notes?.mine ? (
            <div className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {notes.mine}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 italic">
              Belum ada ringkasan notulen tersimpan untuk sesi rapat ini.
            </p>
          )}
        </div>

        {/* Transcripts Dialogue Section */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/80">
            <h2 className="text-sm sm:text-base font-semibold text-zinc-100 flex items-center gap-2">
              <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Transkrip Percakapan ({transcriptRows.length} baris)
            </h2>
          </div>

          {transcriptRows.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">
              Belum ada baris transkrip tersimpan untuk rapat ini.
            </p>
          ) : (
            <div className="space-y-4">
              {transcriptRows.map((tr: any) => {
                const isMe = tr.track === 'me';
                const speakerLabel = tr.speaker || (isMe ? 'Saya' : 'Lawan Bicara');

                return (
                  <div key={tr.id} className="flex gap-3 text-xs sm:text-sm">
                    <span className="font-mono text-[11px] text-zinc-500 pt-0.5 shrink-0 select-none">
                      {formatTimestamp(Number(tr.start_ms))}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs font-semibold ${isMe ? 'text-zinc-200' : 'text-zinc-400'}`}>
                          {speakerLabel}
                        </span>
                        <span className="text-[10px] text-zinc-600">
                          ({isMe ? 'Mic' : 'Speaker'})
                        </span>
                      </div>
                      <p className="text-zinc-300 leading-relaxed">{tr.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
