import { randomBytes } from 'node:crypto';
import type { NeonQueryFunction } from '@neondatabase/serverless';
export { MAX_AUDIO_UPLOAD_CHUNK_BYTES, MAX_CLOUD_AUDIO_BYTES } from './audio-upload-client';

export type ShareMode = 'private' | 'workspace' | 'public';
export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

let schemaReadyPromise: Promise<void> | null = null;

/** Ensure Hari 4 portal tables and columns exist idempotently once per server instance. */
export async function ensurePortalSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          owner_id TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS workspace_members (
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          user_id TEXT,
          role TEXT NOT NULL DEFAULT 'viewer',
          invited_by TEXT,
          created_at TIMESTAMPTZ DEFAULT now(),
          PRIMARY KEY (workspace_id, email)
        )
      `;
      await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS workspace_id TEXT`;
      await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS share_token TEXT`;
      await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS share_mode TEXT NOT NULL DEFAULT 'private'`;
      await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS audio_url TEXT`;
      await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS audio_mime TEXT`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_share_token ON meetings(share_token) WHERE share_token IS NOT NULL`;
      await sql`
        CREATE TABLE IF NOT EXISTS meeting_audio_chunks (
          meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
          chunk_index INT NOT NULL,
          mime_type TEXT NOT NULL,
          data BYTEA NOT NULL,
          total_bytes INT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now(),
          PRIMARY KEY (meeting_id, chunk_index)
        )
      `;
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

export function resetPortalSchemaCacheForTests() {
  schemaReadyPromise = null;
}

export function generateShareToken(): string {
  return randomBytes(12).toString('base64url');
}

export interface AccessibleMeetingRow {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  title: string;
  started_at: string | number;
  ended_at: string | number | null;
  attendees: unknown;
  language: string | null;
  app: string | null;
  state: string;
  share_token: string | null;
  share_mode: ShareMode;
  audio_url: string | null;
  audio_mime: string | null;
}

export async function getMeetingAccess(
  sql: NeonQueryFunction<false, false>,
  meetingId: string,
  userId: string,
  userEmail?: string | null,
): Promise<{ meeting: AccessibleMeetingRow; role: WorkspaceRole } | null> {
  await ensurePortalSchema(sql);
  const rows = (await sql`
    SELECT id, user_id, workspace_id, title, started_at, ended_at, attendees, language, app, state,
           share_token, COALESCE(share_mode, 'private') AS share_mode, audio_url, audio_mime
    FROM meetings
    WHERE id = ${meetingId}
    LIMIT 1
  `) as AccessibleMeetingRow[];

  const meeting = rows[0];
  if (!meeting) return null;

  if (meeting.user_id === userId) {
    return { meeting, role: 'owner' };
  }

  if (meeting.share_mode === 'workspace' && meeting.workspace_id) {
    const cleanEmail = (userEmail || '').trim().toLowerCase();
    const memberRows = (await sql`
      SELECT role FROM workspace_members
      WHERE workspace_id = ${meeting.workspace_id}
        AND (user_id = ${userId} OR (${cleanEmail} <> '' AND lower(email) = ${cleanEmail}))
      LIMIT 1
    `) as Array<{ role?: string }>;

    const rawRole = memberRows[0]?.role;
    if (rawRole === 'owner' || rawRole === 'editor' || rawRole === 'viewer') {
      return { meeting, role: rawRole };
    }

    const wsOwnerRows = (await sql`
      SELECT id FROM workspaces WHERE id = ${meeting.workspace_id} AND owner_id = ${userId} LIMIT 1
    `) as Array<{ id: string }>;
    if (wsOwnerRows.length > 0) {
      return { meeting, role: 'owner' };
    }
  }

  return null;
}

export async function getPublicSharedMeeting(
  sql: NeonQueryFunction<false, false>,
  token: string,
): Promise<AccessibleMeetingRow | null> {
  if (!token || token.length > 64) return null;
  await ensurePortalSchema(sql);
  const rows = (await sql`
    SELECT id, user_id, workspace_id, title, started_at, ended_at, attendees, language, app, state,
           share_token, COALESCE(share_mode, 'private') AS share_mode, audio_url, audio_mime
    FROM meetings
    WHERE share_token = ${token} AND share_mode = 'public'
    LIMIT 1
  `) as AccessibleMeetingRow[];
  return rows[0] ?? null;
}
