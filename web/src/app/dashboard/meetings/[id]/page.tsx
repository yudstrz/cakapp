import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/lib/neon';
import { getCurrentUser } from '@/lib/auth';
import { SHOWCASE_MEETING } from '@/lib/showcase';
import { getMeetingAccess, type ShareMode, type WorkspaceRole } from '@/lib/meetings';
import AudioPlayer from '@/components/AudioPlayer';
import CloudAiMeetingSection from '@/components/CloudAiMeetingSection';
import ShareMeetingPanel from '@/components/ShareMeetingPanel';

export const revalidate = 0;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} detik`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}d`;
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  let meeting: {
    id: string;
    title: string;
    started_at: string | number;
    ended_at: string | number | null;
    attendees: unknown;
    language: string | null;
    app: string | null;
    audio_url: string | null;
    share_mode: ShareMode;
    share_token: string | null;
    workspace_id: string | null;
  };
  let notes: { mine?: string; enhanced?: string } | null = null;
  let transcriptRows: Array<{
    id: number;
    speaker: string;
    role?: string;
    track: 'me' | 'them';
    start_ms: number;
    end_ms: number;
    text: string;
  }> = [];
  let userRole: WorkspaceRole = 'owner';
  const isShowcase = id === 'showcase-demo';

  if (isShowcase) {
    meeting = {
      id: SHOWCASE_MEETING.id,
      title: SHOWCASE_MEETING.title,
      started_at: SHOWCASE_MEETING.started_at,
      ended_at: SHOWCASE_MEETING.ended_at,
      attendees: SHOWCASE_MEETING.attendees,
      language: SHOWCASE_MEETING.language,
      app: SHOWCASE_MEETING.app,
      audio_url: SHOWCASE_MEETING.audioUrl || '/audio/showcase.wav',
      share_mode: 'public',
      share_token: null,
      workspace_id: null,
    };
    notes = SHOWCASE_MEETING.notes;
    transcriptRows = SHOWCASE_MEETING.transcripts;
  } else {
    if (!user) {
      redirect('/login');
    }

    const sql = getDb();
    if (!sql) {
      return (
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-written">
          Database cloud tidak tersedia.
        </div>
      );
    }

    const access = await getMeetingAccess(sql, id, user.id, user.email);
    if (!access) {
      notFound();
    }

    meeting = access.meeting;
    userRole = access.role;

    const noteRows = (await sql`
      SELECT mine, enhanced, updated_at
      FROM notes
      WHERE meeting_id = ${id}
      LIMIT 1
    `) as Array<{ mine?: string; enhanced?: string }>;
    notes = noteRows[0] || null;

    const rawTranscripts = (await sql`
      SELECT id, track, start_ms, end_ms, text, speaker
      FROM transcripts
      WHERE meeting_id = ${id}
      ORDER BY start_ms ASC
    `) as Array<{
      id: number;
      track: string;
      start_ms: number;
      end_ms: number;
      text: string;
      speaker: string | null;
    }>;

    transcriptRows = rawTranscripts.map((t) => ({
      id: Number(t.id),
      track: t.track === 'me' ? 'me' : 'them',
      start_ms: Number(t.start_ms),
      end_ms: Number(t.end_ms),
      text: t.text,
      speaker: t.speaker || (t.track === 'me' ? 'Anda' : 'Peserta'),
    }));
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
  const attendees = Array.isArray(meeting.attendees) ? (meeting.attendees as Array<{ name?: string; email?: string }>) : [];
  const canEdit = !isShowcase && (userRole === 'owner' || userRole === 'editor');

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
        >
          Kembali ke Dashboard Rapat
        </Link>
      </div>

      <div className="rounded-2xl border border-line bg-card p-5 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {isShowcase && <span className="font-semibold text-accent">Contoh Showcase</span>}
              <span className="font-medium text-ink">{meeting.app || 'Panggilan'}</span>
              <span>·</span>
              <span>Bahasa: {meeting.language || 'ID'}</span>
              {durationMs && durationMs > 0 && (
                <>
                  <span>·</span>
                  <span>Durasi {formatDuration(durationMs)}</span>
                </>
              )}
              {!isShowcase && (
                <>
                  <span>·</span>
                  <span>Akses: {userRole.toUpperCase()}</span>
                </>
              )}
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink tracking-tight">
              {meeting.title || 'Rapat Tanpa Judul'}
            </h1>

            <div className="text-xs sm:text-sm text-written">
              <span>{dateStr}</span>
              {attendees.length > 0 && (
                <span className="block sm:inline sm:ml-2 text-muted">
                  · Peserta: {attendees.map((a) => a.name || a.email).filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          </div>

          {!isShowcase && userRole === 'owner' && (
            <div className="shrink-0">
              <ShareMeetingPanel
                meetingId={id}
                initialMode={meeting.share_mode}
                initialToken={meeting.share_token}
                initialWorkspaceId={meeting.workspace_id}
              />
            </div>
          )}
        </div>
      </div>

      <AudioPlayer
        audioUrl={meeting.audio_url}
        transcripts={transcriptRows}
        durationMs={durationMs}
        meetingId={isShowcase ? undefined : id}
        canUploadCloudAudio={canEdit}
      />

      <CloudAiMeetingSection
        meetingId={id}
        initialContent={notes?.enhanced || notes?.mine || ''}
        transcripts={transcriptRows}
        readOnly={isShowcase || !canEdit}
      />
    </div>
  );
}
