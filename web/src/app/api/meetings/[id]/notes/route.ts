import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/neon';
import { errorJsonResponse, getSecurityHeaders, requireAuth } from '@/lib/ai/auth';
import { AiProxyError } from '@/lib/ai/providers';

export const runtime = 'nodejs';

const SaveNotesSchema = z.object({
  enhanced: z.string().min(1).max(200_000),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    if (!id || id === 'showcase-demo') {
      throw new AiProxyError('INVALID_INPUT', 'Rapat demo tidak dapat diubah.', 400);
    }

    const parsed = SaveNotesSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new AiProxyError('INVALID_INPUT', 'Isi notulen tidak valid.', 400);
    }

    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }

    const owned = (await sql`
      SELECT id FROM meetings
      WHERE id = ${id} AND user_id = ${authUser.userId}
      LIMIT 1
    `) as Array<{ id: string }>;

    if (owned.length === 0) {
      throw new AiProxyError('UNAUTHORIZED', 'Anda tidak memiliki akses ke rapat ini.', 403);
    }

    await sql`
      INSERT INTO notes (meeting_id, mine, enhanced, updated_at)
      VALUES (${id}, '', ${parsed.data.enhanced}, now())
      ON CONFLICT (meeting_id)
      DO UPDATE SET enhanced = EXCLUDED.enhanced, updated_at = now()
    `;

    return NextResponse.json({ ok: true }, { status: 200, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
