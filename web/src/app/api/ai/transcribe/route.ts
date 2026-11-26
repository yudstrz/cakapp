import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { AiProxyError, resolveProviderApiKey } from '@/lib/ai/providers';
import {
  createRedisCacheStore,
  enforceSttLimits,
  MAX_AUDIO_CHUNK_BYTES,
  recordRawUsdSpend,
} from '@/lib/ai/limits';
import { transcribeAudioChunk, type SttProviderId } from '@/lib/ai/transcribe';
import {
  errorJsonResponse,
  getClientIp,
  getSecurityHeaders,
  handleCorsPreflight,
  requireAuth,
} from '@/lib/ai/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const OPTIONS = handleCorsPreflight;

const SttFieldsSchema = z.object({
  provider: z.enum(['gemini', 'openai']).default('gemini'),
  language: z.string().max(16).optional(),
  prompt: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let userId = 'anonymous';
  let providerName: SttProviderId = 'gemini';
  let audioSize = 0;

  try {
    const authUser = await requireAuth(req);
    userId = authUser.userId;

    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (contentLength > MAX_AUDIO_CHUNK_BYTES + 256_000) {
      throw new AiProxyError('INVALID_INPUT', 'Ukuran potongan audio melebihi batas 2,5 MB.', 413);
    }

    const form = await req.formData().catch(() => {
      throw new AiProxyError('INVALID_INPUT', 'Permintaan harus berupa multipart/form-data dengan field file.', 400);
    });

    const fileEntry = form.get('file');
    if (!(fileEntry instanceof Blob)) {
      throw new AiProxyError('INVALID_INPUT', 'Field file audio wajib disertakan.', 400);
    }
    if (fileEntry.size === 0) {
      throw new AiProxyError('INVALID_INPUT', 'File audio kosong.', 400);
    }
    if (fileEntry.size > MAX_AUDIO_CHUNK_BYTES) {
      throw new AiProxyError('INVALID_INPUT', 'Ukuran potongan audio melebihi batas 2,5 MB. Potong audio lebih pendek di client.', 413);
    }
    audioSize = fileEntry.size;

    const parsedFields = SttFieldsSchema.safeParse({
      provider: form.get('provider') ?? 'gemini',
      language: typeof form.get('language') === 'string' ? String(form.get('language')) : undefined,
      prompt: typeof form.get('prompt') === 'string' ? String(form.get('prompt')) : undefined,
    });
    if (!parsedFields.success) {
      throw new AiProxyError('INVALID_INPUT', 'Provider Speech-to-Text hanya mendukung gemini atau openai.', 400);
    }

    const { provider, language, prompt } = parsedFields.data;
    providerName = provider;

    const { apiKey, isByok } = resolveProviderApiKey(provider, req.headers);
    if (!apiKey) {
      throw new AiProxyError('PROVIDER_ERROR', `Kunci server ${provider} belum dikonfigurasi.`, 503);
    }

    let rateHeaders: Record<string, string> = {};
    if (!isByok) {
      const sttLimit = await enforceSttLimits({
        userId: authUser.userId,
        ip: getClientIp(req),
        tier: authUser.tier,
      });
      rateHeaders = {
        'X-RateLimit-Remaining': String(sttLimit.remainingMinute),
        'X-Daily-Stt-Remaining': String(sttLimit.remainingDailyChunks),
      };
    }

    const audioBytes = Buffer.from(await fileEntry.arrayBuffer());
    const fileName = 'name' in fileEntry && typeof fileEntry.name === 'string' ? fileEntry.name : 'chunk.wav';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('TIMEOUT')), 50_000);
    req.signal.addEventListener('abort', () => controller.abort(req.signal.reason), { once: true });

    try {
      const result = await transcribeAudioChunk({
        provider,
        audioBytes,
        mimeType: fileEntry.type || 'audio/wav',
        fileName,
        language,
        prompt,
        apiKey,
        isByok,
        cache: createRedisCacheStore(),
        signal: controller.signal,
      });

      if (!isByok && result.estimatedCostUsd > 0) {
        await recordRawUsdSpend(result.estimatedCostUsd);
      }

      console.info(
        JSON.stringify({
          event: 'ai_transcribe',
          userId,
          provider,
          model: result.model,
          audioBytes: audioSize,
          latencyMs: Date.now() - startedAt,
          status: 'ok',
          byok: isByok,
        }),
      );

      return NextResponse.json(
        {
          text: result.text,
          provider,
          model: result.model,
        },
        { status: 200, headers: { ...getSecurityHeaders(req), ...rateHeaders } },
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const proxyErr =
      err instanceof Error && (err.name === 'AbortError' || err.message === 'TIMEOUT')
        ? new AiProxyError('TIMEOUT', 'Transkripsi Cloud AI melebihi batas waktu.', 504)
        : err;

    console.warn(
      JSON.stringify({
        event: 'ai_transcribe',
        userId,
        provider: providerName,
        audioBytes: audioSize,
        latencyMs: Date.now() - startedAt,
        status: proxyErr instanceof AiProxyError ? proxyErr.code : 'ERROR',
      }),
    );

    return errorJsonResponse(proxyErr, req);
  }
}
