import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { AiProxyError, type AiProviderId } from './providers/types';
import { estimateCostUsd, type CacheStore } from './models';

/**
 * Vercel technical limits (verified at vercel.com/docs/functions/limitations on 2026-11-26):
 * - Request and response body limit: 4.5 MB max on Hobby and Pro (413 FUNCTION_PAYLOAD_TOO_LARGE).
 * - Function maxDuration: Hobby up to 300s (Fluid Compute), Pro up to 800s. Route sets maxDuration = 60 with 55s AbortController.
 * - Hobby monthly limits: 1,000,000 function invocations, 100 GB Fast Data Transfer, 10 GB Fast Origin Transfer.
 * - Hobby plan is restricted to non-commercial personal use; upgrade to Pro before serving commercial shared-key traffic.
 * - Audio/video files never touch Vercel functions: transcribe locally on client and send plain text chunks only.
 */

export type UserTier = 'free' | 'pro';

export interface TierLimits {
  reqPerMinute: number;
  reqPerDay: number;
  inputTokensPerDay: number;
  sttChunksPerMinute: number;
  sttChunksPerDay: number;
}

export const TIER_LIMITS: Record<UserTier, TierLimits> = {
  free: {
    reqPerMinute: 5,
    reqPerDay: 30,
    inputTokensPerDay: 300_000,
    sttChunksPerMinute: 20,
    sttChunksPerDay: 180,
  },
  pro: {
    reqPerMinute: 20,
    reqPerDay: 200,
    inputTokensPerDay: 2_000_000,
    sttChunksPerMinute: 60,
    sttChunksPerDay: 1_200,
  },
};

export const IP_REQ_PER_MINUTE = 20;
export const IP_STT_REQ_PER_MINUTE = 40;
export const MAX_INPUT_CHARS = 100_000;
export const MAX_BODY_BYTES = 1_000_000; // 1 MB cap keeps JSON payloads well below Vercel's 4.5 MB limit.
export const MAX_AUDIO_CHUNK_BYTES = 2_500_000; // 2.5 MB max per short audio chunk, safely below Vercel's 4.5 MB limit.

let cachedRedis: Redis | null = null;
// ponytail: reuse Ratelimit instances per warm isolate so @upstash/ratelimit ephemeralCache avoids extra Redis hits.
const limiterCache = new Map<string, Ratelimit>();

export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    return null;
  }
  if (!cachedRedis) {
    cachedRedis = new Redis({ url, token });
  }
  return cachedRedis;
}

function getSlidingLimiter(redis: Redis, prefix: string, maxRequests: number): Ratelimit {
  const key = `${prefix}:${maxRequests}`;
  let limiter = limiterCache.get(key);
  if (!limiter || process.env.NODE_ENV === 'test') {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxRequests, '1 m'),
      prefix,
    });
    if (process.env.NODE_ENV !== 'test') {
      limiterCache.set(key, limiter);
    }
  }
  return limiter;
}

export function createRedisCacheStore(redis: Redis | null = getRedis()): CacheStore | undefined {
  if (!redis) return undefined;
  return {
    async get<T>(key: string): Promise<T | null> {
      return (await redis.get<T>(key)) ?? null;
    },
    async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
      if (ttlSeconds) {
        await redis.set(key, value, { ex: ttlSeconds });
      } else {
        await redis.set(key, value);
      }
    },
  };
}

/** Current date key in WIB (Asia/Jakarta, UTC+7) and seconds remaining until 00:00 WIB. */
export function getWibDayInfo(now = new Date()): { dayKey: string; secondsUntilMidnight: number; resetAtIso: string } {
  const wibOffsetMs = 7 * 60 * 60 * 1000;
  const wibNow = new Date(now.getTime() + wibOffsetMs);
  const year = wibNow.getUTCFullYear();
  const month = String(wibNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wibNow.getUTCDate()).padStart(2, '0');
  const dayKey = `${year}-${month}-${day}`;

  const nextMidnightWibUtcMs = Date.UTC(year, wibNow.getUTCMonth(), wibNow.getUTCDate() + 1, 0, 0, 0) - wibOffsetMs;
  const secondsUntilMidnight = Math.max(60, Math.ceil((nextMidnightWibUtcMs - now.getTime()) / 1000));
  return {
    dayKey,
    secondsUntilMidnight,
    resetAtIso: new Date(nextMidnightWibUtcMs).toISOString(),
  };
}

export function isKillSwitchActive(): boolean {
  return process.env.AI_KILL_SWITCH === 'true';
}

