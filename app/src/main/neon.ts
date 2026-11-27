import { readFileSync, statSync } from 'node:fs'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { loadAppEnv } from './env'
import type { Folder, Meeting, Notes, Segment } from './store'

const MAX_CLOUD_AUDIO_BYTES = 25 * 1024 * 1024
const MAX_AUDIO_CHUNK_BYTES = 1_500_000

loadAppEnv()

let cachedSql: NeonQueryFunction<false, false> | undefined
let schemaInitialized = false

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED
}

export function isNeonConfigured(): boolean {
  return !!getDatabaseUrl()
}

export function getNeonClient(): NeonQueryFunction<false, false> {
  const url = getDatabaseUrl()
  if (!url) throw new Error('DATABASE_URL is not configured for Neon')
  if (!cachedSql) {
    cachedSql = neon(url)
  }
  return cachedSql
}

export async function checkNeonHealth(): Promise<{ ok: boolean; timestamp?: string; version?: string; error?: string }> {
  try {
    if (!isNeonConfigured()) return { ok: false, error: 'DATABASE_URL is not configured' }
    const sql = getNeonClient()
    const rows = await sql`SELECT 1 as connected, now() as timestamp, version()` as Array<{ connected: number; timestamp: string; version: string }>
    return {
      ok: true,
      timestamp: String(rows[0]?.timestamp ?? ''),
      version: String(rows[0]?.version ?? ''),
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function initNeonSchema(): Promise<void> {
  if (schemaInitialized || !isNeonConfigured()) return
  const sql = getNeonClient()
  await sql`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT,
      full_name TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      color TEXT DEFAULT 'default',
      icon TEXT DEFAULT 'folder',
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      workspace_id TEXT,
      folder_id TEXT,
      title TEXT NOT NULL,
      started_at BIGINT NOT NULL,
      ended_at BIGINT,
      event_id TEXT,
      app TEXT,
      attendees JSONB DEFAULT '[]'::jsonb,
      state TEXT NOT NULL,
      language TEXT,
      sync_version INT DEFAULT 1,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS transcripts (
      id BIGSERIAL PRIMARY KEY,
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      track TEXT NOT NULL,
      start_ms INT NOT NULL,
      end_ms INT NOT NULL,
      text TEXT NOT NULL,
      speaker TEXT
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS notes (
      meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
      mine TEXT NOT NULL DEFAULT '',
      enhanced TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS workspace_id TEXT`
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS share_token TEXT`
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS share_mode TEXT NOT NULL DEFAULT 'private'`
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS audio_url TEXT`
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS audio_mime TEXT`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_share_token ON meetings(share_token) WHERE share_token IS NOT NULL`
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
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings(user_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_transcripts_meeting ON transcripts(meeting_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id)`

  // Enable Row Level Security (RLS) on all user data tables
  await sql`ALTER TABLE profiles ENABLE ROW LEVEL SECURITY`
  await sql`ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY`
  await sql`ALTER TABLE folders ENABLE ROW LEVEL SECURITY`
  await sql`ALTER TABLE meetings ENABLE ROW LEVEL SECURITY`
  await sql`ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY`
  await sql`ALTER TABLE notes ENABLE ROW LEVEL SECURITY`

  // Create default permissive policies for authenticated access if not present
  try {
    await sql`CREATE POLICY profiles_all ON profiles FOR ALL USING (true)`
  } catch { /* already exists */ }
  try {
    await sql`CREATE POLICY workspaces_all ON workspaces FOR ALL USING (true)`
  } catch { /* already exists */ }
  try {
    await sql`CREATE POLICY folders_all ON folders FOR ALL USING (true)`
  } catch { /* already exists */ }
  try {
    await sql`CREATE POLICY meetings_all ON meetings FOR ALL USING (true)`
  } catch { /* already exists */ }
  try {
    await sql`CREATE POLICY transcripts_all ON transcripts FOR ALL USING (true)`
  } catch { /* already exists */ }
  try {
    await sql`CREATE POLICY notes_all ON notes FOR ALL USING (true)`
  } catch { /* already exists */ }
  schemaInitialized = true
}

export async function syncMeetingToNeon(m: Meeting, segments: Segment[] = [], notes?: Notes | null): Promise<boolean> {
  if (!isNeonConfigured()) return false
  try {
    await initNeonSchema()
    const sql = getNeonClient()
    const attendeesJson = JSON.stringify(m.attendees ?? [])

    await sql`
      INSERT INTO meetings (
        id, user_id, title, started_at, ended_at, event_id, app, attendees, state, language, updated_at
      ) VALUES (
        ${m.id}, ${m.userId ?? null}, ${m.title}, ${m.startedAt}, ${m.endedAt ?? null},
        ${m.eventId ?? null}, ${m.app ?? null}, ${attendeesJson}::jsonb, ${m.state},
        ${m.language ?? null}, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        ended_at = EXCLUDED.ended_at,
        attendees = EXCLUDED.attendees,
        state = EXCLUDED.state,
        language = EXCLUDED.language,
        updated_at = now()
    `

    if (segments.length > 0) {
      await sql`DELETE FROM transcripts WHERE meeting_id = ${m.id}`
      for (const seg of segments) {
        await sql`
          INSERT INTO transcripts (meeting_id, track, start_ms, end_ms, text, speaker)
          VALUES (${m.id}, ${seg.track}, ${seg.startMs}, ${seg.endMs}, ${seg.text}, ${seg.speaker ?? null})
        `
      }
    }

    if (notes) {
      await sql`
        INSERT INTO notes (meeting_id, mine, enhanced, updated_at)
        VALUES (${m.id}, ${notes.mine ?? ''}, ${notes.enhanced ?? null}, now())
        ON CONFLICT (meeting_id) DO UPDATE SET
          mine = EXCLUDED.mine,
          enhanced = EXCLUDED.enhanced,
          updated_at = now()
      `
    }
    return true
  } catch (err) {
    console.error('Failed to sync meeting to Neon:', err)
    return false
  }
}

export async function syncMeetingAudioToNeon(meetingId: string, filePath: string, mimeType: string): Promise<boolean> {
  if (!isNeonConfigured()) return false
  try {
    const stat = statSync(filePath)
    if (!stat.isFile() || stat.size === 0) return false
    if (stat.size > MAX_CLOUD_AUDIO_BYTES) {
      console.warn(`[neon] Skipping cloud audio upload for ${meetingId}: ${stat.size} bytes exceeds 25 MB limit`)
      return false
    }

    await initNeonSchema()
    const sql = getNeonClient()
    const buf = readFileSync(filePath)
    const totalChunks = Math.ceil(buf.length / MAX_AUDIO_CHUNK_BYTES)

    await sql`DELETE FROM meeting_audio_chunks WHERE meeting_id = ${meetingId}`
    for (let i = 0; i < totalChunks; i++) {
      const start = i * MAX_AUDIO_CHUNK_BYTES
      const slice = buf.subarray(start, Math.min(start + MAX_AUDIO_CHUNK_BYTES, buf.length))
      const b64 = slice.toString('base64')
      await sql`
        INSERT INTO meeting_audio_chunks (meeting_id, chunk_index, mime_type, data, total_bytes)
        VALUES (${meetingId}, ${i}, ${mimeType}, decode(${b64}, 'base64'), ${buf.length})
        ON CONFLICT (meeting_id, chunk_index)
        DO UPDATE SET mime_type = EXCLUDED.mime_type, data = EXCLUDED.data, total_bytes = EXCLUDED.total_bytes
      `
    }

    await sql`
      UPDATE meetings
      SET audio_url = ${`/api/meetings/${meetingId}/audio`},
          audio_mime = ${mimeType},
          updated_at = now()
      WHERE id = ${meetingId}
    `
    return true
  } catch (err) {
    console.error('Failed to upload meeting audio to Neon:', err)
    return false
  }
}

export async function syncFolderToNeon(folder: Folder, userId?: string | null): Promise<boolean> {
  if (!isNeonConfigured()) return false
  try {
    await initNeonSchema()
    const sql = getNeonClient()
    await sql`
      INSERT INTO folders (id, user_id, name, color, icon, created_at)
      VALUES (${folder.id}, ${userId ?? null}, ${folder.name}, ${folder.color}, ${folder.icon}, to_timestamp(${folder.createdAt / 1000}))
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        color = EXCLUDED.color,
        icon = EXCLUDED.icon
    `
    return true
  } catch (err) {
    console.error('Failed to sync folder to Neon:', err)
    return false
  }
}

export async function deleteFolderFromNeon(id: string): Promise<boolean> {
  if (!isNeonConfigured()) return false
  try {
    await initNeonSchema()
    const sql = getNeonClient()
    await sql`DELETE FROM folders WHERE id = ${id}`
    return true
  } catch (err) {
    console.error('Failed to delete folder from Neon:', err)
    return false
  }
}

export async function fetchFoldersFromNeon(userId?: string | null): Promise<Folder[]> {
  if (!isNeonConfigured()) return []
  try {
    await initNeonSchema()
    const sql = getNeonClient()
    const rows = userId
      ? await sql`SELECT id, name, color, icon, EXTRACT(EPOCH FROM created_at) * 1000 AS created_at FROM folders WHERE user_id = ${userId} OR user_id IS NULL ORDER BY created_at ASC`
      : await sql`SELECT id, name, color, icon, EXTRACT(EPOCH FROM created_at) * 1000 AS created_at FROM folders ORDER BY created_at ASC`
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      color: (r.color as Folder['color']) ?? 'default',
      icon: (r.icon as Folder['icon']) ?? 'folder',
      createdAt: Number(r.created_at) || Date.now(),
      count: 0,
    }))
  } catch (err) {
    console.error('Failed to fetch folders from Neon:', err)
    return []
  }
}

