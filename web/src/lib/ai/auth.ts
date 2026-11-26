import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/better-auth';
import { getDb } from '@/lib/neon';
import { AiProxyError } from './providers/types';
import type { UserTier } from './limits';

export interface AuthenticatedUser {
  userId: string;
  tier: UserTier;
}

function getAllowedOrigins(): Set<string> {
  return new Set(
    [
      process.env.BETTER_AUTH_URL?.replace(/\/+$/, ''),
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, ''),
      'https://cakapp.vercel.app',
      'http://localhost:3000',
      'http://localhost:5173',
    ].filter(Boolean) as string[],
  );
}

export function isOriginAllowed(origin: string): boolean {
  if (!origin) return true;
  if (origin.startsWith('com.cakapp.app://') || origin === 'app://.' || origin === 'file://') {
    return true;
  }
  return getAllowedOrigins().has(origin.replace(/\/+$/, ''));
}

export function getSecurityHeaders(req?: NextRequest | Request): Record<string, string> {
  const origin = req?.headers.get('origin') ?? '';
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
  if (origin && getAllowedOrigins().has(origin.replace(/\/+$/, ''))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-BYOK-Api-Key, X-BYOK-Provider';
    headers['Vary'] = 'Origin';
  }
  return headers;
}

export function handleCorsPreflight(req: NextRequest): NextResponse {
  const origin = req.headers.get('origin') ?? '';
  if (origin && !isOriginAllowed(origin)) {
    return new NextResponse(null, { status: 403, headers: getSecurityHeaders(req) });
  }
  return new NextResponse(null, { status: 204, headers: getSecurityHeaders(req) });
}

export function getClientIp(req: NextRequest | Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Verify session via BetterAuth cookie/token or desktop Neon session bearer token.
 * Never trust userId from request body or query params.
 */
export async function requireAuth(req: NextRequest | Request): Promise<AuthenticatedUser> {
  const origin = req.headers.get('origin') ?? '';
  if (origin && !isOriginAllowed(origin)) {
    throw new AiProxyError('UNAUTHORIZED', 'Origin permintaan tidak diizinkan.', 403);
  }

  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (session?.user?.id) {
    const rawTier = (session.user as { tier?: unknown }).tier;
    const tier: UserTier = rawTier === 'pro' ? 'pro' : 'free';
    return { userId: session.user.id, tier };
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+([a-f0-9]{32,128})$/i);
  if (bearerMatch) {
    const sql = getDb();
    if (sql) {
      const rows = (await sql`
        SELECT user_id
        FROM sessions
        WHERE token = ${bearerMatch[1]} AND expires_at > now()
        LIMIT 1
      `.catch(() => [])) as Array<{ user_id?: string }>;
      if (rows[0]?.user_id) {
        return { userId: rows[0].user_id, tier: 'free' };
      }
    }
  }

  throw new AiProxyError('UNAUTHORIZED', 'Autentikasi diperlukan. Silakan masuk terlebih dahulu.', 401);
}

export function errorJsonResponse(err: unknown, req?: NextRequest | Request, extraHeaders?: Record<string, string>) {
  const secHeaders = getSecurityHeaders(req);
  if (err instanceof AiProxyError) {
    const headers: Record<string, string> = { ...secHeaders, ...extraHeaders };
    if (err.retryAfter !== undefined) {
      headers['Retry-After'] = String(err.retryAfter);
    }
    if (err.status === 429 && headers['X-RateLimit-Remaining'] === undefined) {
      headers['X-RateLimit-Remaining'] = '0';
    }
    return NextResponse.json(err.toJSON(), { status: err.status, headers });
  }
  const fallback = new AiProxyError('PROVIDER_ERROR', 'Terjadi kesalahan internal pada server AI.', 500);
  return NextResponse.json(fallback.toJSON(), { status: 500, headers: { ...secHeaders, ...extraHeaders } });
}
