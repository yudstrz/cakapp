import { AiProxyError, mapProviderHttpError } from './providers/types';
import { getVerifiedModelsForProvider, pickDefaultVerifiedModel, type CacheStore } from './models';

export type SttProviderId = 'gemini' | 'openai';

export interface TranscribeChunkParams {
  provider: SttProviderId;
  audioBytes: Buffer;
  mimeType: string;
  fileName: string;
  language?: string;
  prompt?: string;
  apiKey: string;
  isByok?: boolean;
  cache?: CacheStore;
  signal: AbortSignal;
}

export interface TranscribeChunkResult {
  text: string;
  model: string;
  estimatedCostUsd: number;
  inputTokens?: number;
  outputTokens?: number;
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/ogg',
  'audio/webm',
]);

export function normalizeAudioMime(rawMime: string, fileName: string): string {
  const clean = rawMime.split(';')[0]?.trim().toLowerCase() || '';
  if (ALLOWED_AUDIO_MIMES.has(clean)) {
    if (clean === 'audio/x-wav' || clean === 'audio/wave') return 'audio/wav';
    if (clean === 'audio/mp3') return 'audio/mpeg';
    if (clean === 'audio/x-m4a' || clean === 'audio/m4a') return 'audio/mp4';
    return clean;
  }
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.wav')) return 'audio/wav';
  if (lowerName.endsWith('.mp3')) return 'audio/mpeg';
  if (lowerName.endsWith('.m4a') || lowerName.endsWith('.mp4')) return 'audio/mp4';
  if (lowerName.endsWith('.ogg') || lowerName.endsWith('.opus')) return 'audio/ogg';
  if (lowerName.endsWith('.webm')) return 'audio/webm';
  throw new AiProxyError('INVALID_INPUT', 'Format file audio tidak didukung (gunakan WAV, MP3, M4A, OGG, atau WebM).', 400);
}

/** Estimate audio minutes from 16kHz 16-bit mono WAV header or compressed bitrate heuristic. */
export function estimateAudioMinutes(buf: Buffer, mimeType: string): number {
  if (mimeType === 'audio/wav' && buf.length > 44 && buf.toString('ascii', 0, 4) === 'RIFF') {
    const byteRate = buf.readUInt32LE(28);
    if (byteRate > 0) {
      return Math.max(0.05, (buf.length - 44) / byteRate / 60);
    }
  }
  // Compressed audio ~16 KB/s conservative estimate
  return Math.max(0.05, buf.length / 16_000 / 60);
}

export async function transcribeAudioChunk(params: TranscribeChunkParams): Promise<TranscribeChunkResult> {
  const mimeType = normalizeAudioMime(params.mimeType, params.fileName);

  if (params.provider === 'gemini') {
    const { models } = await getVerifiedModelsForProvider('gemini', {
      cache: params.cache,
      byokKey: params.isByok ? params.apiKey : undefined,
    });
    const model = pickDefaultVerifiedModel(models, 'gemini');
    const langHint =
      params.language && params.language !== 'auto'
        ? ` Bahasa utama ucapan: ${params.language}.`
        : ' Deteksi bahasa ucapan secara otomatis (Indonesia/Inggris/lainnya).';
    const vocabHint = params.prompt ? ` Istilah/nama terkait: ${params.prompt.slice(0, 300)}.` : '';

    const resp = await fetch(`${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': params.apiKey.trim(),
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: `Anda adalah mesin speech-to-text presisi tinggi. Transkripsikan hanya kata-kata yang diucapkan dalam rekaman audio berikut secara akurat tanpa komentar tambahan, tanpa label pembicara buatan, dan tanpa format markdown. Jika rekaman hening atau tidak ada ucapan manusia yang jelas, balas dengan string kosong saja.${langHint}${vocabHint}`,
            },
          ],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: params.audioBytes.toString('base64'),
                },
              },
              { text: 'Transkripsikan audio ini.' },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      }),
      signal: params.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw mapProviderHttpError(resp.status, errText);
    }

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
    const inputTokens = data.usageMetadata?.promptTokenCount ?? Math.ceil(params.audioBytes.length / 600);
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4);
    // Checked 2026-11-26 at ai.google.dev: Gemini 3.5 Flash-Lite audio input $0.30/1M, output $2.50/1M
    const estimatedCostUsd = (inputTokens / 1_000_000) * 0.3 + (outputTokens / 1_000_000) * 2.5;

    return { text, model, estimatedCostUsd, inputTokens, outputTokens };
  }

  // OpenAI Speech-to-Text (/v1/audio/transcriptions): gpt-4o-mini-transcribe ($0.003/min) -> fallback whisper-1 ($0.006/min)
  const callOpenAiStt = async (modelId: string): Promise<string> => {
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(params.audioBytes)], { type: mimeType }), params.fileName || 'chunk.wav');
    form.set('model', modelId);
    form.set('response_format', 'json');
    if (params.language && params.language !== 'auto') {
      form.set('language', params.language.slice(0, 8));
    }
    if (params.prompt) {
      form.set('prompt', params.prompt.slice(0, 300));
    }

    const resp = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey.trim()}`,
      },
      body: form,
      signal: params.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw mapProviderHttpError(resp.status, errText);
    }

    const data = (await resp.json()) as { text?: string };
    return (data.text ?? '').trim();
  };

  let usedModel = 'gpt-4o-mini-transcribe';
  let text = '';
  try {
    text = await callOpenAiStt(usedModel);
  } catch (err) {
    if (err instanceof AiProxyError && err.code === 'MODEL_UNAVAILABLE') {
      usedModel = 'whisper-1';
      text = await callOpenAiStt(usedModel);
    } else {
      throw err;
    }
  }

  const minutes = estimateAudioMinutes(params.audioBytes, mimeType);
  const ratePerMin = usedModel === 'whisper-1' ? 0.006 : 0.003;
  return {
    text,
    model: usedModel,
    estimatedCostUsd: minutes * ratePerMin,
  };
}
