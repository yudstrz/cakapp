import { CloudAiClientError } from './chunk-client';

export type WebSttProviderId = 'gemini' | 'openai';

export interface TranscribedSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker: string;
}

const SAMPLE_RATE = 16_000;
const CHUNK_SECONDS = 20;

export function encodeMonoWav16k(samples: Float32Array): Blob {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true);
  }

  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * Decode an audio file in the browser using native Web Audio API, resample to 16 kHz mono,
 * and slice into 20-second WAV chunks (~640 KB each) so every request stays well below Vercel's 4.5 MB cap.
 */
export async function transcribeAudioFileInChunks(params: {
  file: File;
  provider: WebSttProviderId;
  language?: string;
  headers?: Record<string, string>;
  onProgress?: (current: number, total: number) => void;
}): Promise<{ segments: TranscribedSegment[]; durationMs: number; fullText: string }> {
  const rawBuffer = await params.file.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(rawBuffer.slice(0));
  } finally {
    await ctx.close().catch(() => {});
  }

  const totalFrames = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, totalFrames, SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const pcm = rendered.getChannelData(0);

  const chunkSamples = CHUNK_SECONDS * SAMPLE_RATE;
  const totalChunks = Math.max(1, Math.ceil(pcm.length / chunkSamples));
  const segments: TranscribedSegment[] = [];

  for (let i = 0; i < totalChunks; i++) {
    params.onProgress?.(i + 1, totalChunks);
    const startSample = i * chunkSamples;
    const endSample = Math.min(pcm.length, startSample + chunkSamples);
    const slice = pcm.subarray(startSample, endSample);
    const wavBlob = encodeMonoWav16k(slice);

    const form = new FormData();
    form.set('file', wavBlob, `part-${i + 1}.wav`);
    form.set('provider', params.provider);
    if (params.language) {
      form.set('language', params.language);
    }

    const resp = await fetch('/api/ai/transcribe', {
      method: 'POST',
      headers: params.headers,
      body: form,
    });

    if (!resp.ok) {
      const errBody = (await resp.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      throw new CloudAiClientError(
        errBody?.error?.code || 'PROVIDER_ERROR',
        errBody?.error?.message || `Transkripsi gagal pada bagian ${i + 1} (${resp.status}).`,
        resp.status,
      );
    }

    const data = (await resp.json()) as { text?: string };
    const text = (data.text ?? '').trim();
    if (text) {
      segments.push({
        startMs: Math.round((startSample / SAMPLE_RATE) * 1000),
        endMs: Math.round((endSample / SAMPLE_RATE) * 1000),
        text,
        speaker: 'Audio',
      });
    }
  }

  return {
    segments,
    durationMs: Math.round(decoded.duration * 1000),
    fullText: segments.map((s) => `${s.speaker}: ${s.text}`).join('\n'),
  };
}
