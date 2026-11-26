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
}

export const TIER_LIMITS: Record<UserTier, TierLimits> = {
  free: {
    reqPerMinute: 5,
    reqPerDay: 30,
    inputTokensPerDay: 300_000,
  },
  pro: {
    reqPerMinute: 20,
    reqPerDay: 200,
    inputTokensPerDay: 2_000_000,
  },
};

export const IP_REQ_PER_MINUTE = 20;
export const MAX_INPUT_CHARS = 100_000;
export const MAX_BODY_BYTES = 1_000_000; // 1 MB cap keeps payloads well below Vercel's 4.5 MB limit.

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
  remainingDailyReq: number;
  remainingDailyTokens: number;
}

/**
 * Enforce kill switch, daily global USD budget, per-IP sliding window, per-user minute window, and WIB daily quota.
 * ponytail: when Redis env is unset in local dev, fails open so offline dev works without Upstash.
 */
export async function enforceAiLimits(params: {
  userId: string;
  ip: string;
  tier?: UserTier;
  estimatedInputTokens: number;
  redis?: Redis | null;
}): Promise<RateCheckResult> {
  if (isKillSwitchActive()) {
    throw new AiProxyError('BUDGET_EXCEEDED', 'Layanan Cloud AI sedang dinonaktifkan sementara oleh administrator.', 503, 300);
  }

  const tier: UserTier = params.tier ?? 'free';
  const limits = TIER_LIMITS[tier];
  const redis = params.redis !== undefined ? params.redis : getRedis();

  if (!redis) {
    return {
      remainingMinute: limits.reqPerMinute,
      remainingDailyReq: limits.reqPerDay,
      remainingDailyTokens: limits.inputTokensPerDay,
    };
  }

  const { dayKey, secondsUntilMidnight } = getWibDayInfo();

  const budgetKey = `ai:budget:usd:${dayKey}`;
  const currentSpend = Number((await redis.get<number>(budgetKey)) ?? 0);
  if (currentSpend >= getDailyBudgetUsd()) {
    throw new AiProxyError(
      'BUDGET_EXCEEDED',
      'Batas anggaran harian Cloud AI global telah tercapai. Silakan gunakan AI Lokal.',
      429,
      secondsUntilMidnight,
    );
  }

  const ipLimiter = getSlidingLimiter(redis, 'ai:rl:ip', IP_REQ_PER_MINUTE);
  const ipRes = await ipLimiter.limit(params.ip || 'unknown');
  if (!ipRes.success) {
    const retryAfter = Math.max(1, Math.ceil((ipRes.reset - Date.now()) / 1000));
    throw new AiProxyError('RATE_LIMITED', 'Terlalu banyak permintaan dari IP ini. Coba lagi sebentar.', 429, retryAfter);
  }

  const userLimiter = getSlidingLimiter(redis, `ai:rl:user:${tier}`, limits.reqPerMinute);
  const userRes = await userLimiter.limit(params.userId);
  if (!userRes.success) {
    const retryAfter = Math.max(1, Math.ceil((userRes.reset - Date.now()) / 1000));
    throw new AiProxyError(
      'RATE_LIMITED',
      `Batas ${limits.reqPerMinute} permintaan per menit tercapai. Tunggu ${retryAfter} detik.`,
      429,
      retryAfter,
    );
  }

  const reqKey = `ai:daily:req:${dayKey}:${params.userId}`;
  const tokKey = `ai:daily:tok:${dayKey}:${params.userId}`;
  const [usedReqRaw, usedTokRaw] = await Promise.all([
    redis.get<number>(reqKey),
    redis.get<number>(tokKey),
  ]);
  const usedReq = Number(usedReqRaw ?? 0);
  const usedTok = Number(usedTokRaw ?? 0);

  if (usedReq >= limits.reqPerDay) {
    throw new AiProxyError(
      'QUOTA_EXCEEDED',
      `Kuota harian (${limits.reqPerDay} request/hari) sudah habis. Reset pukul 00:00 WIB.`,
      429,
      secondsUntilMidnight,
    );
  }

  if (usedTok + params.estimatedInputTokens > limits.inputTokensPerDay) {
    throw new AiProxyError(
      'QUOTA_EXCEEDED',
      `Kuota token input harian (${limits.inputTokensPerDay.toLocaleString('id-ID')} token/hari) tidak mencukupi. Reset pukul 00:00 WIB.`,
      429,
      secondsUntilMidnight,
    );
  }

  const newReq = await redis.incr(reqKey);
  if (newReq === 1) await redis.expire(reqKey, secondsUntilMidnight);

  const newTok = await redis.incrby(tokKey, params.estimatedInputTokens);
  if (newTok === params.estimatedInputTokens) await redis.expire(tokKey, secondsUntilMidnight);

  return {
    remainingMinute: userRes.remaining,
    remainingDailyReq: Math.max(0, limits.reqPerDay - newReq),
    remainingDailyTokens: Math.max(0, limits.inputTokensPerDay - newTok),
  };
}

export async function recordGlobalSpend(params: {
  provider: AiProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  redis?: Redis | null;
}): Promise<number> {
  const cost = estimateCostUsd(params.provider, params.model, params.inputTokens, params.outputTokens);
  if (cost <= 0) return 0;

  const redis = params.redis !== undefined ? params.redis : getRedis();
  if (!redis) return cost;

  const { dayKey, secondsUntilMidnight } = getWibDayInfo();
  const budgetKey = `ai:budget:usd:${dayKey}`;
  const total = await redis.incrbyfloat(budgetKey, cost);
  await redis.expire(budgetKey, secondsUntilMidnight);
  return total;
}

export async function getUserUsage(userId: string, tier: UserTier = 'free', redis: Redis | null = getRedis()) {
  const limits = TIER_LIMITS[tier];
  const { dayKey, resetAtIso } = getWibDayInfo();

  if (!redis) {
    return {
      tier,
      usedRequests: 0,
      limitRequests: limits.reqPerDay,
      remainingRequests: limits.reqPerDay,
      usedInputTokens: 0,
      limitInputTokens: limits.inputTokensPerDay,
      remainingInputTokens: limits.inputTokensPerDay,
      resetAt: resetAtIso,
    };
  }

  const [usedReqRaw, usedTokRaw] = await Promise.all([
    redis.get<number>(`ai:daily:req:${dayKey}:${userId}`),
    redis.get<number>(`ai:daily:tok:${dayKey}:${userId}`),
  ]);
  const usedRequests = Number(usedReqRaw ?? 0);
  const usedInputTokens = Number(usedTokRaw ?? 0);

  return {
    tier,
    usedRequests,
    limitRequests: limits.reqPerDay,
    remainingRequests: Math.max(0, limits.reqPerDay - usedRequests),
    usedInputTokens,
    limitInputTokens: limits.inputTokensPerDay,
    remainingInputTokens: Math.max(0, limits.inputTokensPerDay - usedInputTokens),
    resetAt: resetAtIso,
  };
}
