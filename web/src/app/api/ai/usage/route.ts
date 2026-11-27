import { NextResponse, type NextRequest } from 'next/server';
import { getUserUsage } from '@/lib/ai/limits';
import { errorJsonResponse, getSecurityHeaders, handleCorsPreflight, requireAuth } from '@/lib/ai/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = handleCorsPreflight;

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const usage = await getUserUsage(authUser.userId, authUser.tier);
    return NextResponse.json(
      { ...usage, error: { code: 'QUOTA_DISABLED', message: 'Kuota pemakaian AI per akun dinonaktifkan.' } },
      { status: 410, headers: getSecurityHeaders(req) },
    );
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
