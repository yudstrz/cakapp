import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/neon';
import { errorJsonResponse, getSecurityHeaders, requireAuth } from '@/lib/ai/auth';
import { AiProxyError } from '@/lib/ai/providers';
import { ensurePortalSchema } from '@/lib/meetings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }
    await ensurePortalSchema(sql);

    const email = (authUser.email || '').trim().toLowerCase();
    const pattern = q ? `%${q}%` : '%';

    const rows = (await sql`
      SELECT DISTINCT m.id, m.title, m.started_at, m.ended_at, m.language, m.app,
        CASE WHEN m.user_id = ${authUser.userId} THEN 'owner' ELSE COALESCE(wm.role, 'viewer') END AS role,
        LEFT(COALESCE(n.enhanced, n.mine, ''), 220) AS excerpt
      FROM meetings m
      LEFT JOIN notes n ON n.meeting_id = m.id
      LEFT JOIN workspace_members wm
        ON wm.workspace_id = m.workspace_id
       AND (wm.user_id = ${authUser.userId} OR (${email} <> '' AND lower(wm.email) = ${email}))
      WHERE (
        m.user_id = ${authUser.userId}
        OR (COALESCE(m.share_mode, 'private') = 'workspace' AND wm.workspace_id IS NOT NULL)
      )
      AND (
        ${q === ''}
        OR m.title ILIKE ${pattern}
        OR COALESCE(n.enhanced, '') ILIKE ${pattern}
        OR COALESCE(n.mine, '') ILIKE ${pattern}
        OR EXISTS (
          SELECT 1 FROM transcripts t
          WHERE t.meeting_id = m.id AND t.text ILIKE ${pattern}
        )
      )
      ORDER BY m.started_at DESC
      LIMIT 30
    `) as Array<Record<string, unknown>>;

    return NextResponse.json({ ok: true, results: rows }, { status: 200, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
