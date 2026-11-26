'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { transcribeAudioFileInChunks, type WebSttProviderId } from '@/lib/ai/audio-chunk-client';
import { generateCloudMapReduce, reconcileSelectedModel, type VerifiedClientModel } from '@/lib/ai/chunk-client';
import { buildWebByokHeaders } from '@/lib/ai/byok-client';
import { WEB_AI_PREF_KEY, type WebAiPreferences } from './CloudAiMeetingSection';

export default function WebAudioStudioCard() {
  const router = useRouter();
  const [sttMode, setSttMode] = useState<'local' | 'cloud'>('local');
  const [sttProvider, setSttProvider] = useState<WebSttProviderId>('gemini');
  const [quotaLabel, setQuotaLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WEB_AI_PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WebAiPreferences;
        if (parsed.sttMode === 'local' || parsed.sttMode === 'cloud') setSttMode(parsed.sttMode);
        if (parsed.sttProvider === 'gemini' || parsed.sttProvider === 'openai') setSttProvider(parsed.sttProvider);
      }
    } catch {
      // Ignore corrupt storage.
    }

    void fetch('/api/ai/usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((u: { remainingRequests?: number; limitRequests?: number; remainingSttChunks?: number; limitSttChunks?: number } | null) => {
        if (u && u.remainingRequests !== undefined) {
          setQuotaLabel(
            `Sisa kuota hari ini: ${u.remainingRequests}/${u.limitRequests} notulen · ${u.remainingSttChunks ?? 0}/${u.limitSttChunks ?? 180} potongan suara`,
          );
        }
      })
      .catch(() => {});
  }, []);

  const updatePref = (nextMode: 'local' | 'cloud', nextProv: WebSttProviderId) => {
    setSttMode(nextMode);
    setSttProvider(nextProv);
    try {
      const prev = JSON.parse(window.localStorage.getItem(WEB_AI_PREF_KEY) || '{}') as WebAiPreferences;
      window.localStorage.setItem(WEB_AI_PREF_KEY, JSON.stringify({ ...prev, sttMode: nextMode, sttProvider: nextProv }));
    } catch {
      // Ignore storage write error.
    }
  };

  const handleUploadNewMeeting = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    setError('');
    setProgress('Menyiapkan ruang rapat baru...');

    try {
      const cleanTitle = file.name.replace(/\.[^.]+$/, '').slice(0, 100) || 'Rekaman Audio Web';
      const createRes = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: cleanTitle, language: 'id' }),
      });
      if (!createRes.ok) {
        throw new Error('Gagal membuat sesi rapat baru.');
      }
      const { id: meetingId } = (await createRes.json()) as { id: string };

      const sttRes = await transcribeAudioFileInChunks({
        file,
        provider: sttProvider,
        headers: buildWebByokHeaders(sttProvider),
        onProgress: (cur, tot) => setProgress(`Mengubah suara ke teks (${cur}/${tot})...`),
      });

      if (sttRes.segments.length === 0) {
        throw new Error('Tidak ada ucapan yang terdeteksi pada file audio.');
      }

      await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/transcripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: sttRes.segments,
          replace: true,
          durationMs: sttRes.durationMs,
        }),
      });

      setProgress('Menyusun notulen rapat...');
      const modelsRes = await fetch('/api/ai/models', { headers: buildWebByokHeaders(sttProvider) });
      if (modelsRes.ok) {
        const modelsData = (await modelsRes.json()) as { models?: Record<string, VerifiedClientModel[]> };
        const modelId = reconcileSelectedModel('', modelsData.models?.[sttProvider] ?? []);
        if (modelId) {
          const notesGen = await generateCloudMapReduce({
            provider: sttProvider,
            model: modelId,
            task: 'notulen',
            input: sttRes.fullText,
            headers: buildWebByokHeaders(sttProvider),
          });
          await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enhanced: notesGen.text }),
          });
        }
      }

      router.push(`/dashboard/meetings/${meetingId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses rekaman audio.');
      setProgress('');
      setBusy(false);
    }
  };

  return (
    <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            Pengaturan Default Transkripsi & Unggah Rekaman Suara
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            {quotaLabel || 'Pilih default mesin Speech-to-Text atau unggah file audio untuk dibuatkan transkrip dan notulen.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => updatePref('local', sttProvider)}
            className={`min-h-[34px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              sttMode === 'local'
                ? 'bg-zinc-100 text-zinc-950'
                : 'border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            Default: Whisper Lokal (PC)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => updatePref('cloud', sttProvider)}
            className={`min-h-[34px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              sttMode === 'cloud'
                ? 'bg-zinc-100 text-zinc-950'
                : 'border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            Default: Cloud AI (Server)
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
          <span>Provider Cloud Speech-to-Text:</span>
          {(['gemini', 'openai'] as const).map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy}
              onClick={() => updatePref(sttMode, p)}
              className={`min-h-[32px] rounded-md px-2.5 py-1 text-xs font-medium ${
                sttProvider === p
                  ? 'bg-zinc-200 text-zinc-950'
                  : 'border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {p === 'gemini' ? 'Google Gemini' : 'OpenAI'}
            </button>
          ))}
        </div>

        <label className="inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-white transition-colors">
          <span>{busy ? progress || 'Memproses Suara...' : 'Unggah File Suara (.mp3 / .wav / .m4a)'}</span>
          <input
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
            disabled={busy}
            onChange={(e) => void handleUploadNewMeeting(e)}
            className="sr-only"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="text-xs text-amber-300">
          {error}
        </p>
      )}
    </div>
  );
}
