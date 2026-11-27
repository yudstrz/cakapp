import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  AiProxyError,
  getProviderAdapter,
  getServerApiKey,
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
const FIRST_TOKEN_FALLBACK_MS = 18_000;

export const OPTIONS = handleCorsPreflight;

const GenerateSchema = z.object({
  provider: z.enum(['gemini', 'openai', 'anthropic']),
  model: z.string().min(1).max(120),
  task: z.enum(['notulen', 'ringkasan', 'tanya']),
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
    let activeProvider: AiProviderId = provider;
    const fallbackModelId = pickDefaultVerifiedModel(verified, provider);
    const isRetryableError = (err: unknown): boolean =>
      err instanceof AiProxyError &&
      (err.code === 'MODEL_UNAVAILABLE' ||
        err.code === 'RATE_LIMITED' ||
        err.code === 'PROVIDER_ERROR' ||
        err.code === 'TIMEOUT');
    async function* alternateTargets(): AsyncGenerator<{ provider: AiProviderId; model: string; apiKey: string }> {
      if (model !== fallbackModelId) {
        yield { provider, model: fallbackModelId, apiKey };
      }
      if (!isByok) {
        for (const altProvider of ['gemini', 'openai', 'anthropic'] as const) {
          if (altProvider === provider) continue;
          const altKey = getServerApiKey(altProvider);
          if (!altKey) continue;
          const altRes = await getVerifiedModelsForProvider(altProvider, {
            cache,
            allowPremium: isPremiumAllowed(),
          }).catch(() => ({ models: [] }));
          if (altRes.models.length === 0) continue;
          yield {
            provider: altProvider,
            model: pickDefaultVerifiedModel(altRes.models, altProvider),
            apiKey: altKey,
          };
        }
      }
    }

    // 55s internal timeout stays inside Vercel's 60s maxDuration.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('TIMEOUT')), 55_000);
    req.signal.addEventListener('abort', () => controller.abort(req.signal.reason), { once: true });

    const secHeaders = { ...getSecurityHeaders(req), ...rateHeaders };

    if (!stream) {
      try {
        let result;
        try {
          result = await getProviderAdapter(provider).generate({ model, system, input, signal: controller.signal, apiKey });
        } catch (err) {
          if (controller.signal.aborted || !isRetryableError(err)) throw err;
          let resolved;
          let lastErr: unknown = err;
          for await (const target of alternateTargets()) {
            if (controller.signal.aborted) break;
            try {
              activeProvider = target.provider;
              activeModel = target.model;
              resolved = await getProviderAdapter(target.provider).generate({
                model: target.model,
                system,
                input,
                signal: controller.signal,
                apiKey: target.apiKey,
              });
              break;
            } catch (nextErr) {
              lastErr = nextErr;
              if (!isRetryableError(nextErr)) throw nextErr;
            }
          }
          if (!resolved) throw lastErr;
          result = resolved;
        }

        if (!isByok) {
          await recordGlobalSpend({
            provider: activeProvider,
            model: activeModel,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          });
        }

        console.info(
          JSON.stringify({
            event: 'ai_generate',
            userId,
            provider: activeProvider,
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
          let firstTokenArrived = false;
          let stalled = false;
          let firstTokenTimer: ReturnType<typeof setTimeout> | undefined;
          const attemptController = new AbortController();
          const onToken = (token: string) => {
            if (!firstTokenArrived && token) {
              firstTokenArrived = true;
              if (firstTokenTimer) clearTimeout(firstTokenTimer);
            }
            sendEvent('token', { text: token });
          };

          const hasBackupPath = model !== fallbackModelId || !isByok;
          const attemptSignal = hasBackupPath ? AbortSignal.any([controller.signal, attemptController.signal]) : controller.signal;
          if (hasBackupPath) {
            firstTokenTimer = setTimeout(() => {
              if (!firstTokenArrived) {
                stalled = true;
                attemptController.abort(new Error('FIRST_TOKEN_TIMEOUT'));
              }
            }, FIRST_TOKEN_FALLBACK_MS);
          }

          try {
            usage = await getProviderAdapter(provider).stream({ model, system, input, signal: attemptSignal, apiKey }, { onToken });
          } catch (err) {
            if (firstTokenTimer) clearTimeout(firstTokenTimer);
            const canRecover = !firstTokenArrived && !controller.signal.aborted && (stalled || isRetryableError(err));
            if (!canRecover) throw err;

            let streamedUsage: TokenUsage | undefined;
            let lastErr: unknown = err;
            for await (const target of alternateTargets()) {
              if (controller.signal.aborted || firstTokenArrived) break;
              try {
                activeProvider = target.provider;
                activeModel = target.model;
                streamedUsage = await getProviderAdapter(target.provider).stream(
                  { model: target.model, system, input, signal: controller.signal, apiKey: target.apiKey },
                  { onToken },
                );
                break;
              } catch (nextErr) {
                lastErr = nextErr;
                if (firstTokenArrived || !isRetryableError(nextErr)) throw nextErr;
              }
            }
            if (!streamedUsage) throw lastErr;
            usage = streamedUsage;
          } finally {
            if (firstTokenTimer) clearTimeout(firstTokenTimer);
          }

          if (!isByok) {
            await recordGlobalSpend({
              provider: activeProvider,
              model: activeModel,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
            });
          }

          console.info(
            JSON.stringify({
              event: 'ai_generate_stream',
              userId,
              provider: activeProvider,
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
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
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
