'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { transcribeAudioFileInChunks, type WebSttProviderId } from '@/lib/ai/audio-chunk-client';
import { generateCloudMapReduce, reconcileSelectedModel, type VerifiedClientModel } from '@/lib/ai/chunk-client';
import { buildWebByokHeaders } from '@/lib/ai/byok-client';
import { uploadAudioChunksToCloud } from '@/lib/audio-upload-client';
import { WEB_AI_PREF_KEY, type WebAiPreferences } from './CloudAiMeetingSection';

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function WebAudioStudioCard() {
  const router = useRouter();
  const [sttProvider, setSttProvider] = useState<WebSttProviderId>('gemini');
  const [saveAudioToCloud, setSaveAudioToCloud] = useState(true);
  const [quotaLabel, setQuotaLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WEB_AI_PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WebAiPreferences;
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

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const updateProviderPref = (nextProv: WebSttProviderId) => {
    setSttProvider(nextProv);
    try {
      const prev = JSON.parse(window.localStorage.getItem(WEB_AI_PREF_KEY) || '{}') as WebAiPreferences;
      window.localStorage.setItem(WEB_AI_PREF_KEY, JSON.stringify({ ...prev, sttProvider: nextProv }));
    } catch {
      // Ignore storage write error.
    }
  };

  async function processAudioBlob(audioFile: File, titleBase: string) {
    setBusy(true);
    setError('');
    setProgress('Menyiapkan ruang rapat baru...');

    try {
      const createRes = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleBase.slice(0, 100) || 'Rekaman Audio Web', language: 'id' }),
      });
      if (!createRes.ok) {
        throw new Error('Gagal membuat sesi rapat baru.');
      }
      const { id: meetingId } = (await createRes.json()) as { id: string };

      if (saveAudioToCloud) {
        await uploadAudioChunksToCloud({
          meetingId,
          audio: audioFile,
          mimeType: audioFile.type,
          onProgress: (cur, tot) => setProgress(`Menyimpan rekaman audio (${cur}/${tot})...`),
        });
      }

      const sttRes = await transcribeAudioFileInChunks({
        file: audioFile,
        provider: sttProvider,
        headers: buildWebByokHeaders(sttProvider),
        onProgress: (cur, tot) => setProgress(`Mengubah suara ke teks (${cur}/${tot})...`),
      });

      if (sttRes.segments.length === 0) {
        throw new Error('Tidak ada ucapan yang terdeteksi pada rekaman suara.');
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
  }

  const handleUploadNewMeeting = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processAudioBlob(file, file.name.replace(/\.[^.]+$/, ''));
  };

  async function startMicRecording() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Browser ini tidak mendukung perekaman mikrofon langsung.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType.split(';')[0] });
        const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
        const stamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const file = new File([blob], `rapat-tatap-muka.${ext}`, { type: blob.type });
        setRecording(false);
        setPaused(false);
        setElapsedSec(0);
        void processAudioBlob(file, `Rapat Tatap Muka (${stamp})`);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setPaused(false);
      setElapsedSec(0);
      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } catch {
      setError('Izin mikrofon ditolak atau perangkat audio tidak tersedia.');
    }
  }

  function togglePauseMic() {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      setPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    } else if (rec.state === 'paused') {
      rec.resume();
      setPaused(false);
      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    }
  }

  function stopMicRecording() {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
  }

  return (
    <div className="mb-8 rounded-2xl border border-line bg-card p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm sm:text-base font-semibold text-ink">
            Perekam Mikrofon Browser & Unggah Audio
          </h2>
          <p className="mt-0.5 text-xs text-written">
            {quotaLabel
              ? `${quotaLabel} · Rekam suara dari mikrofon perangkat ini atau unggah audio ke Cloud AI.`
              : 'Rekam rapat tatap muka lewat mikrofon perangkat ini atau unggah file rekaman ke Cloud AI (untuk Zoom/Teams desktop otomatis gunakan Cakapp Desktop).'}
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-line">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-written">
            <span>Provider Cloud Speech-to-Text:</span>
            {(['gemini', 'openai'] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={busy || recording}
                onClick={() => updateProviderPref(p)}
                className={`min-h-[44px] sm:min-h-[32px] rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  sttProvider === p
                    ? 'bg-ink text-paper'
                    : 'border border-control bg-float text-ink hover:bg-chrome'
                }`}
              >
                {p === 'gemini' ? 'Google Gemini' : 'OpenAI'}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-written cursor-pointer py-1">
            <input
              type="checkbox"
              checked={saveAudioToCloud}
              disabled={busy || recording}
              onChange={(e) => setSaveAudioToCloud(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>Simpan rekaman audio ke Cloud Storage agar bisa diputar di browser & link berbagi</span>
          </label>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {!recording ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void startMicRecording()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-ink hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Rekam Suara Langsung
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-float px-3 py-2 font-mono text-xs font-semibold text-ink">
                <span className={`h-2 w-2 rounded-full ${paused ? 'bg-amber-500' : 'bg-red-600'}`} />
                {formatTimer(elapsedSec)}
              </span>
              <button
                type="button"
                onClick={togglePauseMic}
                className="min-h-[44px] rounded-xl border border-control bg-float px-3 py-2 text-xs font-semibold text-ink hover:bg-chrome"
              >
                {paused ? 'Lanjutkan' : 'Jeda'}
              </button>
              <button
                type="button"
                onClick={stopMicRecording}
                className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-ink hover:opacity-90"
              >
                Selesai & Simpan
              </button>
            </div>
          )}

          <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-control bg-float px-4 py-2 text-xs font-semibold text-ink hover:bg-chrome transition-colors">
            <span>{busy ? progress || 'Memproses Suara...' : 'Unggah File Suara (.mp3 / .wav)'}</span>
            <input
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
              disabled={busy || recording}
              onChange={(e) => void handleUploadNewMeeting(e)}
              className="sr-only"
            />
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-accent font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
