'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MeetingNotesView from './MeetingNotesView';
import {
  CloudAiClientError,
  generateCloudMapReduce,
  reconcileSelectedModel,
  type ClientAiProviderId,
  type ClientAiTask,
  type VerifiedClientModel,
} from '@/lib/ai/chunk-client';
import {
  transcribeAudioFileInChunks,
  type WebSttProviderId,
} from '@/lib/ai/audio-chunk-client';
import {
  buildWebByokHeaders,
  clearWebByokKey,
  getWebByokKey,
  setWebByokKey,
} from '@/lib/ai/byok-client';

interface TranscriptItem {
  speaker?: string | null;
  track?: string | null;
  text: string;
}

interface UsageData {
  remainingRequests: number;
  limitRequests: number;
  remainingInputTokens: number;
  limitInputTokens: number;
  remainingSttChunks?: number;
  limitSttChunks?: number;
}

const PROVIDER_LABELS: Record<ClientAiProviderId, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
};

export const WEB_AI_PREF_KEY = 'cakapp:web-ai-pref';

export interface WebAiPreferences {
  defaultMode?: 'local' | 'cloud';
  sttMode?: 'local' | 'cloud';
  sttProvider?: WebSttProviderId;
  provider?: ClientAiProviderId;
  models?: Partial<Record<ClientAiProviderId, string>>;
}

