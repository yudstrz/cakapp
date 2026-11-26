import { NextResponse, type NextRequest } from 'next/server';
import { getAllVerifiedModels, isPremiumAllowed } from '@/lib/ai/models';
import { createRedisCacheStore } from '@/lib/ai/limits';
import { extractByokHeader } from '@/lib/ai/keys';
import { errorJsonResponse, getSecurityHeaders, handleCorsPreflight, requireAuth } from '@/lib/ai/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = handleCorsPreflight;

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const byok = extractByokHeader(req.headers);
    const models = await getAllVerifiedModels({
      cache: createRedisCacheStore(),
      byokKey: byok?.apiKey,
      byokProvider: byok?.provider,
      allowPremium: byok ? true : isPremiumAllowed(),
    });

    return NextResponse.json(
      {
        models,
        allowPremium: byok ? true : isPremiumAllowed(),
      },
      { status: 200, headers: getSecurityHeaders(req) },
    );
  } catch (err) {
    return errorJsonResponse(err, req);
  }
}
