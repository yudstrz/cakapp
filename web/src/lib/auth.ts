import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb } from './neon';

export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  created_at?: string;
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, key] = stored.split(':');
    if (!salt || !key) return false;
    const hash = scryptSync(password, salt, 64);
    const keyBuf = Buffer.from(key, 'hex');
    if (hash.length !== keyBuf.length) return false;
    return timingSafeEqual(hash, keyBuf);
  } catch {
    return false;
  }
}

export async function initAuthSchema(): Promise<void> {
  const sql = getDb();
  if (!sql) return;

  await sql`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email)`;
}

export async function createSession(userId: string): Promise<string> {
  await initAuthSchema();
  const sql = getDb();
  if (!sql) throw new Error('Database unavailable');

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await sql`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (${token}, ${userId}, ${expiresAt.toISOString()})
  `;

  return token;
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('cakapp_session')?.value;
    if (!token) return null;

    const sql = getDb();
    if (!sql) return null;

    const rows = await sql`
      SELECT p.id, p.email, p.full_name, p.avatar_url, p.created_at
      FROM sessions s
      JOIN profiles p ON p.id = s.user_id
      WHERE s.token = ${token} AND s.expires_at > now()
      LIMIT 1
    ` as UserProfile[];

    return rows[0] ?? null;
  } catch (err) {
    console.error('Failed to get current user:', err);
    return null;
  }
}

export async function deleteSession(token: string): Promise<void> {
  const sql = getDb();
  if (!sql) return;
  try {
    await sql`DELETE FROM sessions WHERE token = ${token}`;
  } catch (err) {
    console.error('Failed to delete session:', err);
  }
}
