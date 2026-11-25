import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/neon';
import { createSession, initAuthSchema, verifyPassword, type UserProfile } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || typeof password !== 'string') {
      return NextResponse.json({ ok: false, error: 'Email dan password wajib diisi.' }, { status: 400 });
    }

    const sql = getDb();
    if (!sql) {
      return NextResponse.json({ ok: false, error: 'Database cloud belum terhubung.' }, { status: 503 });
    }

    await initAuthSchema();

    const rows = await sql`
      SELECT id, email, full_name, password_hash, avatar_url
      FROM profiles
      WHERE email = ${cleanEmail}
      LIMIT 1
    ` as Array<{ id: string; email: string; full_name: string; password_hash: string | null; avatar_url: string | null }>;

    const profile = rows[0];
    if (!profile || !profile.password_hash) {
      return NextResponse.json({ ok: false, error: 'Email atau password salah.' }, { status: 401 });
    }

    const valid = verifyPassword(password, profile.password_hash);
    if (!valid) {
      return NextResponse.json({ ok: false, error: 'Email atau password salah.' }, { status: 401 });
    }

    const token = await createSession(profile.id);

    const cookieStore = await cookies();
    cookieStore.set('cakapp_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    const user: UserProfile = {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
    };

    return NextResponse.json({ ok: true, user });
  } catch (err: any) {
    console.error('Login failed:', err);
    return NextResponse.json({ ok: false, error: err.message || 'Terjadi kesalahan sistem.' }, { status: 500 });
  }
}
