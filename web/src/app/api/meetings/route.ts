import { NextResponse } from 'next/server';
import { getDb } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, title, started_at, ended_at, attendees, language, sync_version 
      FROM meetings 
      ORDER BY started_at DESC 
      LIMIT 50
    `;
    return NextResponse.json({ ok: true, data: rows });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
