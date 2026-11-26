import { NextResponse, type NextRequest } from 'next/server';
import { getDefaultSeedModel, getVerifiedModelsForProvider } from '@/lib/ai/models';
import { createRedisCacheStore, isKillSwitchActive } from '@/lib/ai/limits';
import { resolveProviderApiKey, type AiProviderId } from '@/lib/ai/providers';
import { errorJsonResponse, getSecurityHeaders, handleCorsPreflight, requireAuth } from '@/lib/ai/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = handleCorsPreflight;

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const cache = createRedisCacheStore();
    const providers: AiProviderId[] = ['gemini', 'openai', 'anthropic'];

    const results = await Promise.all(
      providers.map(async (provider) => {
        const { apiKey, isByok } = resolveProviderApiKey(provider, req.headers);
        if (!apiKey) {
          return [provider, { configured: false, defaultModelReady: false, availableModels: 0 }] as const;
        }
        const defaultModel = getDefaultSeedModel(provider);
        const { models, fromFallback, seedDefaultActive } = await getVerifiedModelsForProvider(provider, {
          cache,
          byokKey: isByok ? apiKey : undefined,
        });
        return [
          provider,
          {
            configured: true,
            byok: isByok,
            defaultModel: defaultModel.id,
            defaultModelReady: seedDefaultActive,
            availableModels: models.length,
            fromFallback,
          },
        ] as const;
      }),
    );

    const killSwitch = isKillSwitchActive();
    return NextResponse.json(
      {
        ok: !killSwitch,
        killSwitch,
        providers: Object.fromEntries(results),
      },
      { status: 200, headers: getSecurityHeaders(req) },
    );
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
