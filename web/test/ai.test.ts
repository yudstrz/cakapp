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

let mockIpRateLimitSuccess = true;
let mockUserRateLimitSuccess = true;
let mockRateLimitRemaining = 4;

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

vi.mock('@upstash/ratelimit', () => {
  return {
    Ratelimit: class MockRatelimit {
      private prefix: string;
      constructor(opts: { prefix?: string }) {
        this.prefix = opts.prefix ?? '';
      }
      static slidingWindow() {
        return {};
      }
      async limit() {
        const isIp = this.prefix.includes('ai:rl:ip');
        return {
          success: isIp ? mockIpRateLimitSuccess : mockUserRateLimitSuccess,
          remaining: mockRateLimitRemaining,
          reset: Date.now() + 30_000,
        };
      }
    },
  };
});

import { POST as generatePost, OPTIONS as generateOptions } from '@/app/api/ai/generate/route';
import { POST as transcribePost } from '@/app/api/ai/transcribe/route';
import { GET as modelsGet } from '@/app/api/ai/models/route';
import { GET as usageGet } from '@/app/api/ai/usage/route';
import { GET as healthGet } from '@/app/api/ai/health/route';
import { getVerifiedModelsForProvider, hasValidPricing, MODEL_SEED, type CacheStore } from '@/lib/ai/models';
import { enforceAiLimits, getWibDayInfo, MAX_INPUT_CHARS, recordGlobalSpend } from '@/lib/ai/limits';
import { mapProviderHttpError, sanitizeErrorMessage } from '@/lib/ai/providers';
import { generateCloudMapReduce, reconcileSelectedModel, splitTranscriptIntoChunks } from '@/lib/ai/chunk-client';

function makeRequest(url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return new NextRequest(url, {
    method: init.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
      ...(init.headers ?? {}),
    },
    ...(init.body !== undefined ? { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) } : {}),
  });
}

