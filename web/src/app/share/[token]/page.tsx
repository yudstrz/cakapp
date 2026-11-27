import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/neon';
import { getPublicSharedMeeting } from '@/lib/meetings';
import AudioPlayer from '@/components/AudioPlayer';
import MeetingNotesView from '@/components/MeetingNotesView';

export const revalidate = 0;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} detik`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}d`;
}

export default async function PublicShareMeetingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sql = getDb();
  if (!sql) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-written">
        Layanan cloud tidak tersedia.
      </div>
    );
  }

  const meeting = await getPublicSharedMeeting(sql, token);
  if (!meeting) {
    notFound();
  }

  const noteRows = (await sql`
    SELECT mine, enhanced
    FROM notes
    WHERE meeting_id = ${meeting.id}
    LIMIT 1
  `) as Array<{ mine?: string; enhanced?: string }>;
  const notes = noteRows[0] || null;

  const rawTranscripts = (await sql`
    SELECT id, track, start_ms, end_ms, text, speaker
    FROM transcripts
    WHERE meeting_id = ${meeting.id}
    ORDER BY start_ms ASC
  `) as Array<{
    id: number;
    track: string;
    start_ms: number;
    end_ms: number;
    text: string;
    speaker: string | null;
  }>;

  const transcripts = rawTranscripts.map((t) => ({
    id: Number(t.id),
    track: (t.track === 'me' ? 'me' : 'them') as 'me' | 'them',
    start_ms: Number(t.start_ms),
    end_ms: Number(t.end_ms),
    text: t.text,
    speaker: t.speaker || (t.track === 'me' ? 'Pembicara 1' : 'Peserta'),
  }));

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
  const attendees = Array.isArray(meeting.attendees) ? (meeting.attendees as Array<{ name?: string; email?: string }>) : [];
  const publicAudioUrl = meeting.audio_url ? `/api/share/${encodeURIComponent(token)}/audio` : null;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <div className="rounded-2xl border border-line bg-card p-5 sm:p-8 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-semibold text-accent">Notulen Dibagikan (Hanya Baca)</span>
          <span>·</span>
          <span>{meeting.app || 'Rapat'}</span>
          <span>·</span>
          <span>{meeting.language || 'ID'}</span>
          {durationMs && durationMs > 0 && (
            <>
              <span>·</span>
              <span>Durasi {formatDuration(durationMs)}</span>
            </>
          )}
        </div>

        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink tracking-tight">
          {meeting.title || 'Notulen Rapat'}
        </h1>

        <p className="text-xs sm:text-sm text-written">
          {dateStr}
          {attendees.length > 0 && (
            <span className="block sm:inline sm:ml-2 text-muted">
              · Peserta: {attendees.map((a) => a.name || a.email).filter(Boolean).join(', ')}
            </span>
          )}
        </p>
      </div>

      <AudioPlayer
        audioUrl={publicAudioUrl}
        transcripts={transcripts}
        durationMs={durationMs}
      />

      <div className="rounded-2xl border border-line bg-card p-5 sm:p-7 space-y-4">
        <div className="pb-3 border-b border-line flex items-center justify-between">
          <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
            Ringkasan & Action Items
          </h2>
          <span className="text-xs text-muted">Tautan Publik</span>
        </div>
        <MeetingNotesView content={notes?.enhanced || notes?.mine || ''} />
      </div>

      <div className="text-center text-xs text-muted pt-2">
        Dibagikan melalui <Link href="/" className="font-semibold text-accent hover:underline">Cakapp</Link>.
      </div>
    </div>
  );
}
