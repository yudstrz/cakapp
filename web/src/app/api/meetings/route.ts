import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/neon';
import { errorJsonResponse, getSecurityHeaders, requireAuth } from '@/lib/ai/auth';
import { AiProxyError } from '@/lib/ai/providers';
import { ensurePortalSchema } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

const CreateMeetingSchema = z.object({
  title: z.string().min(1).max(160).default('Rekaman Audio Web'),
  language: z.string().max(16).optional().default('id'),
});

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }
    await ensurePortalSchema(sql);

    const email = (authUser.email || '').trim().toLowerCase();
    const rows = await sql`
      SELECT DISTINCT m.id, m.title, m.started_at, m.ended_at, m.attendees, m.language, m.sync_version,
        CASE WHEN m.user_id = ${authUser.userId} THEN 'owner' ELSE COALESCE(wm.role, 'viewer') END AS role
      FROM meetings m
      LEFT JOIN workspace_members wm
        ON wm.workspace_id = m.workspace_id
       AND (wm.user_id = ${authUser.userId} OR (${email} <> '' AND lower(wm.email) = ${email}))
      WHERE m.user_id = ${authUser.userId}
         OR (COALESCE(m.share_mode, 'private') = 'workspace' AND wm.workspace_id IS NOT NULL)
      ORDER BY m.started_at DESC
      LIMIT 50;
    `;
    return NextResponse.json({ ok: true, data: rows }, { status: 200, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const parsed = CreateMeetingSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw new AiProxyError('INVALID_INPUT', 'Judul rapat tidak valid.', 400);
    }

    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }
    await ensurePortalSchema(sql);

    const id = randomUUID();
    const nowMs = Date.now();
    await sql`
      INSERT INTO meetings (id, user_id, title, started_at, ended_at, app, state, language, share_mode, updated_at)
      VALUES (${id}, ${authUser.userId}, ${parsed.data.title}, ${nowMs}, ${nowMs}, 'Audio Web', 'done', ${parsed.data.language}, 'private', now())
    `;

    return NextResponse.json({ ok: true, id }, { status: 201, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
