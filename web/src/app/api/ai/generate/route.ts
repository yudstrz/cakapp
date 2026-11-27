import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  AiProxyError,
  getProviderAdapter,
  resolveProviderApiKey,
  type AiProviderId,
  type TokenUsage,
} from '@/lib/ai/providers';
import {
  getSeedModel,
  getVerifiedModelsForProvider,
  hasValidPricing,
  isPremiumAllowed,
  pickDefaultVerifiedModel,
} from '@/lib/ai/models';
import {
  createRedisCacheStore,
  enforceAiLimits,
  MAX_BODY_BYTES,
  MAX_INPUT_CHARS,
  recordGlobalSpend,
} from '@/lib/ai/limits';
import { getSystemPromptForTask } from '@/lib/ai/prompts';
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

const GenerateSchema = z.object({
  provider: z.enum(['gemini', 'openai', 'anthropic']),
  model: z.string().min(1).max(120),
  task: z.enum(['notulen', 'ringkasan']),
  input: z
    .string()
    .min(1, 'Input tidak boleh kosong.')
    .max(MAX_INPUT_CHARS, `Input melebihi batas ${MAX_INPUT_CHARS.toLocaleString('id-ID')} karakter.`),
  stream: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let userId = 'anonymous';
  let providerName: AiProviderId | undefined;
  let activeModel = '';
  let taskName = '';

  try {
    const authUser = await requireAuth(req);
    userId = authUser.userId;

    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (contentLength > MAX_BODY_BYTES) {
      throw new AiProxyError('INVALID_INPUT', 'Ukuran request melebihi batas maksimal (1 MB).', 413);
    }

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      throw new AiProxyError('INVALID_INPUT', 'Ukuran request melebihi batas maksimal (1 MB).', 413);
    }

    let jsonBody: unknown;
    try {
      jsonBody = JSON.parse(rawBody);
    } catch {
      throw new AiProxyError('INVALID_INPUT', 'Format JSON tidak valid.', 400);
    }

    const parsed = GenerateSchema.safeParse(jsonBody);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'Parameter request tidak valid.';
      throw new AiProxyError('INVALID_INPUT', msg, 400);
    }

    const { provider, model, task, input, stream } = parsed.data;
    providerName = provider;
    activeModel = model;
    taskName = task;

    const { apiKey, isByok } = resolveProviderApiKey(provider, req.headers);
    if (!apiKey) {
      throw new AiProxyError('PROVIDER_ERROR', `Provider ${provider} belum dikonfigurasi di server.`, 503);
    }

    const seedEntry = getSeedModel(provider, model);
    if (!seedEntry || !hasValidPricing(seedEntry)) {
      throw new AiProxyError('INVALID_INPUT', `Model '${model}' tidak terdaftar di allowlist.`, 400);
    }
    if (!isByok && seedEntry.tier === 'premium' && !isPremiumAllowed()) {
      throw new AiProxyError('INVALID_INPUT', `Model premium '${model}' belum diaktifkan.`, 400);
    }

    const cache = createRedisCacheStore();
    const { models: verified } = await getVerifiedModelsForProvider(provider, {
      cache,
      byokKey: isByok ? apiKey : undefined,
      allowPremium: isByok ? true : isPremiumAllowed(),
    });

    if (!verified.some((m) => m.id === model)) {
      throw new AiProxyError('INVALID_INPUT', `Model '${model}' tidak aktif atau tidak tersedia.`, 400);
    }

    const estimatedInputTokens = Math.ceil(input.length / 4);
    let rateHeaders: Record<string, string> = {};

    if (!isByok) {
      const limitRes = await enforceAiLimits({
        userId: authUser.userId,
        ip: getClientIp(req),
        tier: authUser.tier,
        estimatedInputTokens,
      });
      rateHeaders = {
        'X-RateLimit-Remaining': String(limitRes.remainingMinute),
      };
    }

    const system = getSystemPromptForTask(task);
    const adapter = getProviderAdapter(provider);
    const fallbackModelId = pickDefaultVerifiedModel(verified, provider);

    // 55s internal timeout stays inside Vercel's 60s maxDuration.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('TIMEOUT')), 55_000);
    req.signal.addEventListener('abort', () => controller.abort(req.signal.reason), { once: true });

    const secHeaders = { ...getSecurityHeaders(req), ...rateHeaders };

    if (!stream) {
      try {
        let result;
        try {
          result = await adapter.generate({ model, system, input, signal: controller.signal, apiKey });
        } catch (err) {
          if (err instanceof AiProxyError && err.code === 'MODEL_UNAVAILABLE' && model !== fallbackModelId) {
            activeModel = fallbackModelId;
            result = await adapter.generate({ model: fallbackModelId, system, input, signal: controller.signal, apiKey });
          } else {
            throw err;
          }
        }

        if (!isByok) {
          await recordGlobalSpend({
            provider,
            model: activeModel,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          });
        }

        console.info(
          JSON.stringify({
            event: 'ai_generate',
            userId,
            provider,
            model: activeModel,
            task,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            latencyMs: Date.now() - startedAt,
            status: 'ok',
            byok: isByok,
          }),
        );

        return NextResponse.json(
          { text: result.text, model: activeModel, usage: result.usage },
          { status: 200, headers: secHeaders },
        );
      } finally {
        clearTimeout(timeoutId);
      }
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(streamController) {
        const sendEvent = (event: string, data: unknown) => {
          streamController.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          let usage: TokenUsage;
          const onToken = (token: string) => sendEvent('token', { text: token });

          try {
            usage = await adapter.stream({ model, system, input, signal: controller.signal, apiKey }, { onToken });
          } catch (err) {
            if (err instanceof AiProxyError && err.code === 'MODEL_UNAVAILABLE' && model !== fallbackModelId) {
              activeModel = fallbackModelId;
              usage = await adapter.stream({ model: fallbackModelId, system, input, signal: controller.signal, apiKey }, { onToken });
            } else {
              throw err;
            }
          }

          if (!isByok) {
            await recordGlobalSpend({
              provider,
              model: activeModel,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
            });
          }

          console.info(
            JSON.stringify({
              event: 'ai_generate_stream',
              userId,
              provider,
              model: activeModel,
              task,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              latencyMs: Date.now() - startedAt,
              status: 'ok',
              byok: isByok,
            }),
          );

          sendEvent('done', { model: activeModel, usage });
          streamController.close();
        } catch (err) {
          const proxyErr =
            controller.signal.aborted && String(controller.signal.reason).includes('TIMEOUT')
              ? new AiProxyError('TIMEOUT', 'Permintaan AI melebihi batas waktu.', 504)
              : err instanceof AiProxyError
                ? err
                : new AiProxyError('PROVIDER_ERROR', 'Terjadi kesalahan saat memproses streaming AI.', 502);

          console.warn(
            JSON.stringify({
              event: 'ai_generate_stream',
              userId,
              provider,
              model: activeModel,
              task,
              latencyMs: Date.now() - startedAt,
              status: proxyErr.code,
            }),
          );

          sendEvent('error', proxyErr.toJSON().error);
          streamController.close();
        } finally {
          clearTimeout(timeoutId);
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        ...secHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    const proxyErr =
      err instanceof Error && (err.name === 'AbortError' || err.message === 'TIMEOUT')
        ? new AiProxyError('TIMEOUT', 'Permintaan AI melebihi batas waktu.', 504)
        : err;

    console.warn(
      JSON.stringify({
        event: 'ai_generate',
        userId,
        provider: providerName,
        model: activeModel,
        task: taskName,
        latencyMs: Date.now() - startedAt,
        status: proxyErr instanceof AiProxyError ? proxyErr.code : 'ERROR',
      }),
    );

    return errorJsonResponse(proxyErr, req);
  }
}
