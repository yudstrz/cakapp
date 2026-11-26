'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
}

const PROVIDER_LABELS: Record<ClientAiProviderId, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
};

const PREF_KEY = 'cakapp:web-ai-pref';

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
  const [content, setContent] = useState(initialContent);
  const [provider, setProvider] = useState<ClientAiProviderId>('gemini');
  const [selectedModels, setSelectedModels] = useState<Partial<Record<ClientAiProviderId, string>>>({});
  const [modelsByProvider, setModelsByProvider] = useState<Record<ClientAiProviderId, VerifiedClientModel[]>>({
    gemini: [],
    openai: [],
    anthropic: [],
  });
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(!readOnly);
  const [busyTask, setBusyTask] = useState<ClientAiTask | 'health' | null>(null);
  const [partInfo, setPartInfo] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [byokInput, setByokInput] = useState('');
  const [hasByok, setHasByok] = useState(false);

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
          try {
            window.localStorage.setItem(PREF_KEY, JSON.stringify({ provider: activeProv, models: nextMap }));
          } catch {
            // Ignore storage write error.
          }
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
      const raw = window.localStorage.getItem(PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { provider?: ClientAiProviderId; models?: Partial<Record<ClientAiProviderId, string>> };
        if (parsed.provider === 'gemini' || parsed.provider === 'openai' || parsed.provider === 'anthropic') {
          initProv = parsed.provider;
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
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify({ provider, models: nextMap }));
    } catch {
      // Ignore storage write error.
    }
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

  const handleGenerate = async (task: ClientAiTask) => {
    const activeModel = selectedModels[provider] || '';
    if (!activeModel) {
      setErrorMsg('Tidak ada model aktif untuk provider ini.');
      return;
    }
    const transcriptText = transcripts
      .map((t) => `${t.speaker || (t.track === 'me' ? 'Anda' : 'Peserta')}: ${t.text}`)
      .join('\n')
      .trim();

    if (!transcriptText) {
      setErrorMsg('Transkrip rapat kosong, tidak ada teks untuk diringkas.');
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-zinc-800/80">
        <div>
          <h2 className="text-sm sm:text-base font-semibold text-zinc-100">
            Notulen & Ringkasan Rapat
          </h2>
          {!readOnly && usage && !hasByok && (
            <p className="mt-1 text-xs text-zinc-300">
              Sisa {usage.remainingRequests}/{usage.limitRequests} request hari ini (reset 00:00 WIB)
            </p>
          )}
          {!readOnly && hasByok && (
            <p className="mt-1 text-xs text-emerald-300">
              Mode BYOK aktif pada sesi ini (tidak mengurangi kuota bersama)
            </p>
          )}
        </div>

        {readOnly && (
          <span className="text-xs text-zinc-400">
            Contoh Notulen Terstruktur
          </span>
        )}
      </div>

      {!readOnly && (
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-zinc-300">Provider Cloud AI</span>
              <div className="flex flex-wrap gap-2">
                {(['gemini', 'openai', 'anthropic'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={busyTask !== null}
                    onClick={() => handleProviderChange(p)}
                    className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300 ${
                      provider === p
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    {PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 min-w-[220px]">
              <label htmlFor="web-ai-model" className="block text-xs font-medium text-zinc-300">
                Model Aktif
              </label>
              <select
                id="web-ai-model"
                value={activeModelId}
                disabled={busyTask !== null || loadingMeta || activeModels.length === 0}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full min-h-[36px] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300"
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

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={busyTask !== null || activeModels.length === 0 || transcripts.length === 0}
              onClick={() => void handleGenerate('notulen')}
              className="min-h-[38px] rounded-lg bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-white disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300"
            >
              {busyTask === 'notulen' ? partInfo || 'Menyusun Notulen...' : 'Buat Notulen'}
            </button>
            <button
              type="button"
              disabled={busyTask !== null || activeModels.length === 0 || transcripts.length === 0}
              onClick={() => void handleGenerate('ringkasan')}
              className="min-h-[38px] rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300"
            >
              {busyTask === 'ringkasan' ? partInfo || 'Meringkas...' : 'Buat Ringkasan'}
            </button>
            <button
              type="button"
              disabled={busyTask !== null}
              onClick={() => void handleTestConnection()}
              className="min-h-[38px] rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300"
            >
              {busyTask === 'health' ? 'Menguji...' : 'Uji Koneksi'}
            </button>
          </div>

          <details className="pt-2 border-t border-zinc-800/80 text-xs text-zinc-300">
            <summary className="cursor-pointer select-none font-medium text-zinc-300 hover:text-zinc-100 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300">
              Opsi Lanjutan: Gunakan API Key Sendiri (Opsional)
            </summary>
            <div className="mt-2.5 space-y-2">
              <p className="text-zinc-400">
                Kunci bersama sudah dikelola oleh server. Isi hanya jika Anda ingin memakai API key pribadi pada sesi tab ini tanpa memotong kuota bersama.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={byokInput}
                  onChange={(e) => setByokInput(e.target.value)}
                  placeholder={`API Key ${PROVIDER_LABELS[provider]} (opsional)`}
                  aria-label={`API Key ${PROVIDER_LABELS[provider]}`}
                  className="flex-1 min-h-[36px] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300"
                />
                <button
                  type="button"
                  disabled={!byokInput.trim() || busyTask !== null}
                  onClick={handleSaveByok}
                  className="min-h-[36px] rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
                >
                  Pakai Key Ini
                </button>
                {hasByok && (
                  <button
                    type="button"
                    disabled={busyTask !== null}
                    onClick={handleClearByok}
                    className="min-h-[36px] rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                  >
                    Reset ke Server
                  </button>
                )}
              </div>
            </div>
          </details>

          {statusMsg && (
            <p role="status" className="text-xs text-emerald-300">
              {statusMsg}
            </p>
          )}
          {errorMsg && (
            <p role="alert" className="text-xs text-amber-300">
              {errorMsg}
            </p>
          )}
        </div>
      )}

      <MeetingNotesView content={content} />
    </div>
  );
}
