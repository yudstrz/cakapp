import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/neon';
import { createSession, hashPassword, initAuthSchema, type UserProfile } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { email, password, full_name } = await req.json();

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanName = typeof full_name === 'string' ? full_name.trim() : '';

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json({ ok: false, error: 'Format email tidak valid.' }, { status: 400 });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ ok: false, error: 'Password minimal 6 karakter.' }, { status: 400 });
    }

    if (!cleanName || cleanName.length < 2) {
      return NextResponse.json({ ok: false, error: 'Nama lengkap minimal 2 karakter.' }, { status: 400 });
    }

    const sql = getDb();
    if (!sql) {
      return NextResponse.json({ ok: false, error: 'Database cloud belum terhubung.' }, { status: 503 });
    }

    await initAuthSchema();

    // Check if email already registered
    const existing = await sql`SELECT id FROM profiles WHERE email = ${cleanEmail} LIMIT 1`;
    if (existing.length > 0) {
      return NextResponse.json({ ok: false, error: 'Email sudah terdaftar. Silakan login.' }, { status: 409 });
    }

    const userId = randomUUID();
    const passwordHash = hashPassword(password);

    await sql`
      INSERT INTO profiles (id, email, full_name, password_hash)
      VALUES (${userId}, ${cleanEmail}, ${cleanName}, ${passwordHash})
    `;

    const token = await createSession(userId);

    const cookieStore = await cookies();
    cookieStore.set('cakapp_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    const user: UserProfile = {
      id: userId,
      email: cleanEmail,
      full_name: cleanName,
    };

    return NextResponse.json({ ok: true, user });
  } catch (err: any) {
    console.error('Registration failed:', err);
    return NextResponse.json({ ok: false, error: err.message || 'Terjadi kesalahan sistem.' }, { status: 500 });
  }
}
