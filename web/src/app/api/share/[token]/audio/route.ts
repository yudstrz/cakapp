import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/neon';
import { getPublicSharedMeeting } from '@/lib/meetings';
import { serveStoredMeetingAudio } from '@/lib/audio-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const sql = getDb();
  if (!sql) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  const meeting = await getPublicSharedMeeting(sql, token);
  if (!meeting) {
    return new Response(null, { status: 404 });
  }

  return serveStoredMeetingAudio(sql, meeting.id, req.headers.get('range'));
}