export default function CloudAiMeetingSection({
  meetingId,
  initialContent,
  transcripts,
  readOnly = false,
}: {
  meetingId: string;
  initialContent: string;
  transcripts: TranscriptItem[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [localTranscripts, setLocalTranscripts] = useState<TranscriptItem[]>(transcripts);
  const [provider, setProvider] = useState<ClientAiProviderId>('gemini');
  const [sttProvider, setSttProvider] = useState<WebSttProviderId>('gemini');
  const [selectedModels, setSelectedModels] = useState<Partial<Record<ClientAiProviderId, string>>>({});
  const [modelsByProvider, setModelsByProvider] = useState<Record<ClientAiProviderId, VerifiedClientModel[]>>({
    gemini: [],
    openai: [],
    anthropic: [],
  });
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(!readOnly);
  const [busyTask, setBusyTask] = useState<ClientAiTask | 'health' | 'stt' | null>(null);
  const [partInfo, setPartInfo] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [byokInput, setByokInput] = useState('');
  const [hasByok, setHasByok] = useState(false);

  useEffect(() => {
    setLocalTranscripts(transcripts);
  }, [transcripts]);

  const savePrefs = (patch: Partial<WebAiPreferences>) => {
    try {
      const prev = JSON.parse(window.localStorage.getItem(WEB_AI_PREF_KEY) || '{}') as WebAiPreferences;
      window.localStorage.setItem(WEB_AI_PREF_KEY, JSON.stringify({ ...prev, ...patch }));
    } catch {
      // Ignore storage write error.
    }
  };

  const loadMetadata = useCallback(async (activeProv: ClientAiProviderId, savedMap: Partial<Record<ClientAiProviderId, string>>) => {
    if (readOnly) return;
    setLoadingMeta(true);
    try {
      const byokHeaders = buildWebByokHeaders(activeProv);
      const [modelsRes, usageRes] = await Promise.all([
        fetch('/api/ai/models', { headers: byokHeaders }),
        fetch('/api/ai/usage'),
      ]);

      if (modelsRes.ok) {
        const data = (await modelsRes.json()) as { models?: Record<ClientAiProviderId, VerifiedClientModel[]> };
        if (data.models) {
          setModelsByProvider(data.models);
          const nextMap: Partial<Record<ClientAiProviderId, string>> = { ...savedMap };
          for (const p of ['gemini', 'openai', 'anthropic'] as const) {
            nextMap[p] = reconcileSelectedModel(savedMap[p], data.models[p] ?? []);
          }
          setSelectedModels(nextMap);
          savePrefs({ provider: activeProv, models: nextMap });
        }
      }

      if (usageRes.ok) {
        setUsage((await usageRes.json()) as UsageData);
      }
    } catch {
      setErrorMsg('Gagal memuat daftar model dan kuota Cloud AI.');
    } finally {
      setLoadingMeta(false);
    }
  }, [readOnly]);

  useEffect(() => {
    if (readOnly) return;
    let initProv: ClientAiProviderId = 'gemini';
    let initModels: Partial<Record<ClientAiProviderId, string>> = {};
    try {
      const raw = window.localStorage.getItem(WEB_AI_PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WebAiPreferences;
        if (parsed.provider === 'gemini' || parsed.provider === 'openai' || parsed.provider === 'anthropic') {
          initProv = parsed.provider;
        }
        if (parsed.sttProvider === 'gemini' || parsed.sttProvider === 'openai') {
          setSttProvider(parsed.sttProvider);
        }
        if (parsed.models) initModels = parsed.models;
      }
    } catch {
      // Ignore corrupt preference.
    }
    setProvider(initProv);
    setSelectedModels(initModels);
    setHasByok(Boolean(getWebByokKey(initProv)));
    void loadMetadata(initProv, initModels);
  }, [readOnly, loadMetadata]);

  const handleProviderChange = (next: ClientAiProviderId) => {
    setProvider(next);
    setStatusMsg('');
    setErrorMsg('');
    setByokInput('');
    setHasByok(Boolean(getWebByokKey(next)));
    void loadMetadata(next, selectedModels);
  };

  const handleModelChange = (modelId: string) => {
    const nextMap = { ...selectedModels, [provider]: modelId };
    setSelectedModels(nextMap);
    savePrefs({ provider, models: nextMap });
  };

  const handleSttProviderChange = (nextProv: WebSttProviderId) => {
    setSttProvider(nextProv);
    savePrefs({ sttProvider: nextProv });
  };

  const handleTestConnection = async () => {
    setBusyTask('health');
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await fetch('/api/ai/health', { headers: buildWebByokHeaders(provider) });
      const data = (await res.json()) as {
        ok?: boolean;
        killSwitch?: boolean;
        providers?: Record<string, { configured?: boolean; defaultModelReady?: boolean; availableModels?: number }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        setErrorMsg(data.error?.message || 'Gagal menguji koneksi.');
        return;
      }
      if (data.killSwitch) {
        setErrorMsg('Cloud AI sedang dinonaktifkan sementara oleh pemilik.');
        return;
      }
      const pInfo = data.providers?.[provider];
      if (!pInfo?.configured || !pInfo.availableModels) {
        setErrorMsg(`Provider ${PROVIDER_LABELS[provider]} belum siap atau tidak memiliki model aktif.`);
        return;
      }
      setStatusMsg(
        pInfo.defaultModelReady
          ? `Koneksi ${PROVIDER_LABELS[provider]} siap (${pInfo.availableModels} model terverifikasi).`
          : `Koneksi ${PROVIDER_LABELS[provider]} aktif melalui model cadangan (${pInfo.availableModels} model).`,
      );
    } catch {
      setErrorMsg('Jaringan tidak terjangkau saat menguji koneksi.');
    } finally {
      setBusyTask(null);
    }
  };

  const handleAudioFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusyTask('stt');
    setPartInfo('Membaca rekaman suara...');
    setStatusMsg('');
    setErrorMsg('');

    try {
      const sttRes = await transcribeAudioFileInChunks({
        file,
        provider: sttProvider,
        headers: buildWebByokHeaders(sttProvider),
        onProgress: (cur, tot) => setPartInfo(`Mentranskripsi suara bagian ${cur}/${tot}...`),
      });

      if (sttRes.segments.length === 0) {
        setErrorMsg('Tidak ada ucapan yang terdeteksi pada file suara tersebut.');
        setPartInfo('');
        return;
      }

      const saveRes = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/transcripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: sttRes.segments,
          replace: localTranscripts.length === 0,
          durationMs: sttRes.durationMs,
        }),
      });

      if (!saveRes.ok) {
        throw new Error('Gagal menyimpan hasil transkrip ke database.');
      }

      setLocalTranscripts((prev) =>
        prev.length === 0 ? sttRes.segments : [...prev, ...sttRes.segments],
      );
      setPartInfo('');
      setStatusMsg(`Berhasil mengubah suara ke teks (${sttRes.segments.length} bagian). Klik Buat Notulen untuk merangkum.`);
      void loadMetadata(provider, selectedModels);
      router.refresh();
    } catch (err) {
      setPartInfo('');
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal memproses file suara. Untuk transkripsi offline tanpa kuota, gunakan aplikasi desktop Cakapp.',
      );
    } finally {
      setBusyTask(null);
    }
  };

  const handleGenerate = async (task: ClientAiTask) => {
    const activeModel = selectedModels[provider] || '';
    if (!activeModel) {
      setErrorMsg('Tidak ada model aktif untuk provider ini.');
      return;
    }
    const transcriptText = localTranscripts
      .map((t) => `${t.speaker || (t.track === 'me' ? 'Anda' : 'Peserta')}: ${t.text}`)
      .join('\n')
      .trim();

    if (!transcriptText) {
      setErrorMsg('Transkrip rapat masih kosong. Unggah rekaman suara terlebih dahulu atau rekam dari aplikasi desktop.');
      return;
    }

    setBusyTask(task);
    setPartInfo('');
    setStatusMsg('');
    setErrorMsg('');
    let streamed = '';

    try {
      const result = await generateCloudMapReduce({
        provider,
        model: activeModel,
        task,
        input: transcriptText,
        headers: buildWebByokHeaders(provider),
        onPartProgress: (part, total) => setPartInfo(`Meringkas bagian ${part}/${total}...`),
        onToken: (tok) => {
          streamed += tok;
          setContent(streamed);
        },
      });

      setContent(result.text);
      setPartInfo('');

      await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enhanced: result.text }),
      }).catch(() => {});

      setStatusMsg(`${task === 'notulen' ? 'Notulen' : 'Ringkasan'} selesai dibuat (${result.model}).`);
      void loadMetadata(provider, selectedModels);
    } catch (err) {
      const msg =
        err instanceof CloudAiClientError
          ? err.message
          : 'Gagal terhubung ke layanan Cloud AI. Gunakan aplikasi desktop Cakapp untuk mode AI Lokal offline.';
      setErrorMsg(msg);
      setPartInfo('');
    } finally {
      setBusyTask(null);
    }
  };

  const handleSaveByok = () => {
    if (!byokInput.trim()) return;
    setWebByokKey(provider, byokInput.trim());
    setByokInput('');
    setHasByok(true);
    setStatusMsg(`Kunci BYOK ${PROVIDER_LABELS[provider]} aktif untuk sesi tab ini.`);
    void loadMetadata(provider, selectedModels);
  };

  const handleClearByok = () => {
    clearWebByokKey(provider);
    setHasByok(false);
    setStatusMsg(`Kunci BYOK ${PROVIDER_LABELS[provider]} dihapus. Kembali ke kunci server bersama.`);
    void loadMetadata(provider, selectedModels);
  };

  const activeModels = modelsByProvider[provider] ?? [];
  const activeModelId = selectedModels[provider] ?? '';

  return (
    <div className="rounded-2xl border border-line bg-card p-5 sm:p-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-line">
        <div>
          <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
            Notulen & Ringkasan Rapat
          </h2>
          {!readOnly && usage && !hasByok && (
            <p className="mt-1 text-xs text-written">
              Sisa {usage.remainingRequests}/{usage.limitRequests} request notulen
              {usage.remainingSttChunks !== undefined ? ` · ${usage.remainingSttChunks}/${usage.limitSttChunks} potongan suara` : ''} hari ini (reset 00:00 WIB)
            </p>
          )}
          {!readOnly && hasByok && (
            <p className="mt-1 text-xs font-medium text-accent">
              Mode BYOK aktif pada sesi ini (tidak mengurangi kuota bersama)
            </p>
          )}
        </div>

        {readOnly && (
          <span className="text-xs text-muted">
            Tampilan Hanya Baca
          </span>
        )}
      </div>

      {!readOnly && (
        <div className="mb-6 rounded-xl border border-line bg-float p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-ink">Provider Notulen Cloud AI</span>
              <div className="flex flex-wrap gap-2">
                {(['gemini', 'openai', 'anthropic'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={busyTask !== null}
                    onClick={() => handleProviderChange(p)}
                    className={`min-h-[44px] sm:min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      provider === p
                        ? 'bg-ink text-paper'
                        : 'border border-control bg-paper text-ink hover:bg-chrome'
                    }`}
                  >
                    {PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 min-w-[220px]">
              <label htmlFor="web-ai-model" className="block text-xs font-semibold text-ink">
                Model Aktif
              </label>
              <select
                id="web-ai-model"
                value={activeModelId}
                disabled={busyTask !== null || loadingMeta || activeModels.length === 0}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-[36px] rounded-lg border border-control bg-paper px-3 py-1.5 text-xs text-ink"
              >
                {loadingMeta && <option value="">Memuat daftar model aktif...</option>}
                {!loadingMeta && activeModels.length === 0 && (
                  <option value="">Tidak ada model aktif</option>
                )}
                {activeModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.default ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-line space-y-2.5">
            <div>
              <p className="text-xs font-semibold text-ink">Unggah File Audio ke Teks (Cloud STT)</p>
              <p className="text-xs text-written">
                Di browser, transkripsi audio diproses oleh Cloud AI Server. Pengaturan Whisper Lokal tersedia di Cakapp Desktop.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-paper p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-written">Provider Suara:</span>
                {(['gemini', 'openai'] as const).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    disabled={busyTask !== null}
                    onClick={() => handleSttProviderChange(sp)}
                    className={`min-h-[44px] sm:min-h-[32px] rounded-md px-2.5 py-1 text-xs font-medium ${
                      sttProvider === sp
                        ? 'bg-ink text-paper'
                        : 'border border-control bg-float text-ink hover:bg-chrome'
                    }`}
                  >
                    {sp === 'gemini' ? 'Google Gemini' : 'OpenAI'}
                  </button>
                ))}
              </div>

              <label className="inline-flex min-h-[44px] sm:min-h-[34px] cursor-pointer items-center justify-center rounded-lg border border-control bg-float px-3 py-1.5 text-xs font-semibold text-ink hover:bg-chrome">
                <span>{busyTask === 'stt' ? partInfo || 'Mentranskripsi...' : 'Unggah Suara ke Teks'}</span>
                <input
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
                  disabled={busyTask !== null}
                  onChange={(e) => void handleAudioFileSelected(e)}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={busyTask !== null || activeModels.length === 0 || localTranscripts.length === 0}
              onClick={() => void handleGenerate('notulen')}
              className="min-h-[44px] sm:min-h-[38px] rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-ink hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busyTask === 'notulen' ? partInfo || 'Menyusun Notulen...' : 'Buat Notulen'}
            </button>
            <button
              type="button"
              disabled={busyTask !== null || activeModels.length === 0 || localTranscripts.length === 0}
              onClick={() => void handleGenerate('ringkasan')}
              className="min-h-[44px] sm:min-h-[38px] rounded-xl border border-control bg-paper px-4 py-2 text-xs font-semibold text-ink hover:bg-chrome disabled:opacity-50 transition-colors"
            >
              {busyTask === 'ringkasan' ? partInfo || 'Meringkas...' : 'Buat Ringkasan'}
            </button>
            <button
              type="button"
              disabled={busyTask !== null}
              onClick={() => void handleTestConnection()}
              className="min-h-[44px] sm:min-h-[38px] rounded-xl border border-control bg-paper px-3.5 py-2 text-xs font-medium text-ink hover:bg-chrome disabled:opacity-50 transition-colors"
            >
              {busyTask === 'health' ? 'Menguji...' : 'Uji Koneksi'}
            </button>
          </div>

          <details className="pt-2 border-t border-line text-xs text-written">
            <summary className="cursor-pointer select-none font-medium text-ink py-1">
              Opsi Lanjutan: Gunakan API Key Sendiri (Opsional)
            </summary>
            <div className="mt-2.5 space-y-2">
              <p className="text-written">
                Kunci bersama sudah dikelola oleh server. Isi hanya jika Anda ingin memakai API key pribadi pada sesi tab ini tanpa memotong kuota bersama.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={byokInput}
                  onChange={(e) => setByokInput(e.target.value)}
                  placeholder={`API Key ${PROVIDER_LABELS[provider]} (opsional)`}
                  aria-label={`API Key ${PROVIDER_LABELS[provider]}`}
                  className="flex-1 min-h-[44px] sm:min-h-[36px] rounded-lg border border-control bg-paper px-3 py-1.5 text-xs text-ink placeholder:text-muted"
                />
                <button
                  type="button"
                  disabled={!byokInput.trim() || busyTask !== null}
                  onClick={handleSaveByok}
                  className="min-h-[44px] sm:min-h-[36px] rounded-lg border border-control bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-chrome disabled:opacity-50"
                >
                  Pakai Key Ini
                </button>
                {hasByok && (
                  <button
                    type="button"
                    disabled={busyTask !== null}
                    onClick={handleClearByok}
                    className="min-h-[44px] sm:min-h-[36px] rounded-lg border border-control bg-paper px-3.5 py-1.5 text-xs font-medium text-ink hover:bg-chrome"
                  >
                    Reset ke Server
                  </button>
                )}
              </div>
            </div>
          </details>

          {statusMsg && (
            <p role="status" className="text-xs text-ink font-medium">
              {statusMsg}
            </p>
          )}
          {errorMsg && (
            <p role="alert" className="text-xs text-accent font-medium">
              {errorMsg}
            </p>
          )}
        </div>
      )}

      <MeetingNotesView content={content} />
    </div>
  );
}
