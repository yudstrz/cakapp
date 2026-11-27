import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetSession = vi.fn();
const mockSql = vi.fn();

vi.mock('@/lib/better-auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock('@/lib/neon', () => ({
  getDb: () => mockSql,
}));

const mockRedisStore = new Map<string, unknown>();
const mockRedis = {
  get: vi.fn(async (key: string) => mockRedisStore.get(key) ?? null),
  set: vi.fn(async (key: string, val: unknown) => {
    mockRedisStore.set(key, val);
    return 'OK';
  }),
  incr: vi.fn(async (key: string) => {
    const next = Number(mockRedisStore.get(key) ?? 0) + 1;
    mockRedisStore.set(key, next);
    return next;
  }),
  incrby: vi.fn(async (key: string, amount: number) => {
    const next = Number(mockRedisStore.get(key) ?? 0) + amount;
    mockRedisStore.set(key, next);
    return next;
  }),
  incrbyfloat: vi.fn(async (key: string, amount: number) => {
    const next = Number(mockRedisStore.get(key) ?? 0) + amount;
    mockRedisStore.set(key, next);
    return next;
  }),
  expire: vi.fn(async () => 1),
  eval: vi.fn(),
};

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    get = mockRedis.get;
    set = mockRedis.set;
    incr = mockRedis.incr;
    incrby = mockRedis.incrby;
    incrbyfloat = mockRedis.incrbyfloat;
    expire = mockRedis.expire;
    eval = mockRedis.eval;
  },
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class MockRatelimit {
    static slidingWindow() {
      return {};
    }
    async limit() {
      return { success: true, remaining: 10, reset: Date.now() + 30_000 };
    }
  },
}));

import { parseByteRange, serveStoredMeetingAudio } from '@/lib/audio-storage';
import { resetPortalSchemaCacheForTests } from '@/lib/meetings';
import { POST as sharePost } from '@/app/api/meetings/[id]/share/route';
import { POST as notesPost } from '@/app/api/meetings/[id]/notes/route';
import { POST as transcriptsPost } from '@/app/api/meetings/[id]/transcripts/route';
import { GET as publicAudioGet } from '@/app/api/share/[token]/audio/route';
import { GET as searchGet } from '@/app/api/meetings/search/route';
import { POST as askPost } from '@/app/api/meetings/ask/route';
import { GET as workspacesGet, POST as workspacesPost } from '@/app/api/workspaces/route';
import { POST as memberPost, DELETE as memberDelete } from '@/app/api/workspaces/members/route';
import { GET as syncGet, POST as syncPost } from '@/app/api/sync/route';

function makeAuthReq(
  url: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
) {
  return new NextRequest(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  });
}

