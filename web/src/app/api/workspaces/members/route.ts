import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/neon';
import { errorJsonResponse, getSecurityHeaders, requireAuth } from '@/lib/ai/auth';
import { AiProxyError } from '@/lib/ai/providers';
import { ensurePortalSchema } from '@/lib/meetings';

export const runtime = 'nodejs';

const MemberSchema = z.object({
  workspaceId: z.string().min(1).max(120),
  email: z.string().trim().email().max(254),
  role: z.enum(['owner', 'editor', 'viewer']),
});

const RemoveSchema = z.object({
  workspaceId: z.string().min(1).max(120),
  email: z.string().trim().email().max(254),
});

async function assertWorkspaceOwner(
  sql: NonNullable<ReturnType<typeof getDb>>,
  workspaceId: string,
  userId: string,
  userEmail: string,
) {
  await ensurePortalSchema(sql);
  const cleanEmail = userEmail.trim().toLowerCase();
  const rows = (await sql`
    SELECT w.owner_id, m.role
    FROM workspaces w
    LEFT JOIN workspace_members m
      ON m.workspace_id = w.id
     AND (m.user_id = ${userId} OR (${cleanEmail} <> '' AND lower(m.email) = ${cleanEmail}))
    WHERE w.id = ${workspaceId}
    LIMIT 1
  `) as Array<{ owner_id: string | null; role: string | null }>;

  const row = rows[0];
  if (!row || (row.owner_id !== userId && row.role !== 'owner')) {
    throw new AiProxyError('UNAUTHORIZED', 'Hanya Owner workspace yang dapat mengelola anggota.', 403);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const parsed = MemberSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new AiProxyError('INVALID_INPUT', 'Email atau peran anggota tidak valid.', 400);
    }

    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }

    const { workspaceId, email, role } = parsed.data;
    await assertWorkspaceOwner(sql, workspaceId, authUser.userId, authUser.email);

    const normalizedEmail = email.toLowerCase();
    const matchedUsers = (await sql`SELECT id FROM "user" WHERE lower(email) = ${normalizedEmail} LIMIT 1`.catch(() => [])) as Array<{ id: string }>;
    const memberUserId = matchedUsers[0]?.id ?? null;

    await sql`
      INSERT INTO workspace_members (workspace_id, email, user_id, role, invited_by)
      VALUES (${workspaceId}, ${normalizedEmail}, ${memberUserId}, ${role}, ${authUser.userId})
      ON CONFLICT (workspace_id, email)
      DO UPDATE SET role = EXCLUDED.role, user_id = COALESCE(EXCLUDED.user_id, workspace_members.user_id)
    `;

    return NextResponse.json({ ok: true, email: normalizedEmail, role }, { status: 200, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const parsed = RemoveSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new AiProxyError('INVALID_INPUT', 'Permintaan hapus anggota tidak valid.', 400);
    }

    const sql = getDb();
    if (!sql) {
      throw new AiProxyError('PROVIDER_ERROR', 'Database cloud belum dikonfigurasi.', 503);
    }

    await assertWorkspaceOwner(sql, parsed.data.workspaceId, authUser.userId, authUser.email);
    await sql`
      DELETE FROM workspace_members
      WHERE workspace_id = ${parsed.data.workspaceId} AND lower(email) = ${parsed.data.email.toLowerCase()}
    `;

    return NextResponse.json({ ok: true }, { status: 200, headers: getSecurityHeaders(req) });
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