export async function fetchMeetingsFromNeon(userId?: string | null, since?: number): Promise<Array<{
  meeting: Meeting
  segments: Segment[]
  notes: Notes | null
  updatedAt: number
}>> {
  if (!isNeonConfigured()) return []
  try {
    await initNeonSchema()
    const sql = getNeonClient()
    const sinceTimestamp = since ? new Date(since).toISOString() : new Date(0).toISOString()
    const meetingRows = userId
      ? await sql`
          SELECT id, user_id, title, started_at, ended_at, event_id, app, attendees, state, language, sync_version,
                 EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
          FROM meetings
          WHERE (user_id = ${userId} OR user_id IS NULL) AND updated_at >= ${sinceTimestamp}::timestamptz
          ORDER BY started_at DESC
        `
      : await sql`
          SELECT id, user_id, title, started_at, ended_at, event_id, app, attendees, state, language, sync_version,
                 EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
          FROM meetings
          WHERE updated_at >= ${sinceTimestamp}::timestamptz
          ORDER BY started_at DESC
        `

    const results: Array<{ meeting: Meeting; segments: Segment[]; notes: Notes | null; updatedAt: number }> = []

    for (const r of meetingRows as Array<Record<string, unknown>>) {
      const meetingId = String(r.id)
      const transcriptRows = await sql`
        SELECT id, track, start_ms, end_ms, text, speaker
        FROM transcripts
        WHERE meeting_id = ${meetingId}
        ORDER BY start_ms ASC
      `
      const noteRows = await sql`
        SELECT mine, enhanced
        FROM notes
        WHERE meeting_id = ${meetingId}
      `

      const attendees = Array.isArray(r.attendees) ? r.attendees : []
      const meeting: Meeting = {
        id: meetingId,
        title: String(r.title ?? 'Untitled'),
        startedAt: Number(r.started_at),
        endedAt: r.ended_at ? Number(r.ended_at) : null,
        eventId: r.event_id ? String(r.event_id) : null,
        app: r.app ? String(r.app) : null,
        attendees,
        state: r.state as Meeting['state'],
        language: r.language ? String(r.language) : null,
        titleSource: 'user',
        userId: r.user_id ? String(r.user_id) : null,
      }

      const segments: Segment[] = (transcriptRows as Array<Record<string, unknown>>).map((tr) => ({
        id: Number(tr.id),
        meetingId,
        track: tr.track as Segment['track'],
        startMs: Number(tr.start_ms),
        endMs: Number(tr.end_ms),
        text: String(tr.text),
        speaker: tr.speaker ? String(tr.speaker) : null,
      }))

      const notes: Notes | null = noteRows.length > 0 ? {
        mine: String((noteRows[0] as Record<string, unknown>).mine ?? ''),
        enhanced: (noteRows[0] as Record<string, unknown>).enhanced ? String((noteRows[0] as Record<string, unknown>).enhanced) : null,
        edited: false,
      } : null

      results.push({
        meeting,
        segments,
        notes,
        updatedAt: Number(r.updated_at_ms) || Date.now(),
      })
    }
    return results
  } catch (err) {
    console.error('Failed to fetch meetings from Neon:', err)
    return []
  }
}
