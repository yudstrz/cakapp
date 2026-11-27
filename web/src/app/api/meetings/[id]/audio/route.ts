import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/neon';
import { errorJsonResponse, getSecurityHeaders, requireAuth } from '@/lib/ai/auth';
import { AiProxyError } from '@/lib/ai/providers';
import {
  getMeetingAccess,
  MAX_AUDIO_UPLOAD_CHUNK_BYTES,
  MAX_CLOUD_AUDIO_BYTES,
} from '@/lib/meetings';
import { serveStoredMeetingAudio } from '@/lib/audio-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    const sql = getDb();
    if (!sql) {
      return new Response(null, { status: 503 });
    }
    const access = await getMeetingAccess(sql, id, authUser.userId, authUser.email);
    if (!access) {
      return new Response(null, { status: 403 });
    }
    return serveStoredMeetingAudio(sql, id, req.headers.get('range'));
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}

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

    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }

    const access = await getMeetingAccess(sql, id, authUser.userId, authUser.email);
    if (!access) {
      throw new AiProxyError('UNAUTHORIZED', 'Anda tidak memiliki akses ke rapat ini.', 403);
    }
    if (access.role === 'viewer') {
      throw new AiProxyError('UNAUTHORIZED', 'Peran Viewer tidak diizinkan mengunggah rekaman.', 403);
    }

    const form = await req.formData().catch(() => {
      throw new AiProxyError('INVALID_INPUT', 'Gunakan multipart/form-data untuk unggah audio.', 400);
    });
    const file = form.get('file');
    if (!(file instanceof Blob) || file.size === 0) {
      throw new AiProxyError('INVALID_INPUT', 'Potongan file audio kosong.', 400);
    }
    if (file.size > MAX_AUDIO_UPLOAD_CHUNK_BYTES) {
      throw new AiProxyError('INVALID_INPUT', 'Potongan file melebihi batas 1,5 MB per request.', 413);
    }

    const chunkIndex = Math.max(0, Math.floor(Number(form.get('chunkIndex') ?? '0')));
    const totalBytes = Math.max(file.size, Math.floor(Number(form.get('totalBytes') ?? String(file.size))));
    const finalize = String(form.get('finalize') ?? 'true') === 'true';
    const mimeType = (file.type || String(form.get('mimeType') || 'audio/webm')).split(';')[0];

    if (totalBytes > MAX_CLOUD_AUDIO_BYTES) {
      throw new AiProxyError('INVALID_INPUT', 'Ukuran rekaman cloud maksimal 25 MB per rapat.', 413);
    }

    if (chunkIndex === 0) {
      await sql`DELETE FROM meeting_audio_chunks WHERE meeting_id = ${id}`;
    }

    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    await sql`
      INSERT INTO meeting_audio_chunks (meeting_id, chunk_index, mime_type, data, total_bytes)
      VALUES (${id}, ${chunkIndex}, ${mimeType}, decode(${b64}, 'base64'), ${totalBytes})
      ON CONFLICT (meeting_id, chunk_index)
      DO UPDATE SET mime_type = EXCLUDED.mime_type, data = EXCLUDED.data, total_bytes = EXCLUDED.total_bytes
    `;

    const audioUrl = `/api/meetings/${encodeURIComponent(id)}/audio`;
    if (finalize) {
      await sql`
        UPDATE meetings
        SET audio_url = ${audioUrl}, audio_mime = ${mimeType}, updated_at = now()
        WHERE id = ${id}
      `;
    }

    return NextResponse.json({ ok: true, audioUrl, chunkIndex }, { status: 200, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }

    const access = await getMeetingAccess(sql, id, authUser.userId, authUser.email);
    if (!access || access.role === 'viewer') {
      throw new AiProxyError('UNAUTHORIZED', 'Tidak diizinkan menghapus audio rapat ini.', 403);
    }

    await sql`DELETE FROM meeting_audio_chunks WHERE meeting_id = ${id}`;
    await sql`UPDATE meetings SET audio_url = NULL, audio_mime = NULL, updated_at = now() WHERE id = ${id}`;

    return NextResponse.json({ ok: true }, { status: 200, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
