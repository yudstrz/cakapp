export const MAX_CLOUD_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB safety cap per meeting
export const MAX_AUDIO_UPLOAD_CHUNK_BYTES = 1_500_000; // 1.5 MB per HTTP request (< 4.5 MB Vercel limit)

/**
 * Split a Blob/File into <= 1.5 MB chunks and upload sequentially to /api/meetings/[id]/audio
 * so uploads stay comfortably under Vercel's 4.5 MB payload limit.
 */
export async function uploadAudioChunksToCloud(params: {
  meetingId: string;
  audio: Blob;
  mimeType?: string;
  onProgress?: (part: number, total: number) => void;
}): Promise<string> {
  if (params.audio.size === 0) {
    throw new Error('File audio kosong.');
  }
  if (params.audio.size > MAX_CLOUD_AUDIO_BYTES) {
    throw new Error('Ukuran rekaman audio melebihi batas cloud 25 MB per rapat.');
  }

  const mimeType = (params.mimeType || params.audio.type || 'audio/webm').split(';')[0];
  const chunkSize = MAX_AUDIO_UPLOAD_CHUNK_BYTES;
  const totalChunks = Math.max(1, Math.ceil(params.audio.size / chunkSize));
  let finalUrl = `/api/meetings/${encodeURIComponent(params.meetingId)}/audio`;

  for (let i = 0; i < totalChunks; i++) {
    params.onProgress?.(i + 1, totalChunks);
    const slice = params.audio.slice(i * chunkSize, (i + 1) * chunkSize, mimeType);
    const form = new FormData();
    form.set('file', slice, `audio-part-${i}.bin`);
    form.set('chunkIndex', String(i));
    form.set('totalBytes', String(params.audio.size));
    form.set('mimeType', mimeType);
    form.set('finalize', String(i === totalChunks - 1));

    const resp = await fetch(`/api/meetings/${encodeURIComponent(params.meetingId)}/audio`, {
      method: 'POST',
      body: form,
    });

    if (!resp.ok) {
      const errBody = (await resp.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(errBody?.error?.message || `Gagal mengunggah audio ke cloud (${resp.status}).`);
    }

    const json = (await resp.json().catch(() => null)) as { audioUrl?: string } | null;
    if (json?.audioUrl) finalUrl = json.audioUrl;
  }

  return finalUrl;
}
