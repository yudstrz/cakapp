import { getProviderAdapter, getServerApiKey, type AiProviderId } from './providers';

export type ModelTier = 'hemat' | 'standar' | 'premium';

export interface SeedModel {
  id: string;
  label: string;
  tier: ModelTier;
  /** USD per 1M input tokens (checked 2026-11-26) */
  inputPer1M: number;
  /** USD per 1M output tokens (checked 2026-11-26) */
  outputPer1M: number;
  default?: boolean;
}

export interface VerifiedModel extends SeedModel {
  provider: AiProviderId;
}

/**
 * Lapis 1: Seed allowlist (kurasi manual).
 * Harga & ketersediaan diverifikasi dari dokumentasi resmi provider per 2026-11-26:
 * - Gemini: ai.google.dev (Gemini 3.5 Flash-Lite, 3.8 Flash, 3.6 Flash, Gemini 4 family)
 * - OpenAI: developers.openai.com (GPT-6 Luna, GPT-6.2 Sol, GPT-6.2 Astra)
 * - Anthropic: platform.claude.com (Claude Haiku 5.5, Sonnet 5.5, Opus 5.5, Fable 5.2)
 *
 * Model deprecated/shut down DILARANG masuk seed:
 * gemini-1.5-*, gemini-2.0-flash, gemini-2.0-flash-lite, gemini-3-pro-preview,
 * gemini-3.1-flash-lite-preview, gemini-2.5-*.
 */
export const MODEL_SEED: Record<AiProviderId, SeedModel[]> = {
  gemini: [
    // Checked 2026-11-26 at ai.google.dev/gemini-api/docs/pricing (paid tier, standard).
    // Where an introductory price is about to end, the seed holds the LATER (higher) price so the
    // daily budget never undercounts after the switch:
    // - 3.8 Flash / 3.6 Flash: $0.75 / $3.75 until 2026-12-31, then $1.50 / $7.50.
    // - 4 Argon / 4 Carbon: $2 / $10 until 2026-11-30, then $4 / $20.
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', tier: 'hemat', inputPer1M: 0.30, outputPer1M: 2.50, default: true },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', tier: 'standar', inputPer1M: 1.50, outputPer1M: 7.50 },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', tier: 'standar', inputPer1M: 1.50, outputPer1M: 7.50 },
    { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', tier: 'premium', inputPer1M: 1.50, outputPer1M: 7.50 },
    { id: 'gemini-4-argon', label: 'Gemini 4 Argon', tier: 'premium', inputPer1M: 4.00, outputPer1M: 20.00 },
    { id: 'gemini-4-neon', label: 'Gemini 4 Neon', tier: 'premium', inputPer1M: 3.00, outputPer1M: 15.00 },
    { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', tier: 'premium', inputPer1M: 4.00, outputPer1M: 20.00 },
  ],
  openai: [
    // Checked 2026-11-26 at developers.openai.com/api/docs/pricing
    { id: 'gpt-6-luna', label: 'GPT-6 Luna', tier: 'hemat', inputPer1M: 0.10, outputPer1M: 0.50, default: true },
    { id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol', tier: 'standar', inputPer1M: 2.00, outputPer1M: 10.00 },
    { id: 'gpt-6.2-astra', label: 'GPT-6.2 Astra', tier: 'premium', inputPer1M: 8.00, outputPer1M: 40.00 },
  ],
  anthropic: [
    // Checked 2026-11-26 at platform.claude.com/docs/en/about-claude/pricing
    // Haiku 5.5 is listed "from" $0.10 / $0.50; the budget uses that base rate.
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', tier: 'hemat', inputPer1M: 0.10, outputPer1M: 0.50, default: true },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', tier: 'standar', inputPer1M: 2.00, outputPer1M: 10.00 },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', tier: 'premium', inputPer1M: 4.00, outputPer1M: 20.00 },
    { id: 'claude-fable-5-2', label: 'Claude Fable 5.2', tier: 'premium', inputPer1M: 8.00, outputPer1M: 40.00 },
  ],
};

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
}

const MODEL_CACHE_TTL_SEC = 3600; // 1 jam

export function isPremiumAllowed(): boolean {
  return process.env.AI_ALLOW_PREMIUM === 'true';
}

export function getSeedModel(provider: AiProviderId, modelId: string): SeedModel | undefined {
  return MODEL_SEED[provider].find((m) => m.id === modelId);
}

export function getDefaultSeedModel(provider: AiProviderId): SeedModel {
  return MODEL_SEED[provider].find((m) => m.default) ?? MODEL_SEED[provider][0];
}

/** A model without a real price would spend money the daily budget cannot see, so it never goes live. */
export function hasValidPricing(model: SeedModel): boolean {
  return Number.isFinite(model.inputPer1M) && model.inputPer1M > 0 && Number.isFinite(model.outputPer1M) && model.outputPer1M > 0;
}

