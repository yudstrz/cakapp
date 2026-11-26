export type ClientAiProviderId = 'gemini' | 'openai' | 'anthropic';
export type ClientAiTask = 'notulen' | 'ringkasan';

export interface VerifiedClientModel {
  id: string;
  label: string;
  tier: 'hemat' | 'standar' | 'premium';
  default?: boolean;
  provider: ClientAiProviderId;
}

export const CHUNK_MAX_CHARS = 24_000;
const REDUCE_MAX_CHARS = 90_000;

/**
 * Split a long transcript along line/sentence boundaries so each request stays small and fast
 * under Vercel's function duration and body size limits.
 */
export function splitTranscriptIntoChunks(text: string, maxChars = CHUNK_MAX_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  const lines = trimmed.split('\n');
  let current = '';

  const pushOversizedLine = (line: string) => {
    let cursor = 0;
    while (cursor < line.length) {
      let end = Math.min(cursor + maxChars, line.length);
      if (end < line.length) {
        const breakAt = line.lastIndexOf(' ', end);
        if (breakAt > cursor + Math.floor(maxChars * 0.5)) {
          end = breakAt;
        }
      }
      chunks.push(line.slice(cursor, end).trim());
      cursor = end;
    }
  };

  for (const line of lines) {
    if (line.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      pushOversizedLine(line);
      continue;
    }
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxChars && current) {
      chunks.push(current.trim());
      current = line;
    } else {
      current = next;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

export function reconcileSelectedModel(
  savedModel: string | undefined,
  verified: VerifiedClientModel[],
): string {
  if (verified.length === 0) return '';
  if (savedModel && verified.some((m) => m.id === savedModel)) {
    return savedModel;
  }
  return verified.find((m) => m.default)?.id ?? verified[0].id;
}

export class CloudAiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 500,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'CloudAiClientError';
  }
}

export async function callCloudGenerateSingle(params: {
  baseUrl?: string;
  provider: ClientAiProviderId;
  model: string;
  task: ClientAiTask;
  input: string;
  stream?: boolean;
  headers?: Record<string, string>;
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<{ text: string; model: string }> {
  const endpoint = `${(params.baseUrl ?? '').replace(/\/+$/, '')}/api/ai/generate`;
  const stream = params.stream ?? true;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.headers ?? {}),
    },
    body: JSON.stringify({
      provider: params.provider,
      model: params.model,
      task: params.task,
      input: params.input,
      stream,
    }),
    signal: params.signal,
  });

  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as {
      error?: { code?: string; message?: string; retryAfter?: number };
    } | null;
    throw new CloudAiClientError(
      body?.error?.code || 'PROVIDER_ERROR',
      body?.error?.message || `Permintaan AI gagal (${resp.status}).`,
      resp.status,
      body?.error?.retryAfter,
    );
  }

  if (!stream) {
    const data = (await resp.json()) as { text?: string; model?: string };
    const text = data.text ?? '';
    if (text && params.onToken) params.onToken(text);
    return { text, model: data.model ?? params.model };
  }

  if (!resp.body) {
    throw new CloudAiClientError('PROVIDER_ERROR', 'Stream respons AI kosong.', 502);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let activeModel = params.model;
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        currentEvent = '';
        continue;
      }
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith('data:')) continue;
      const payloadStr = line.slice(5).trim();
      if (!payloadStr) continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(payloadStr) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (currentEvent === 'token' && typeof parsed.text === 'string') {
        fullText += parsed.text;
        params.onToken?.(parsed.text);
      } else if (currentEvent === 'done' && typeof parsed.model === 'string') {
        activeModel = parsed.model;
      } else if (currentEvent === 'error') {
        throw new CloudAiClientError(
          typeof parsed.code === 'string' ? parsed.code : 'PROVIDER_ERROR',
          typeof parsed.message === 'string' ? parsed.message : 'Streaming AI gagal.',
          502,
          typeof parsed.retryAfter === 'number' ? parsed.retryAfter : undefined,
        );
      }
    }
  }

  return { text: fullText, model: activeModel };
}

/**
 * Map-reduce client chunking: summarize each chunk first when input exceeds maxChunkChars,
 * then synthesize final notes/summary in a single streamed call.
 */
export async function generateCloudMapReduce(params: {
  baseUrl?: string;
  provider: ClientAiProviderId;
  model: string;
  task: ClientAiTask;
  input: string;
  maxChunkChars?: number;
  headers?: Record<string, string>;
  onToken?: (chunk: string) => void;
  onPartProgress?: (part: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<{ text: string; model: string }> {
  const chunks = splitTranscriptIntoChunks(params.input, params.maxChunkChars ?? CHUNK_MAX_CHARS);
  if (chunks.length === 0) {
    throw new CloudAiClientError('INVALID_INPUT', 'Teks transkrip kosong.', 400);
  }

  if (chunks.length === 1) {
    return callCloudGenerateSingle({
      baseUrl: params.baseUrl,
      provider: params.provider,
      model: params.model,
      task: params.task,
      input: chunks[0],
      stream: true,
      headers: params.headers,
      onToken: params.onToken,
      signal: params.signal,
    });
  }

  const partSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    params.signal?.throwIfAborted();
    params.onPartProgress?.(i + 1, chunks.length);
    const partRes = await callCloudGenerateSingle({
      baseUrl: params.baseUrl,
      provider: params.provider,
      model: params.model,
      task: 'ringkasan',
      input: `Bagian ${i + 1} dari ${chunks.length}:\n${chunks[i]}`,
      stream: false,
      headers: params.headers,
      signal: params.signal,
    });
    partSummaries.push(`### Ringkasan Bagian ${i + 1}\n${partRes.text.trim()}`);
  }

  const combined = partSummaries.join('\n\n').slice(0, REDUCE_MAX_CHARS);
  return callCloudGenerateSingle({
    baseUrl: params.baseUrl,
    provider: params.provider,
    model: params.model,
    task: params.task,
    input: combined,
    stream: true,
    headers: params.headers,
    onToken: params.onToken,
    signal: params.signal,
  });
}
