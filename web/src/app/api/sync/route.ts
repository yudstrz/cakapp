import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/neon';
import { errorJsonResponse, getSecurityHeaders, handleCorsPreflight, requireAuth } from '@/lib/ai/auth';
import { AiProxyError } from '@/lib/ai/providers';
import { ensurePortalSchema } from '@/lib/meetings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = handleCorsPreflight;

const AttendeeSchema = z.object({
  name: z.string().max(160),
  email: z.string().max(254).nullable().optional(),
});

const SegmentSchema = z.object({
  track: z.enum(['me', 'them']),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  text: z.string().max(8000),
  speaker: z.string().max(160).nullable().optional(),
});

const SyncBodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('meeting'),
    meeting: z.object({
      id: z.string().min(1).max(160),
      title: z.string().max(300).default('Untitled'),
      startedAt: z.number().int().min(0),
      endedAt: z.number().int().min(0).nullable().optional(),
      eventId: z.string().max(300).nullable().optional(),
      app: z.string().max(120).nullable().optional(),
      attendees: z.array(AttendeeSchema).max(200).optional().default([]),
      state: z.enum(['prepared', 'recording', 'stopped', 'done']).default('done'),
      language: z.string().max(32).nullable().optional(),
      updatedAt: z.number().int().min(0).optional(),
    }),
    segments: z.array(SegmentSchema).max(10_000).optional().default([]),
    notes: z
      .object({
        mine: z.string().max(500_000).default(''),
        enhanced: z.string().max(500_000).nullable().optional(),
      })
      .nullable()
      .optional(),
  }),
  z.object({
    kind: z.literal('folder'),
    folder: z.object({
      id: z.string().min(1).max(160),
      name: z.string().min(1).max(200),
      color: z.string().max(32).default('default'),
      icon: z.string().max(32).default('folder'),
      createdAt: z.number().int().min(0).optional(),
    }),
  }),
]);

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }
    await ensurePortalSchema(sql);

    if (req.nextUrl.searchParams.get('probe') === '1') {
      await sql`SELECT 1`;
      return NextResponse.json({ ok: true, meetings: [], folders: [] }, { status: 200, headers: getSecurityHeaders(req) });
    }

    const rawSince = Number(req.nextUrl.searchParams.get('since') ?? '0');
    const sinceIso = new Date(Number.isFinite(rawSince) && rawSince > 0 ? rawSince : 0).toISOString();

    const meetingRows = (await sql`
      SELECT id, user_id, title, started_at, ended_at, event_id, app, attendees, state, language,
             EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
      FROM meetings
      WHERE user_id = ${authUser.userId} AND updated_at >= ${sinceIso}::timestamptz
      ORDER BY started_at DESC
      LIMIT 100
    `) as Array<Record<string, unknown>>;

    const meetingIds = meetingRows.map((r) => String(r.id));
    const segsByMeeting = new Map<string, Array<Record<string, unknown>>>();
    const notesByMeeting = new Map<string, { mine: string; enhanced: string | null; edited: boolean }>();

    if (meetingIds.length > 0) {
      const [transcriptRows, noteRows] = await Promise.all([
        sql`
          SELECT id, meeting_id, track, start_ms, end_ms, text, speaker
          FROM transcripts
          WHERE meeting_id = ANY(${meetingIds})
          ORDER BY start_ms ASC
        ` as Promise<Array<Record<string, unknown>>>,
        sql`
          SELECT meeting_id, mine, enhanced
          FROM notes
          WHERE meeting_id = ANY(${meetingIds})
        ` as Promise<Array<Record<string, unknown>>>,
      ]);

      for (const tr of transcriptRows) {
        const mid = String(tr.meeting_id);
        const list = segsByMeeting.get(mid) ?? [];
        list.push({
          id: Number(tr.id),
          meetingId: mid,
          track: tr.track === 'me' ? 'me' : 'them',
          startMs: Number(tr.start_ms),
          endMs: Number(tr.end_ms),
          text: String(tr.text ?? ''),
          speaker: tr.speaker ? String(tr.speaker) : null,
        });
        segsByMeeting.set(mid, list);
      }

      for (const nr of noteRows) {
        notesByMeeting.set(String(nr.meeting_id), {
          mine: String(nr.mine ?? ''),
          enhanced: nr.enhanced ? String(nr.enhanced) : null,
          edited: false,
        });
      }
    }

    const meetings = meetingRows.map((r) => {
      const id = String(r.id);
      return {
        meeting: {
          id,
          title: String(r.title ?? 'Untitled'),
          startedAt: Number(r.started_at),
          endedAt: r.ended_at != null ? Number(r.ended_at) : null,
          eventId: r.event_id ? String(r.event_id) : null,
          app: r.app ? String(r.app) : null,
          attendees: Array.isArray(r.attendees) ? r.attendees : [],
          state: String(r.state || 'done'),
          language: r.language ? String(r.language) : null,
          titleSource: 'user',
          userId: r.user_id ? String(r.user_id) : authUser.userId,
        },
        segments: segsByMeeting.get(id) ?? [],
        notes: notesByMeeting.get(id) ?? null,
        updatedAt: Number(r.updated_at_ms) || Date.now(),
      };
    });

    const folderRows = (await sql`
      SELECT id, name, color, icon, EXTRACT(EPOCH FROM created_at) * 1000 AS created_at
      FROM folders
      WHERE user_id = ${authUser.userId}
      ORDER BY created_at ASC
    `) as Array<Record<string, unknown>>;

    const folders = folderRows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      color: String(r.color ?? 'default'),
      icon: String(r.icon ?? 'folder'),
      createdAt: Number(r.created_at) || Date.now(),
      count: 0,
    }));

    return NextResponse.json({ ok: true, meetings, folders }, { status: 200, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const parsed = SyncBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new AiProxyError('INVALID_INPUT', 'Payload sinkronisasi tidak valid.', 400);
    }

    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }
    await ensurePortalSchema(sql);

    if (parsed.data.kind === 'folder') {
      const f = parsed.data.folder;
      const existing = (await sql`SELECT user_id FROM folders WHERE id = ${f.id} LIMIT 1`) as Array<{ user_id?: string | null }>;
      if (existing[0]?.user_id && existing[0].user_id !== authUser.userId) {
        throw new AiProxyError('UNAUTHORIZED', 'Folder milik pengguna lain tidak dapat ditimpa.', 403);
      }

      const createdAtSec = Math.floor((f.createdAt ?? Date.now()) / 1000);
      await sql`
        INSERT INTO folders (id, user_id, name, color, icon, created_at)
        VALUES (${f.id}, ${authUser.userId}, ${f.name}, ${f.color}, ${f.icon}, to_timestamp(${createdAtSec}))
        ON CONFLICT (id) DO UPDATE SET
          user_id = COALESCE(folders.user_id, ${authUser.userId}),
          name = EXCLUDED.name,
          color = EXCLUDED.color,
          icon = EXCLUDED.icon
      `;
      return NextResponse.json({ ok: true }, { status: 200, headers: getSecurityHeaders(req) });
    }

    const { meeting: m, segments, notes } = parsed.data;
    const existing = (await sql`
      SELECT user_id, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
      FROM meetings
      WHERE id = ${m.id}
      LIMIT 1
    `) as Array<{ user_id?: string | null; updated_at_ms?: number | string | null }>;
    if (existing[0]?.user_id && existing[0].user_id !== authUser.userId) {
      throw new AiProxyError('UNAUTHORIZED', 'Rapat milik pengguna lain tidak dapat ditimpa.', 403);
    }
    if (
      m.updatedAt !== undefined &&
      existing[0]?.updated_at_ms != null &&
      Number(existing[0].updated_at_ms) > m.updatedAt
    ) {
      return NextResponse.json({ ok: true, skipped: 'stale' }, { status: 200, headers: getSecurityHeaders(req) });
    }

    const attendeesJson = JSON.stringify(m.attendees ?? []);
    await sql`
      INSERT INTO meetings (
        id, user_id, title, started_at, ended_at, event_id, app, attendees, state, language, updated_at
      ) VALUES (
        ${m.id}, ${authUser.userId}, ${m.title}, ${m.startedAt}, ${m.endedAt ?? null},
        ${m.eventId ?? null}, ${m.app ?? null}, ${attendeesJson}::jsonb, ${m.state},
        ${m.language ?? null}, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        user_id = COALESCE(meetings.user_id, ${authUser.userId}),
        title = EXCLUDED.title,
        ended_at = EXCLUDED.ended_at,
        attendees = EXCLUDED.attendees,
        state = EXCLUDED.state,
        language = EXCLUDED.language,
        updated_at = now()
    `;

    if (segments.length > 0) {
      await sql`DELETE FROM transcripts WHERE meeting_id = ${m.id}`;
      const rowsJson = JSON.stringify(
        segments.map((s) => ({
          track: s.track,
          start_ms: s.startMs,
          end_ms: s.endMs,
          text: s.text,
          speaker: s.speaker ?? null,
        })),
      );
      await sql`
        INSERT INTO transcripts (meeting_id, track, start_ms, end_ms, text, speaker)
        SELECT ${m.id}, r.track, r.start_ms, r.end_ms, r.text, r.speaker
        FROM jsonb_to_recordset(${rowsJson}::jsonb)
          AS r(track text, start_ms int, end_ms int, text text, speaker text)
      `;
    }

    if (notes) {
      await sql`
        INSERT INTO notes (meeting_id, mine, enhanced, updated_at)
        VALUES (${m.id}, ${notes.mine ?? ''}, ${notes.enhanced ?? null}, now())
        ON CONFLICT (meeting_id) DO UPDATE SET
          mine = EXCLUDED.mine,
          enhanced = EXCLUDED.enhanced,
          updated_at = now()
      `;
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