describe('Hari 4 Portal APIs: Audio Range, RBAC, Share, Search/Ask & Workspaces', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisStore.clear();
    resetPortalSchemaCacheForTests();
    process.env.UPSTASH_REDIS_REST_URL = 'https://mock-upstash.local';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    mockGetSession.mockResolvedValue({
      user: { id: 'owner-1', email: 'owner@cakapp.test', name: 'Owner' },
      session: { id: 'sess-1' },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.GEMINI_API_KEY;
  });

  it('parses byte ranges and serves HTTP 206 Partial Content / 416', async () => {
    expect(parseByteRange('bytes=0-3', 10)).toEqual({ start: 0, end: 3 });
    expect(parseByteRange('bytes=5-', 10)).toEqual({ start: 5, end: 9 });
    expect(parseByteRange('bytes=-4', 10)).toEqual({ start: 6, end: 9 });
    expect(parseByteRange('bytes=20-30', 10)).toBe('bad');

    mockSql.mockImplementation(async (strings: TemplateStringsArray) => {
      const q = strings.join('?');
      if (q.includes('FROM meeting_audio_chunks')) {
        return [
          {
            chunk_index: 0,
            mime_type: 'audio/ogg',
            b64: Buffer.from('ABCDEFGH').toString('base64'),
            total_bytes: 8,
          },
        ];
      }
      return [];
    });

    const partial = await serveStoredMeetingAudio(mockSql as never, 'm-1', 'bytes=2-5');
    expect(partial.status).toBe(206);
    expect(partial.headers.get('Content-Range')).toBe('bytes 2-5/8');
    expect(partial.headers.get('Accept-Ranges')).toBe('bytes');
    expect(await partial.text()).toBe('CDEF');

    const badRange = await serveStoredMeetingAudio(mockSql as never, 'm-1', 'bytes=99-120');
    expect(badRange.status).toBe(416);
    expect(badRange.headers.get('Content-Range')).toBe('bytes */8');
  });

  it('allows only meeting owner to change share mode and rotates public token', async () => {
    const meetingRow = {
      id: 'm-10',
      user_id: 'owner-1',
      workspace_id: 'ws-1',
      title: 'Product Sync',
      started_at: 1_700_000_000_000,
      ended_at: 1_700_000_600_000,
      attendees: [],
      language: 'id',
      app: 'zoom',
      state: 'done',
      share_token: 'old_token',
      share_mode: 'private',
      audio_url: null,
      audio_mime: null,
    };

    mockSql.mockImplementation(async (strings: TemplateStringsArray) => {
      const q = strings.join('?');
      if (q.includes('FROM meetings') && q.includes('WHERE id =')) return [meetingRow];
      if (q.includes('SELECT role FROM workspace_members')) return [{ role: 'editor' }];
      return [];
    });

    const ownerRes = await sharePost(
      makeAuthReq('https://cakapp.test/api/meetings/m-10/share', {
        method: 'POST',
        body: JSON.stringify({ shareMode: 'public', rotateToken: true }),
      }),
      { params: Promise.resolve({ id: 'm-10' }) },
    );
    expect(ownerRes.status).toBe(200);
    const ownerJson = await ownerRes.json();
    expect(ownerJson.shareMode).toBe('public');
    expect(ownerJson.shareToken).toBeTruthy();
    expect(ownerJson.shareToken).not.toBe('old_token');
    expect(ownerJson.sharePath).toBe(`/share/${ownerJson.shareToken}`);

    // Workspace editor (non-owner) must be rejected with 403
    mockGetSession.mockResolvedValueOnce({
      user: { id: 'editor-1', email: 'editor@cakapp.test' },
      session: { id: 'sess-2' },
    });
    meetingRow.share_mode = 'workspace';
    const editorRes = await sharePost(
      makeAuthReq('https://cakapp.test/api/meetings/m-10/share', {
        method: 'POST',
        body: JSON.stringify({ shareMode: 'public' }),
      }),
      { params: Promise.resolve({ id: 'm-10' }) },
    );
    expect(editorRes.status).toBe(403);
  });

  it('enforces Viewer read-only vs Editor/Owner write permissions on notes and transcripts', async () => {
    const sharedMeeting = {
      id: 'm-20',
      user_id: 'owner-1',
      workspace_id: 'ws-team',
      title: 'Architecture Review',
      started_at: 1_700_000_000_000,
      ended_at: null,
      attendees: [],
      language: 'id',
      app: 'web',
      state: 'done',
      share_token: null,
      share_mode: 'workspace',
      audio_url: null,
      audio_mime: null,
    };

    let memberRole = 'viewer';
    mockSql.mockImplementation(async (strings: TemplateStringsArray) => {
      const q = strings.join('?');
      if (q.includes('FROM meetings') && q.includes('WHERE id =')) return [sharedMeeting];
      if (q.includes('SELECT role FROM workspace_members')) return [{ role: memberRole }];
      return [];
    });

    mockGetSession.mockResolvedValue({
      user: { id: 'viewer-1', email: 'viewer@cakapp.test' },
      session: { id: 'sess-v' },
    });

    const viewerNoteRes = await notesPost(
      makeAuthReq('https://cakapp.test/api/meetings/m-20/notes', {
        method: 'POST',
        body: JSON.stringify({ enhanced: 'Edited summary' }),
      }),
      { params: Promise.resolve({ id: 'm-20' }) },
    );
    expect(viewerNoteRes.status).toBe(403);

    const viewerTxRes = await transcriptsPost(
      makeAuthReq('https://cakapp.test/api/meetings/m-20/transcripts', {
        method: 'POST',
        body: JSON.stringify({ segments: [{ startMs: 0, endMs: 1000, text: 'Test' }] }),
      }),
      { params: Promise.resolve({ id: 'm-20' }) },
    );
    expect(viewerTxRes.status).toBe(403);

    memberRole = 'editor';
    const editorNoteRes = await notesPost(
      makeAuthReq('https://cakapp.test/api/meetings/m-20/notes', {
        method: 'POST',
        body: JSON.stringify({ enhanced: 'Editor summary' }),
      }),
      { params: Promise.resolve({ id: 'm-20' }) },
    );
    expect(editorNoteRes.status).toBe(200);

    const editorTxRes = await transcriptsPost(
      makeAuthReq('https://cakapp.test/api/meetings/m-20/transcripts', {
        method: 'POST',
        body: JSON.stringify({ segments: [{ startMs: 0, endMs: 1200, text: 'Halo tim' }], durationMs: 1200 }),
      }),
      { params: Promise.resolve({ id: 'm-20' }) },
    );
    expect(editorTxRes.status).toBe(200);
  });

  it('serves public shared audio without login and rejects unknown share tokens', async () => {
    mockSql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join('?');
      if (q.includes('FROM meetings') && q.includes("share_mode = 'public'")) {
        return values[0] === 'pub-ok' ? [{ id: 'm-pub', share_mode: 'public' }] : [];
      }
      if (q.includes('FROM meeting_audio_chunks')) {
        return [{ chunk_index: 0, mime_type: 'audio/mp4', b64: Buffer.from('MP4BYTES').toString('base64'), total_bytes: 8 }];
      }
      return [];
    });

    const missing = await publicAudioGet(new NextRequest('https://cakapp.test/api/share/bad/audio'), {
      params: Promise.resolve({ token: 'bad' }),
    });
    expect(missing.status).toBe(404);

    const ok = await publicAudioGet(
      new NextRequest('https://cakapp.test/api/share/pub-ok/audio', { headers: { range: 'bytes=0-2' } }),
      { params: Promise.resolve({ token: 'pub-ok' }) },
    );
    expect(ok.status).toBe(206);
    expect(await ok.text()).toBe('MP4');
  });

  it('searches accessible meetings and answers Ask RAG with meeting citations', async () => {
    mockSql.mockImplementation(async (strings: TemplateStringsArray) => {
      const q = strings.join('?');
      if (q.includes('LEFT JOIN notes n') && q.includes('ILIKE')) {
        return [{ id: 'm-sprint', title: 'Sprint 4 Planning', started_at: 1_700_100_000_000, role: 'owner', excerpt: 'Deadline Q4 di Jumat' }];
      }
      if (q.includes('LEFT JOIN notes n') && q.includes('ORDER BY m.started_at DESC')) {
        return [{ id: 'm-sprint', title: 'Sprint 4 Planning', started_at: 1_700_100_000_000, note_text: 'Keputusan: launch portal Jumat.' }];
      }
      if (q.includes('FROM transcripts')) {
        return [{ meeting_id: 'm-sprint', speaker: 'Wahyudi', text: 'Target rilis website portal pada Jumat.' }];
      }
      return [];
    });

    const searchRes = await searchGet(new NextRequest('https://cakapp.test/api/meetings/search?q=Sprint'));
    expect(searchRes.status).toBe(200);
    const searchJson = await searchRes.json();
    expect(searchJson.results).toHaveLength(1);
    expect(searchJson.results[0].id).toBe('m-sprint');

    process.env.GEMINI_API_KEY = 'gm-mock-key';
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/models?')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Portal dijadwalkan rilis pada hari Jumat berdasarkan Sprint 4 Planning.' }] } }],
          usageMetadata: { promptTokenCount: 25, candidatesTokenCount: 14 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const askRes = await askPost(
      makeAuthReq('https://cakapp.test/api/meetings/ask', {
        method: 'POST',
        body: JSON.stringify({ question: 'Kapan target rilis portal?' }),
      }),
    );
    expect(askRes.status).toBe(200);
    const askJson = await askRes.json();
    expect(askJson.answer).toContain('Jumat');
    expect(askJson.citations).toHaveLength(1);
    expect(askJson.citations[0].id).toBe('m-sprint');
  });

  it('manages team workspaces and owner-only member invite/removal', async () => {
    let wsOwner = 'owner-1';
    let memberRole: string | null = 'owner';
    mockSql.mockImplementation(async (strings: TemplateStringsArray) => {
      const q = strings.join('?');
      if (q.includes('SELECT DISTINCT w.id, w.name')) {
        return [{ id: 'ws_123', name: 'Tim Produk', owner_id: 'owner-1', role: 'owner' }];
      }
      if (q.includes('SELECT workspace_id, email, role')) {
        return [{ workspace_id: 'ws_123', email: 'teammate@cakapp.test', role: 'editor' }];
      }
      if (q.includes('SELECT w.owner_id, m.role')) {
        return [{ owner_id: wsOwner, role: memberRole }];
      }
      return [];
    });

    const createRes = await workspacesPost(
      makeAuthReq('https://cakapp.test/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: 'Tim Produk' }),
      }),
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.name).toBe('Tim Produk');

    const listRes = await workspacesGet(new NextRequest('https://cakapp.test/api/workspaces'));
    expect(listRes.status).toBe(200);
    const listed = await listRes.json();
    expect(listed.workspaces[0].members).toHaveLength(1);

    const inviteRes = await memberPost(
      makeAuthReq('https://cakapp.test/api/workspaces/members', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: 'ws_123', email: 'new@cakapp.test', role: 'editor' }),
      }),
    );
    expect(inviteRes.status).toBe(200);

    const removeRes = await memberDelete(
      makeAuthReq('https://cakapp.test/api/workspaces/members', {
        method: 'DELETE',
        body: JSON.stringify({ workspaceId: 'ws_123', email: 'new@cakapp.test' }),
      }),
    );
    expect(removeRes.status).toBe(200);

    // Non-owner workspace member cannot manage team roles
    wsOwner = 'other-owner';
    memberRole = 'viewer';
    const forbiddenInvite = await memberPost(
      makeAuthReq('https://cakapp.test/api/workspaces/members', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: 'ws_123', email: 'x@cakapp.test', role: 'viewer' }),
      }),
    );
    expect(forbiddenInvite.status).toBe(403);
  });

  it('parses Electron OAuth handoff cookies across standard and __Secure prefixes', async () => {
    const { buildDesktopCallbackUrl, extractElectronQuery, readElectronAuthCookie } = await import('@/lib/desktop-scheme');
    expect(readElectronAuthCookie('foo=bar; better-auth.electron=tok_123')).toBe('tok_123');
    expect(readElectronAuthCookie('__Secure-better-auth.electron=tok%5Fsec; theme=dark')).toBe('tok_sec');
    expect(readElectronAuthCookie('theme=dark')).toBeNull();
    expect(buildDesktopCallbackUrl('abc==')).toBe('com.cakapp.app://auth/callback#token=abc%3D%3D');
    expect(extractElectronQuery('?client_id=electron&state=st1&code_challenge=ch1&extra=x')).toEqual({
      client_id: 'electron',
      state: 'st1',
      code_challenge: 'ch1',
    });
  });

  it('handles desktop HTTPS sync push, ownership isolation, and pull via /api/sync', async () => {
    let existingOwner: string | null = 'owner-1';
    mockSql.mockImplementation(async (strings: TemplateStringsArray) => {
      const q = strings.join('?');
      if (q.includes('SELECT user_id FROM meetings WHERE id')) {
        return existingOwner ? [{ user_id: existingOwner }] : [];
      }
      if (q.includes('FROM meetings') && q.includes('WHERE user_id =')) {
        return [{
          id: 'desk-1',
          user_id: 'owner-1',
          title: 'Sync Desktop Call',
          started_at: 1000,
          ended_at: 2000,
          event_id: null,
          app: 'Zoom',
          attendees: [],
          state: 'done',
          language: 'id',
          updated_at_ms: 3000,
        }];
      }
      if (q.includes('FROM transcripts')) {
        return [{ id: 1, meeting_id: 'desk-1', track: 'me', start_ms: 10, end_ms: 500, text: 'Halo', speaker: null }];
      }
      if (q.includes('FROM notes')) {
        return [{ meeting_id: 'desk-1', mine: 'Catatan', enhanced: 'Ringkasan' }];
      }
      return [];
    });

    const pushOk = await syncPost(
      makeAuthReq('https://cakapp.test/api/sync', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'meeting',
          meeting: { id: 'desk-1', title: 'Sync Desktop Call', startedAt: 1000, endedAt: 2000, app: 'Zoom', state: 'done' },
          segments: [{ track: 'me', startMs: 10, endMs: 500, text: 'Halo', speaker: null }],
          notes: { mine: 'Catatan', enhanced: 'Ringkasan' },
        }),
      }),
    );
    expect(pushOk.status).toBe(200);

    existingOwner = 'someone-else';
    const pushForbidden = await syncPost(
      makeAuthReq('https://cakapp.test/api/sync', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'meeting',
          meeting: { id: 'desk-other', title: 'Forbidden', startedAt: 1000, state: 'done' },
        }),
      }),
    );
    expect(pushForbidden.status).toBe(403);

    const pullRes = await syncGet(new NextRequest('https://cakapp.test/api/sync?since=0'));
    expect(pullRes.status).toBe(200);
    const pulled = await pullRes.json();
    expect(pulled.meetings).toHaveLength(1);
    expect(pulled.meetings[0].segments[0].track).toBe('me');
    expect(pulled.meetings[0].notes.enhanced).toBe('Ringkasan');
  });
});
