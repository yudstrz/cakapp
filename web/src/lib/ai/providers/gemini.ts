import {
  AiProxyError,
  mapProviderHttpError,
  type GenerateParams,
  type GenerateResult,
  type ProviderAdapter,
  type StreamCallbacks,
  type TokenUsage,
} from './types';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export const geminiAdapter: ProviderAdapter = {
  id: 'gemini',

  async generate({ model, system, input, signal, apiKey }: GenerateParams): Promise<GenerateResult> {
    const resp = await fetch(`${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw mapProviderHttpError(resp.status, errText);
    }

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    return {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? Math.ceil(input.length / 4),
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  },

  async stream({ model, system, input, signal, apiKey }: GenerateParams, callbacks: StreamCallbacks): Promise<TokenUsage> {
    const resp = await fetch(`${BASE_URL}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw mapProviderHttpError(resp.status, errText);
    }
    if (!resp.body) {
      throw new AiProxyError('PROVIDER_ERROR', 'Stream respons Gemini kosong.', 502);
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
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          };
          const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (chunk) callbacks.onToken(chunk);
          if (parsed.usageMetadata?.promptTokenCount !== undefined) {
            usage.inputTokens = parsed.usageMetadata.promptTokenCount;
          }
          if (parsed.usageMetadata?.candidatesTokenCount !== undefined) {
            usage.outputTokens = parsed.usageMetadata.candidatesTokenCount;
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
    const resp = await fetch(`${BASE_URL}/models?pageSize=100`, {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey.trim() },
      signal,
    });
    if (!resp.ok) {
      throw new Error(`Gemini ListModels error (${resp.status})`);
    }
    const data = (await resp.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    return (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean);
  },
};