describe('AI Backend Proxy & Protections', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockRedisStore.clear();
    mockIpRateLimitSuccess = true;
    mockUserRateLimitSuccess = true;
    mockRateLimitRemaining = 4;
    mockGetSession.mockResolvedValue({ user: { id: 'user-1', email: 'test@cakapp.id', name: 'Test User' } });
    mockSql.mockResolvedValue([]);
    process.env.GEMINI_API_KEY = 'AIzaSyTestServerGeminiSecretKey123456789';
    process.env.OPENAI_API_KEY = 'sk-proj-testServerOpenAiSecretKey123456789';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-testServerAnthropicKey123456';
    process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-redis-token';
    process.env.AI_DAILY_BUDGET_USD = '5';
    process.env.AI_KILL_SWITCH = 'false';
    process.env.AI_ALLOW_PREMIUM = 'false';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests with 401 UNAUTHORIZED and ignores userId in body', async () => {
    mockGetSession.mockResolvedValue(null);
    const req = makeRequest('http://localhost:3000/api/ai/generate', {
      body: {
        userId: 'spoofed-admin',
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        task: 'notulen',
        input: 'halo',
        stream: false,
      },
    });
    const res = await generatePost(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('blocks disallowed CORS origins and allows valid origins on preflight', async () => {
    const badPreflight = makeRequest('http://localhost:3000/api/ai/generate', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example.com' },
    });
    expect((await generateOptions(badPreflight)).status).toBe(403);

    const goodPreflight = makeRequest('http://localhost:3000/api/ai/generate', {
      method: 'OPTIONS',
      headers: { origin: 'https://cakapp.vercel.app' },
    });
    const okRes = await generateOptions(goodPreflight);
    expect(okRes.status).toBe(204);
    expect(okRes.headers.get('Access-Control-Allow-Origin')).toBe('https://cakapp.vercel.app');
    expect(okRes.headers.get('Cache-Control')).toBe('no-store');
  });

  it('validates input length and rejects input exceeding MAX_INPUT_CHARS', async () => {
    const req = makeRequest('http://localhost:3000/api/ai/generate', {
      body: {
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        task: 'notulen',
        input: 'a'.repeat(MAX_INPUT_CHARS + 1),
        stream: false,
      },
    });
    const res = await generatePost(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('INVALID_INPUT');
  });

  it('intersects seed with List Models API, caches for 1 hour, and promotes backup default if seed default is retired', async () => {
    let fetchCount = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCount += 1;
      return new Response(
        JSON.stringify({
          models: [
            // Seed default gemini-3.5-flash-lite intentionally omitted to test checklist #7
            { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-4-hydrogen', supportedGenerationMethods: ['generateContent'] },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const memory = new Map<string, unknown>();
    const cache: CacheStore = {
      get: async <T>(k: string) => (memory.get(k) as T) ?? null,
      set: async (k: string, v: unknown) => {
        memory.set(k, v);
      },
    };

    const first = await getVerifiedModelsForProvider('gemini', { cache, allowPremium: false });
    expect(first.seedDefaultActive).toBe(false);
    expect(first.models.map((m) => m.id)).toEqual(['gemini-3.8-flash']);
    expect(first.models[0].default).toBe(true);

    const second = await getVerifiedModelsForProvider('gemini', { cache, allowPremium: false });
    expect(second.models.map((m) => m.id)).toEqual(['gemini-3.8-flash']);
    expect(fetchCount).toBe(1);
  });

  it('uses last cache when List Models fails, or default-only seed when no cache exists', async () => {
    globalThis.fetch = vi.fn(async () => new Response('Server Error', { status: 500 })) as unknown as typeof fetch;

    const noCache = await getVerifiedModelsForProvider('openai', { allowPremium: false });
    expect(noCache.fromFallback).toBe(true);
    expect(noCache.models.map((m) => m.id)).toEqual(['gpt-6-luna']);

    const memory = new Map<string, unknown>();
    memory.set('ai:models:last:v1:openai', ['gpt-6-luna', 'gpt-6.2-sol']);
    const cache: CacheStore = {
      get: async <T>(k: string) => (memory.get(k) as T) ?? null,
      set: async (k: string, v: unknown) => {
        memory.set(k, v);
      },
    };
    const withCache = await getVerifiedModelsForProvider('openai', { cache, allowPremium: false });
    expect(withCache.fromFallback).toBe(true);
    expect(withCache.models.map((m) => m.id)).toEqual(['gpt-6-luna', 'gpt-6.2-sol']);
  });

  it('rejects out-of-list models and premium models when AI_ALLOW_PREMIUM=false, allows when true', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          models: [
            { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-4-hydrogen', supportedGenerationMethods: ['generateContent'] },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const outOfList = makeRequest('http://localhost:3000/api/ai/generate', {
      body: { provider: 'gemini', model: 'gemini-1.5-pro', task: 'notulen', input: 'halo', stream: false },
    });
    expect((await generatePost(outOfList)).status).toBe(400);

    const premiumBlocked = makeRequest('http://localhost:3000/api/ai/generate', {
      body: { provider: 'gemini', model: 'gemini-4-hydrogen', task: 'notulen', input: 'halo', stream: false },
    });
    expect((await generatePost(premiumBlocked)).status).toBe(400);
  });

  it('auto-falls back to default model on 404 from provider and sends x-goog-api-key header', async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, headers: new Headers(init?.headers) });
      if (u.includes('/models?')) {
        return new Response(
          JSON.stringify({
            models: [
              { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
            ],
          }),
          { status: 200 },
        );
      }
      if (u.includes('gemini-3.8-flash:generateContent')) {
        return new Response('Model not found', { status: 404 });
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Notulen hasil fallback' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const req = makeRequest('http://localhost:3000/api/ai/generate', {
      body: { provider: 'gemini', model: 'gemini-3.8-flash', task: 'notulen', input: 'halo', stream: false },
    });
    const res = await generatePost(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.model).toBe('gemini-3.5-flash-lite');
    expect(json.text).toBe('Notulen hasil fallback');
    expect(calls.every((c) => !c.url.includes('key='))).toBe(true);
    expect(calls[0].headers.get('x-goog-api-key')).toBe('AIzaSyTestServerGeminiSecretKey123456789');
  });

  it('enforces kill switch, global budget, and IP flood limit while keeping per-account tokens and requests unlimited', async () => {
    const redisArg = mockRedis as unknown as Parameters<typeof enforceAiLimits>[0]['redis'];

    process.env.AI_KILL_SWITCH = 'true';
    await expect(
      enforceAiLimits({ userId: 'u1', ip: '1.1.1.1', estimatedInputTokens: 100, redis: redisArg }),
    ).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED', status: 503 });
    process.env.AI_KILL_SWITCH = 'false';

    const { dayKey } = getWibDayInfo();
    mockRedisStore.set(`ai:budget:usd:${dayKey}`, 5.5);
    await expect(
      enforceAiLimits({ userId: 'u1', ip: '1.1.1.1', estimatedInputTokens: 100, redis: redisArg }),
    ).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED', status: 429 });
    mockRedisStore.set(`ai:budget:usd:${dayKey}`, 0);

    mockIpRateLimitSuccess = false;
    await expect(
      enforceAiLimits({ userId: 'u1', ip: '1.1.1.1', estimatedInputTokens: 100, redis: redisArg }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    mockIpRateLimitSuccess = true;

    // Per-account rate limit and daily token/request counters no longer block requests
    mockUserRateLimitSuccess = false;
    mockRedisStore.set(`ai:daily:tok:${dayKey}:u1`, 10_000_000);
    mockRedisStore.set(`ai:daily:req:${dayKey}:user-1`, 999);
    await expect(
      enforceAiLimits({ userId: 'u1', ip: '1.1.1.1', estimatedInputTokens: 50_000, redis: redisArg }),
    ).resolves.toMatchObject({ unlimited: true });
    mockUserRateLimitSuccess = true;

    const reqUnlimited = makeRequest('http://localhost:3000/api/ai/generate', {
      body: { provider: 'openai', model: 'gpt-6-luna', task: 'ringkasan', input: 'halo', stream: false },
    });
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'gpt-6-luna' }] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Ringkasan tanpa kuota' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const unlimitedRes = await generatePost(reqUnlimited);
    expect(unlimitedRes.status).toBe(200);
    expect(unlimitedRes.headers.get('X-Daily-Quota-Remaining')).toBeNull();

    const spend = await recordGlobalSpend({
      provider: 'openai',
      model: 'gpt-6-luna',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      redis: redisArg,
    });
    expect(spend).toBeCloseTo(0.6, 4);
  });

  it('maps provider HTTP errors and sanitizes API keys from error messages', () => {
    expect(mapProviderHttpError(401, 'Invalid key').code).toBe('PROVIDER_ERROR');
    expect(mapProviderHttpError(429, 'Rate limit').code).toBe('RATE_LIMITED');
    expect(mapProviderHttpError(404, 'model not found').code).toBe('MODEL_UNAVAILABLE');
    expect(mapProviderHttpError(400, 'This model is deprecated').code).toBe('MODEL_UNAVAILABLE');

    const dirty = `Upstream failed with key ${process.env.OPENAI_API_KEY} and Bearer sk-1234567890abcdefghij`;
    const clean = sanitizeErrorMessage(dirty);
    expect(clean).not.toContain(process.env.OPENAI_API_KEY!);
    expect(clean).not.toContain('sk-1234567890');
    expect(clean).toContain('[REDACTED]');

    expect(hasValidPricing({ id: 'x', label: 'X', tier: 'hemat', inputPer1M: 0, outputPer1M: 1 })).toBe(false);
    expect(hasValidPricing({ id: 'x', label: 'X', tier: 'hemat', inputPer1M: Number.NaN, outputPer1M: 1 })).toBe(false);
  });

  it('returns usage, models, and health endpoints when authenticated', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }] }),
          { status: 200 },
        );
      }
      if (u.includes('api.openai.com')) {
        return new Response(JSON.stringify({ data: [{ id: 'gpt-6-luna', shutdown_date: '2099-01-01' }, { id: 'gpt-6.2-sol', shutdown_date: '2020-01-01' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [{ id: 'claude-haiku-5-5', lifecycle: 'active' }, { id: 'claude-sonnet-5-5', lifecycle: 'retired' }] }), { status: 200 });
    }) as unknown as typeof fetch;

    const usageRes = await usageGet(makeRequest('http://localhost:3000/api/ai/usage', { method: 'GET' }));
    expect(usageRes.status).toBe(410);
    expect((await usageRes.json()).unlimited).toBe(true);

    const modelsRes = await modelsGet(makeRequest('http://localhost:3000/api/ai/models', { method: 'GET' }));
    const modelsJson = await modelsRes.json();
    expect(modelsJson.models.gemini.map((m: { id: string }) => m.id)).toEqual(['gemini-3.5-flash-lite']);
    expect(modelsJson.models.openai.map((m: { id: string }) => m.id)).toEqual(['gpt-6-luna']);
    expect(modelsJson.models.anthropic.map((m: { id: string }) => m.id)).toEqual(['claude-haiku-5-5']);

    const healthRes = await healthGet(makeRequest('http://localhost:3000/api/ai/health', { method: 'GET' }));
    const healthJson = await healthRes.json();
    expect(healthJson.ok).toBe(true);
    expect(healthJson.providers.gemini.defaultModelReady).toBe(true);
  });

  it('contains no deprecated models in MODEL_SEED and supports client chunking + model reconciliation', async () => {
    const allIds = Object.values(MODEL_SEED).flat().map((m) => m.id);
    for (const id of allIds) {
      expect(id).not.toMatch(/^gemini-1\.5-/);
      expect(id).not.toMatch(/^gemini-2\.0-/);
      expect(id).not.toMatch(/^gemini-2\.5-/);
      expect(id).not.toBe('gemini-3-pro-preview');
      expect(id).not.toBe('gemini-3.1-flash-lite-preview');
    }

    const verified = [{ id: 'gemini-3.5-flash-lite', label: 'Flash Lite', tier: 'hemat' as const, default: true, provider: 'gemini' as const }];
    expect(reconcileSelectedModel('gemini-1.5-pro', verified)).toBe('gemini-3.5-flash-lite');

    const chunks = splitTranscriptIntoChunks('Baris satu.\nBaris dua.\nBaris tiga.', 15);
    expect(chunks.length).toBe(3);

    const seenTasks: string[] = [];
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { task: string; stream: boolean };
      seenTasks.push(body.task);
      if (!body.stream) {
        return new Response(JSON.stringify({ text: 'Poin bagian', model: 'gemini-3.5-flash-lite' }), { status: 200 });
      }
      const sse = 'event: token\ndata: {"text":"Notulen akhir"}\n\nevent: done\ndata: {"model":"gemini-3.5-flash-lite"}\n\n';
      return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }) as unknown as typeof fetch;

    const mapRed = await generateCloudMapReduce({
      baseUrl: 'http://localhost:3000',
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      task: 'notulen',
      input: 'Kalimat pertama panjang.\nKalimat kedua panjang.',
      maxChunkChars: 26,
    });
    expect(seenTasks).toEqual(['ringkasan', 'ringkasan', 'notulen']);
    expect(mapRed.text).toBe('Notulen akhir');
  });

  it('transcribes audio chunks via Gemini and OpenAI (with whisper-1 fallback) without per-account STT quotas', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/models?')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] }] }),
          { status: 200 },
        );
      }
      if (u.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Halo tim rapat dimulai' }] } }],
            usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 6 },
          }),
          { status: 200 },
        );
      }
      if (u.includes('/audio/transcriptions')) {
        return new Response(JSON.stringify({ text: 'Transkrip OpenAI berhasil' }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }) as unknown as typeof fetch;

    const formGemini = new FormData();
    formGemini.set('file', new Blob([new Uint8Array(256)], { type: 'audio/wav' }), 'chunk.wav');
    formGemini.set('provider', 'gemini');
    const reqGemini = new NextRequest('http://localhost:3000/api/ai/transcribe', { method: 'POST', body: formGemini });
    const resGemini = await transcribePost(reqGemini);
    expect(resGemini.status).toBe(200);
    expect((await resGemini.json()).text).toBe('Halo tim rapat dimulai');

    const formOpenAi = new FormData();
    formOpenAi.set('file', new Blob([new Uint8Array(256)], { type: 'audio/wav' }), 'chunk.wav');
    formOpenAi.set('provider', 'openai');
    const reqOpenAi = new NextRequest('http://localhost:3000/api/ai/transcribe', { method: 'POST', body: formOpenAi });
    const resOpenAi = await transcribePost(reqOpenAi);
    expect(resOpenAi.status).toBe(200);
    expect((await resOpenAi.json()).text).toBe('Transkrip OpenAI berhasil');

    const { dayKey } = getWibDayInfo();
    mockRedisStore.set(`ai:daily:stt:${dayKey}:user-1`, 9999);
    const formNoQuota = new FormData();
    formNoQuota.set('file', new Blob([new Uint8Array(128)], { type: 'audio/wav' }), 'chunk.wav');
    formNoQuota.set('provider', 'gemini');
    const resNoQuota = await transcribePost(new NextRequest('http://localhost:3000/api/ai/transcribe', { method: 'POST', body: formNoQuota }));
    expect(resNoQuota.status).toBe(200);
    expect(resNoQuota.headers.get('X-Daily-Stt-Remaining')).toBeNull();
  });
});
