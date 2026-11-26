import {
  AiProxyError,
  mapProviderHttpError,
  type GenerateParams,
  type GenerateResult,
  type ProviderAdapter,
  type StreamCallbacks,
  type TokenUsage,
} from './types';

const BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',

  async generate({ model, system, input, signal, apiKey }: GenerateParams): Promise<GenerateResult> {
    const resp = await fetch(`${BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        system,
        max_tokens: 4096,
        temperature: 0.2,
        messages: [{ role: 'user', content: input }],
      }),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw mapProviderHttpError(resp.status, errText);
    }

    const data = (await resp.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
    return {
      text,
      usage: {
        inputTokens: data.usage?.input_tokens ?? Math.ceil(input.length / 4),
        outputTokens: data.usage?.output_tokens ?? 0,
      },
    };
  },

  async stream({ model, system, input, signal, apiKey }: GenerateParams, callbacks: StreamCallbacks): Promise<TokenUsage> {
    const resp = await fetch(`${BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        system,
        max_tokens: 4096,
        temperature: 0.2,
        stream: true,
        messages: [{ role: 'user', content: input }],
      }),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw mapProviderHttpError(resp.status, errText);
    }
    if (!resp.body) {
      throw new AiProxyError('PROVIDER_ERROR', 'Stream respons Anthropic kosong.', 502);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const usage: TokenUsage = { inputTokens: Math.ceil(input.length / 4), outputTokens: 0 };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as {
            type?: string;
            delta?: { type?: string; text?: string };
            message?: { usage?: { input_tokens?: number } };
            usage?: { output_tokens?: number };
          };
          if (parsed.type === 'message_start' && parsed.message?.usage?.input_tokens !== undefined) {
            usage.inputTokens = parsed.message.usage.input_tokens;
          } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            callbacks.onToken(parsed.delta.text);
          } else if (parsed.type === 'message_delta' && parsed.usage?.output_tokens !== undefined) {
            usage.outputTokens = parsed.usage.output_tokens;
          }
        } catch {
          // ignore malformed SSE chunk
        }
      }
    }

    callbacks.onUsage?.(usage);
    return usage;
  },

  async listModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
    const resp = await fetch(`${BASE_URL}/models`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': ANTHROPIC_VERSION,
      },
      signal,
    });
    if (!resp.ok) {
      throw new Error(`Anthropic ListModels error (${resp.status})`);
    }
    const data = (await resp.json()) as {
      data?: Array<{ id?: string; lifecycle?: string }>;
    };
    return (data.data ?? [])
      .filter((m) => Boolean(m.id) && (m.lifecycle === undefined || m.lifecycle === 'active'))
      .map((m) => m.id!)
      .filter(Boolean);
  },
};
