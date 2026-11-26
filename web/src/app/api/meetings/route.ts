import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/neon';
import { errorJsonResponse, getSecurityHeaders, requireAuth } from '@/lib/ai/auth';
import { AiProxyError } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';

const CreateMeetingSchema = z.object({
  title: z.string().min(1).max(160).default('Rekaman Audio Web'),
  language: z.string().max(16).optional().default('id'),
});

export async function GET() {
  try {
    const sql = getDb();
    if (!sql) {
      return NextResponse.json(
        { ok: false, error: 'DATABASE_URL is not configured' },
        { status: 503 },
      );
    }

    const rows = await sql`
      SELECT id, title, started_at, ended_at, attendees, language, sync_version
      FROM meetings
      ORDER BY started_at DESC
      LIMIT 50;
    `;
    return NextResponse.json({ ok: true, data: rows });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Database error' },
      { status: 500 },
    );
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

    const id = randomUUID();
    const nowMs = Date.now();
    await sql`
      INSERT INTO meetings (id, user_id, title, started_at, ended_at, app, state, language, updated_at)
      VALUES (${id}, ${authUser.userId}, ${parsed.data.title}, ${nowMs}, ${nowMs}, 'Audio Web', 'done', ${parsed.data.language}, now())
    `;

    return NextResponse.json({ ok: true, id }, { status: 201, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
