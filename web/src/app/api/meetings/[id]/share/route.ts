import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/neon';
import { errorJsonResponse, getSecurityHeaders, requireAuth } from '@/lib/ai/auth';
import { AiProxyError } from '@/lib/ai/providers';
import { generateShareToken, getMeetingAccess } from '@/lib/meetings';

export const runtime = 'nodejs';

const ShareSchema = z.object({
  shareMode: z.enum(['private', 'workspace', 'public']),
  workspaceId: z.string().max(120).nullable().optional(),
  rotateToken: z.boolean().optional().default(false),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    if (!id || id === 'showcase-demo') {
      throw new AiProxyError('INVALID_INPUT', 'Rapat demo tidak dapat dibagikan.', 400);
    }

    const parsed = ShareSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new AiProxyError('INVALID_INPUT', 'Pengaturan berbagi tidak valid.', 400);
    }

    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }

    const access = await getMeetingAccess(sql, id, authUser.userId, authUser.email);
    if (!access) {
      throw new AiProxyError('UNAUTHORIZED', 'Rapat tidak ditemukan atau akses ditolak.', 403);
    }
    if (access.role !== 'owner') {
      throw new AiProxyError('UNAUTHORIZED', 'Hanya pemilik (Owner) yang dapat mengubah akses berbagi.', 403);
    }

    const { shareMode, workspaceId, rotateToken } = parsed.data;
    if (shareMode === 'workspace' && !workspaceId && !access.meeting.workspace_id) {
      throw new AiProxyError('INVALID_INPUT', 'Pilih workspace tim terlebih dahulu untuk berbagi ke tim.', 400);
    }

    const nextWorkspaceId = workspaceId !== undefined ? workspaceId : access.meeting.workspace_id;
    let nextToken = access.meeting.share_token;
    if (shareMode === 'public' && (!nextToken || rotateToken)) {
      nextToken = generateShareToken();
    }

    await sql`
      UPDATE meetings
      SET share_mode = ${shareMode},
          workspace_id = ${nextWorkspaceId},
          share_token = ${nextToken},
          updated_at = now()
      WHERE id = ${id}
    `;

    return NextResponse.json(
      {
        ok: true,
        shareMode,
        workspaceId: nextWorkspaceId,
        shareToken: shareMode === 'public' ? nextToken : null,
        sharePath: shareMode === 'public' && nextToken ? `/share/${nextToken}` : null,
      },
      { status: 200, headers: getSecurityHeaders(req) },
    );
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
