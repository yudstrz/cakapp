import type { NeonQueryFunction } from '@neondatabase/serverless';
import { ensurePortalSchema } from './meetings';

export function parseByteRange(header: string | null, size: number): { start: number; end: number } | null | 'bad' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)(?:,|$)/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return 'bad';
  if (!match[1]) {
    const suffix = Number(match[2]);
    return suffix > 0 && size > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : 'bad';
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start < size && start <= end ? { start, end } : 'bad';
}

export async function serveStoredMeetingAudio(
  sql: NeonQueryFunction<false, false>,
  meetingId: string,
  rangeHeader: string | null,
): Promise<Response> {
  await ensurePortalSchema(sql);
  const rows = (await sql`
    SELECT chunk_index, mime_type, encode(data, 'base64') AS b64, total_bytes
    FROM meeting_audio_chunks
    WHERE meeting_id = ${meetingId}
    ORDER BY chunk_index ASC
  `) as Array<{ chunk_index: number; mime_type: string; b64: string; total_bytes: number }>;

  if (rows.length === 0) {
    return new Response(null, { status: 404 });
  }

  const buffers = rows.map((r) => Buffer.from(r.b64, 'base64'));
  const fullAudio = buffers.length === 1 ? buffers[0] : Buffer.concat(buffers);
  const size = fullAudio.length;
  const mimeType = rows[0].mime_type || 'audio/webm';

  const range = parseByteRange(rangeHeader, size);
  if (range === 'bad') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    });
  }

  const slice = range ? fullAudio.subarray(range.start, range.end + 1) : fullAudio;
  const headers: Record<string, string> = {
    'Content-Type': mimeType,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(slice.length),
    'Cache-Control': 'private, max-age=3600',
  };
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
  }

  return new Response(new Uint8Array(slice), {
    status: range ? 206 : 200,
    headers,
  });
}
