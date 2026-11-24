import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Meeting, Notes, Segment } from './store'

for (const envPath of [
  join(process.cwd(), '.env'),
  join(process.cwd(), '.env.local'),
  join(process.cwd(), 'app/.env'),
  join(process.cwd(), 'app/.env.local'),
  join(__dirname, '../../.env'),
  join(__dirname, '../../../.env'),
]) {
  if (existsSync(envPath)) dotenv.config({ path: envPath, quiet: true })
}

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
  await sql`CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings(user_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_transcripts_meeting ON transcripts(meeting_id)`
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