export function estimateCostUsd(provider: AiProviderId, modelId: string, inputTokens: number, outputTokens: number): number {
  const model = getSeedModel(provider, modelId);
  if (!model || !hasValidPricing(model)) return 0;
  return (inputTokens / 1_000_000) * model.inputPer1M + (outputTokens / 1_000_000) * model.outputPer1M;
}

export interface VerifiedModelsResult {
  models: VerifiedModel[];
  fromFallback: boolean;
  seedDefaultActive: boolean;
}

export function pickDefaultVerifiedModel(models: VerifiedModel[], provider: AiProviderId): string {
  return models.find((m) => m.default)?.id ?? models[0]?.id ?? getDefaultSeedModel(provider).id;
}

/**
 * Layer 2: Intersect manual seed with provider List Models API, cached in Redis for 1 hour.
 * Models without valid pricing never activate. Falls back to last-known cache, then default-only seed.
 */
export async function getVerifiedModelsForProvider(
  provider: AiProviderId,
  opts: { cache?: CacheStore; byokKey?: string; allowPremium?: boolean } = {},
): Promise<VerifiedModelsResult> {
  const allowPremium = opts.allowPremium ?? isPremiumAllowed();
  const seed = MODEL_SEED[provider].filter((m) => hasValidPricing(m) && (allowPremium || m.tier !== 'premium'));
  const seedDefaultId = getDefaultSeedModel(provider).id;
  const apiKey = opts.byokKey?.trim() || getServerApiKey(provider);

  if (!apiKey) {
    return { models: [], fromFallback: false, seedDefaultActive: false };
  }

  const cacheKey = `ai:models:v1:${provider}`;
  const lastCacheKey = `ai:models:last:v1:${provider}`;
  let liveIds: string[] | null = null;
  let fromFallback = false;

  if (!opts.byokKey && opts.cache) {
    try {
      const cached = await opts.cache.get<string[]>(cacheKey);
      if (Array.isArray(cached) && cached.length > 0) {
        liveIds = cached;
      }
    } catch {
      // Cache read failure falls through to live provider check.
    }
  }

  if (!liveIds) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        liveIds = await getProviderAdapter(provider).listModels(apiKey, controller.signal);
      } finally {
        clearTimeout(timer);
      }

      if (!opts.byokKey && opts.cache && liveIds.length > 0) {
        await opts.cache.set(cacheKey, liveIds, MODEL_CACHE_TTL_SEC).catch(() => {});
        await opts.cache.set(lastCacheKey, liveIds).catch(() => {});
      }
    } catch (err) {
      fromFallback = true;
      console.warn(`[AI Models] ListModels gagal untuk ${provider}:`, err instanceof Error ? err.message : 'unknown');

      if (!opts.byokKey && opts.cache) {
        const lastKnown = await opts.cache.get<string[]>(lastCacheKey).catch(() => null);
        if (Array.isArray(lastKnown) && lastKnown.length > 0) {
          liveIds = lastKnown;
        }
      }

      if (!liveIds) {
        const defaults = seed.filter((m) => m.default).map((m) => ({ ...m, provider }));
        return {
          models: defaults,
          fromFallback: true,
          seedDefaultActive: defaults.some((m) => m.id === seedDefaultId),
        };
      }
    }
  }

  const liveSet = new Set(liveIds);
  const verified: VerifiedModel[] = [];

  for (const m of seed) {
    if (liveSet.has(m.id)) {
      verified.push({ ...m, provider });
    } else {
      console.warn(`[AI Models] Model seed '${m.id}' (${provider}) tidak ada di List Models API, disembunyikan.`);
    }
  }

  const seedDefaultActive = verified.some((m) => m.id === seedDefaultId);
  // Promote the first verified model if the seed default was retired by the provider.
  if (verified.length > 0 && !verified.some((m) => m.default)) {
    verified[0] = { ...verified[0], default: true };
  }

  return { models: verified, fromFallback, seedDefaultActive };
}

export async function getAllVerifiedModels(opts: {
  cache?: CacheStore;
  byokProvider?: AiProviderId;
  byokKey?: string;
  allowPremium?: boolean;
} = {}): Promise<Record<AiProviderId, VerifiedModel[]>> {
  const providers: AiProviderId[] = ['gemini', 'openai', 'anthropic'];
  const entries = await Promise.all(
    providers.map(async (p) => {
      const useByok = opts.byokProvider === p && opts.byokKey ? opts.byokKey : undefined;
      const { models } = await getVerifiedModelsForProvider(p, {
        cache: opts.cache,
        byokKey: useByok,
        allowPremium: opts.allowPremium,
      });
      return [p, models] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<AiProviderId, VerifiedModel[]>;
}