export function getDailyBudgetUsd(): number {
  const parsed = Number(process.env.AI_DAILY_BUDGET_USD ?? '5');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export interface RateCheckResult {
  remainingMinute: number;
  unlimited: true;
}

async function enforceGlobalAndIpLimits(params: {
  ip: string;
  ipPrefix: string;
  ipPerMinute: number;
  ipExceededMessage: string;
  budgetExceededMessage: string;
  redis?: Redis | null;
}): Promise<RateCheckResult> {
  if (isKillSwitchActive()) {
    throw new AiProxyError('BUDGET_EXCEEDED', 'Layanan Cloud AI sedang dinonaktifkan sementara oleh administrator.', 503, 300);
  }

  const redis = params.redis !== undefined ? params.redis : getRedis();
  if (!redis) {
    return { remainingMinute: params.ipPerMinute, unlimited: true };
  }

  const { dayKey, secondsUntilMidnight } = getWibDayInfo();
  const currentSpend = Number((await redis.get<number>(`ai:budget:usd:${dayKey}`)) ?? 0);
  if (currentSpend >= getDailyBudgetUsd()) {
    throw new AiProxyError('BUDGET_EXCEEDED', params.budgetExceededMessage, 429, secondsUntilMidnight);
  }

  const ipRes = await getSlidingLimiter(redis, params.ipPrefix, params.ipPerMinute).limit(params.ip || 'unknown');
  if (!ipRes.success) {
    const retryAfter = Math.max(1, Math.ceil((ipRes.reset - Date.now()) / 1000));
    throw new AiProxyError('RATE_LIMITED', params.ipExceededMessage, 429, retryAfter);
  }

  return { remainingMinute: ipRes.remaining, unlimited: true };
}

/**
 * Enforce kill switch, global daily USD cap, and per-IP anti-flood window only.
 * Per-account request and token quotas are disabled.
 */
export async function enforceAiLimits(params: {
  userId: string;
  ip: string;
  tier?: UserTier;
  estimatedInputTokens: number;
  redis?: Redis | null;
}): Promise<RateCheckResult> {
  return enforceGlobalAndIpLimits({
    ip: params.ip,
    ipPrefix: 'ai:rl:ip',
    ipPerMinute: IP_REQ_PER_MINUTE,
    ipExceededMessage: 'Terlalu banyak permintaan dari IP ini. Coba lagi sebentar.',
    budgetExceededMessage: 'Batas anggaran harian Cloud AI global telah tercapai. Silakan gunakan AI Lokal.',
    redis: params.redis,
  });
}

export async function recordRawUsdSpend(costUsd: number, redisArg?: Redis | null): Promise<number> {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
  const redis = redisArg !== undefined ? redisArg : getRedis();
  if (!redis) return costUsd;

  const { dayKey, secondsUntilMidnight } = getWibDayInfo();
  const budgetKey = `ai:budget:usd:${dayKey}`;
  const total = await redis.incrbyfloat(budgetKey, costUsd);
  await redis.expire(budgetKey, secondsUntilMidnight);
  return total;
}

export async function recordGlobalSpend(params: {
  provider: AiProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  redis?: Redis | null;
}): Promise<number> {
  const cost = estimateCostUsd(params.provider, params.model, params.inputTokens, params.outputTokens);
  return recordRawUsdSpend(cost, params.redis);
}

export async function enforceSttLimits(params: {
  userId: string;
  ip: string;
  tier?: UserTier;
  redis?: Redis | null;
}): Promise<RateCheckResult> {
  return enforceGlobalAndIpLimits({
    ip: params.ip,
    ipPrefix: 'ai:rl:stt:ip',
    ipPerMinute: IP_STT_REQ_PER_MINUTE,
    ipExceededMessage: 'Terlalu banyak potongan audio per menit dari IP ini.',
    budgetExceededMessage: 'Batas anggaran harian Cloud AI global telah tercapai. Beralih ke Whisper Lokal.',
    redis: params.redis,
  });
}

export async function getUserUsage(_userId: string, _tier: UserTier = 'free', _redis: Redis | null = getRedis()) {
  const { resetAtIso } = getWibDayInfo();
  return {
    unlimited: true,
    tier: 'unlimited',
    usedRequests: 0,
    limitRequests: null,
    remainingRequests: null,
    usedInputTokens: 0,
    limitInputTokens: null,
    remainingInputTokens: null,
    usedSttChunks: 0,
    limitSttChunks: null,
    remainingSttChunks: null,
    resetAt: resetAtIso,
  };
}
