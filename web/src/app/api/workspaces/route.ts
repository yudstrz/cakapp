import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/neon';
import { errorJsonResponse, getSecurityHeaders, requireAuth } from '@/lib/ai/auth';
import { AiProxyError } from '@/lib/ai/providers';
import { ensurePortalSchema } from '@/lib/meetings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
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
    const workspaces = (await sql`
      SELECT DISTINCT w.id, w.name, w.owner_id,
        CASE WHEN w.owner_id = ${authUser.userId} THEN 'owner' ELSE COALESCE(m.role, 'viewer') END AS role
      FROM workspaces w
      LEFT JOIN workspace_members m
        ON m.workspace_id = w.id
       AND (m.user_id = ${authUser.userId} OR (${email} <> '' AND lower(m.email) = ${email}))
      WHERE w.owner_id = ${authUser.userId} OR m.workspace_id IS NOT NULL
      ORDER BY w.name ASC
    `) as Array<{ id: string; name: string; owner_id: string | null; role: string }>;

    const ids = workspaces.map((w) => w.id);
    const members =
      ids.length > 0
        ? ((await sql`
            SELECT workspace_id, email, role
            FROM workspace_members
            WHERE workspace_id = ANY(${ids})
            ORDER BY created_at ASC
          `) as Array<{ workspace_id: string; email: string; role: string }>)
        : [];

    return NextResponse.json(
      {
        workspaces: workspaces.map((w) => ({
          ...w,
          members: members.filter((m) => m.workspace_id === w.id),
        })),
      },
      { status: 200, headers: getSecurityHeaders(req) },
    );
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const parsed = CreateWorkspaceSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new AiProxyError('INVALID_INPUT', 'Nama workspace minimal 2 karakter.', 400);
    }

    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }
    await ensurePortalSchema(sql);

    const id = `ws_${randomUUID().slice(0, 12)}`;
    await sql`INSERT INTO workspaces (id, name, owner_id) VALUES (${id}, ${parsed.data.name}, ${authUser.userId})`;
    if (authUser.email) {
      await sql`
        INSERT INTO workspace_members (workspace_id, email, user_id, role, invited_by)
        VALUES (${id}, ${authUser.email.toLowerCase()}, ${authUser.userId}, 'owner', ${authUser.userId})
        ON CONFLICT (workspace_id, email) DO NOTHING
      `;
    }

    return NextResponse.json({ ok: true, id, name: parsed.data.name, role: 'owner' }, { status: 201, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
