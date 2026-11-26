import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/neon';
import { errorJsonResponse, getSecurityHeaders, requireAuth } from '@/lib/ai/auth';
import { AiProxyError } from '@/lib/ai/providers';

export const runtime = 'nodejs';

const SegmentSchema = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  text: z.string().min(1).max(4000),
  speaker: z.string().max(120).optional().default('Audio'),
});

const SaveTranscriptsSchema = z.object({
  segments: z.array(SegmentSchema).min(1).max(1000),
  replace: z.boolean().optional().default(true),
  durationMs: z.number().int().min(0).optional(),
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

    const parsed = SaveTranscriptsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new AiProxyError('INVALID_INPUT', 'Data segmen transkrip tidak valid.', 400);
    }

    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }

    const owned = (await sql`
      SELECT id, started_at FROM meetings
      WHERE id = ${id} AND user_id = ${authUser.userId}
      LIMIT 1
    `) as Array<{ id: string; started_at: string | number }>;

    if (owned.length === 0) {
      throw new AiProxyError('UNAUTHORIZED', 'Anda tidak memiliki akses ke rapat ini.', 403);
    }

    if (parsed.data.replace) {
      await sql`DELETE FROM transcripts WHERE meeting_id = ${id}`;
    }

    for (const seg of parsed.data.segments) {
      await sql`
        INSERT INTO transcripts (meeting_id, track, start_ms, end_ms, text, speaker)
        VALUES (${id}, 'them', ${seg.startMs}, ${seg.endMs}, ${seg.text}, ${seg.speaker})
      `;
    }

    if (parsed.data.durationMs && parsed.data.durationMs > 0) {
      const endedAt = Number(owned[0].started_at) + parsed.data.durationMs;
      await sql`UPDATE meetings SET ended_at = ${endedAt}, updated_at = now() WHERE id = ${id}`;
    }

    return NextResponse.json({ ok: true, count: parsed.data.segments.length }, { status: 200, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
