import {
  AiProxyError,
  mapProviderHttpError,
  type GenerateParams,
  type GenerateResult,
  type ProviderAdapter,
  type StreamCallbacks,
  type TokenUsage,
} from './types';

const BASE_URL = 'https://api.openai.com/v1';

export const openaiAdapter: ProviderAdapter = {
  id: 'openai',

  async generate({ model, system, input, signal, apiKey }: GenerateParams): Promise<GenerateResult> {
    const resp = await fetch(`${BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        instructions: system,
        input,
        temperature: 0.2,
      }),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw mapProviderHttpError(resp.status, errText);
    }

    const data = (await resp.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text =
      data.output_text ??
      data.output?.flatMap((o) => o.content ?? []).find((c) => c.type === 'output_text')?.text ??
      '';

    return {
      text,
      usage: {
        inputTokens: data.usage?.input_tokens ?? Math.ceil(input.length / 4),
        outputTokens: data.usage?.output_tokens ?? 0,
      },
    };
  },

  async stream({ model, system, input, signal, apiKey }: GenerateParams, callbacks: StreamCallbacks): Promise<TokenUsage> {
    const resp = await fetch(`${BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        instructions: system,
        input,
        temperature: 0.2,
        stream: true,
      }),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw mapProviderHttpError(resp.status, errText);
    }
    if (!resp.body) {
      throw new AiProxyError('PROVIDER_ERROR', 'Stream respons OpenAI kosong.', 502);
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
            delta?: string;
            response?: { usage?: { input_tokens?: number; output_tokens?: number } };
          };
          if (parsed.type === 'response.output_text.delta' && parsed.delta) {
            callbacks.onToken(parsed.delta);
          }
          if (parsed.type === 'response.completed' && parsed.response?.usage) {
            usage.inputTokens = parsed.response.usage.input_tokens ?? usage.inputTokens;
            usage.outputTokens = parsed.response.usage.output_tokens ?? usage.outputTokens;
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
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal,
    });
    if (!resp.ok) {
      throw new Error(`OpenAI ListModels error (${resp.status})`);
    }
    const now = Date.now();
    const data = (await resp.json()) as {
      data?: Array<{ id?: string; shutdown_date?: string | null }>;
    };
    return (data.data ?? [])
      .filter((m) => {
        if (!m.id) return false;
        if (m.shutdown_date) {
          const ts = Date.parse(m.shutdown_date);
          if (!Number.isNaN(ts) && ts <= now) return false;
        }
        return true;
      })
      .map((m) => m.id!)
      .filter(Boolean);
  },
};
