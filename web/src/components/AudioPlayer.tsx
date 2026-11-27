'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { uploadAudioChunksToCloud } from '@/lib/audio-upload-client';

export type TranscriptItem = {
  id: number;
  speaker: string;
  role?: string;
  track: 'me' | 'them';
  start_ms: number;
  end_ms: number;
  text: string;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({
  audioUrl,
  transcripts,
  durationMs,
  meetingId,
  canUploadCloudAudio = false,
}: {
  audioUrl: string | null;
  transcripts: TranscriptItem[];
  durationMs?: number | null;
  meetingId?: string;
  canUploadCloudAudio?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const [effectiveUrl, setEffectiveUrl] = useState<string | null>(audioUrl);
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [audioMsg, setAudioMsg] = useState('');
  const [audioError, setAudioError] = useState('');

  useEffect(() => {
    setEffectiveUrl(audioUrl);
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    };
  }, [localObjectUrl]);

  const fallbackDurationSec = useMemo(() => {
    if (durationMs && durationMs > 0) return durationMs / 1000;
    const lastEnd = transcripts.reduce((max, t) => Math.max(max, Number(t.end_ms) || 0), 0);
    return lastEnd > 0 ? lastEnd / 1000 : 0;
  }, [durationMs, transcripts]);

  const effectiveDuration = duration > 0 ? duration : fallbackDurationSec;
  const currentMs = currentTime * 1000;

  const activeTranscript = useMemo(
    () => transcripts.find((t) => currentMs >= t.start_ms && currentMs <= t.end_ms) ?? null,
    [transcripts, currentMs],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !effectiveUrl) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => setIsPlaying(false);
    const onError = () => {
      setIsPlaying(false);
      setAudioError('File audio tidak dapat diputar di browser ini.');
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [effectiveUrl]);

  useEffect(() => {
    if (autoScroll && isPlaying && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeTranscript?.id, autoScroll, isPlaying]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !effectiveUrl) return;
    setAudioError('');
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = speed;
      audio.play().then(() => setIsPlaying(true)).catch(() => setAudioError('Gagal memulai pemutaran audio.'));
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const targetTime = Number(e.target.value);
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  }

  function skipSeconds(delta: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(effectiveDuration || audio.duration || 0, audio.currentTime + delta));
    audio.currentTime = next;
    setCurrentTime(next);
  }

  function seekTo(ms: number) {
    const audio = audioRef.current;
    if (!audio || !effectiveUrl) return;
    const targetSeconds = ms / 1000;
    audio.currentTime = targetSeconds;
    setCurrentTime(targetSeconds);
    audio.playbackRate = speed;
    if (!isPlaying) {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }

  function cycleSpeed() {
    const speeds = [1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  async function copyTranscript() {
    const text = transcripts
      .map((tr) => `[${formatTime(tr.start_ms / 1000)}] ${tr.speaker || 'Peserta'}: ${tr.text}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    } catch {
      // Ignore clipboard permission failure.
    }
  }

  function handleLoadLocalAudio(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    const url = URL.createObjectURL(file);
    setLocalObjectUrl(url);
    setEffectiveUrl(url);
    setAudioError('');
    setAudioMsg(`Memutar audio lokal: ${file.name}`);
  }

  async function handleUploadCloudAudio(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !meetingId) return;
    setUploadingAudio(true);
    setAudioError('');
    setAudioMsg('Mengunggah audio ke cloud...');
    try {
      const uploadedUrl = await uploadAudioChunksToCloud({
        meetingId,
        audio: file,
        mimeType: file.type,
        onProgress: (p, tot) => setAudioMsg(`Mengunggah bagian audio (${p}/${tot})...`),
      });
      setEffectiveUrl(`${uploadedUrl}?v=${Date.now()}`);
      setAudioMsg('Audio berhasil disimpan ke cloud dan siap diputar dari mana saja.');
    } catch (err) {
      setAudioMsg('');
      setAudioError(err instanceof Error ? err.message : 'Gagal mengunggah rekaman ke cloud.');
    } finally {
      setUploadingAudio(false);
    }
  }

  return (
    <div className="space-y-6">
      {effectiveUrl && <audio ref={audioRef} src={effectiveUrl} preload="metadata" />}

      {/* Audio Player Bar */}
      <div className="rounded-2xl border border-line bg-card p-4 sm:p-5 space-y-3">
        {effectiveUrl ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink hover:opacity-90 transition-opacity"
                  aria-label={isPlaying ? 'Jeda audio' : 'Putar audio'}
                >
                  {isPlaying ? (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                </button>

                <div>
                  <p className="text-xs sm:text-sm font-semibold text-ink">
                    Rekaman Audio Rapat
                  </p>
                  <p className="text-xs text-written mt-0.5">
                    Klik kalimat atau kata pada transkrip untuk melompat tepat ke detik pembicaraan.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => skipSeconds(-10)}
                  aria-label="Mundur 10 detik"
                  className="min-h-[44px] sm:min-h-[34px] rounded-lg border border-control bg-float px-2.5 text-xs font-medium text-ink hover:bg-chrome"
                >
                  -10d
                </button>
                <button
                  type="button"
                  onClick={cycleSpeed}
                  aria-label={`Kecepatan putar ${speed}x`}
                  className="min-h-[44px] sm:min-h-[34px] rounded-lg border border-control bg-float px-2.5 font-mono text-xs font-medium text-ink hover:bg-chrome"
                >
                  {speed}x
                </button>
                <button
                  type="button"
                  onClick={() => skipSeconds(10)}
                  aria-label="Maju 10 detik"
                  className="min-h-[44px] sm:min-h-[34px] rounded-lg border border-control bg-float px-2.5 text-xs font-medium text-ink hover:bg-chrome"
                >
                  +10d
                </button>
                <span className="font-mono text-xs text-written ml-1">
                  {formatTime(currentTime)} / {formatTime(effectiveDuration)}
                </span>
              </div>
            </div>

            <div>
              <input
                type="range"
                aria-label="Posisi pemutaran audio"
                min={0}
                max={effectiveDuration || 1}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 bg-line rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-ink">
                Audio Disimpan Lokal di Komputer Perekam
              </p>
              <p className="text-xs text-written leading-relaxed">
                Demi privasi, file audio mentah tidak otomatis diunggah ke cloud. Anda tetap dapat membaca transkrip lengkap di bawah atau memuat file audio secara manual.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <label className="inline-flex min-h-[44px] sm:min-h-[36px] cursor-pointer items-center justify-center rounded-xl border border-control bg-float px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-chrome">
                <span>Putar File Lokal</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleLoadLocalAudio}
                  className="sr-only"
                />
              </label>

              {canUploadCloudAudio && meetingId && (
                <label className="inline-flex min-h-[44px] sm:min-h-[36px] cursor-pointer items-center justify-center rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-ink hover:opacity-90">
                  <span>{uploadingAudio ? 'Mengunggah...' : 'Upload Audio ke Cloud'}</span>
                  <input
                    type="file"
                    accept="audio/*"
                    disabled={uploadingAudio}
                    onChange={(e) => void handleUploadCloudAudio(e)}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {audioMsg && <p role="status" className="text-xs text-ink font-medium">{audioMsg}</p>}
        {audioError && <p role="alert" className="text-xs text-accent font-medium">{audioError}</p>}
      </div>

      {/* Interactive Transcript Dialogue with Word-Level Karaoke Highlight */}
      <div className="rounded-2xl border border-line bg-float p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-line">
          <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
            Transkrip Percakapan ({transcripts.length} baris)
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={autoScroll}
              onClick={() => setAutoScroll((v) => !v)}
              className="min-h-[44px] sm:min-h-[34px] rounded-lg border border-control bg-paper px-3 py-1 text-xs font-medium text-ink hover:bg-chrome"
            >
              {autoScroll ? 'Auto-gulir: Aktif' : 'Auto-gulir: Mati'}
            </button>
            <button
              type="button"
              disabled={transcripts.length === 0}
              onClick={() => void copyTranscript()}
              className="min-h-[44px] sm:min-h-[34px] rounded-lg border border-control bg-paper px-3 py-1 text-xs font-semibold text-ink hover:bg-chrome disabled:opacity-50"
            >
              {copiedTranscript ? 'Transkrip Tersalin' : 'Salin Transkrip'}
            </button>
          </div>
        </div>

        {transcripts.length === 0 ? (
          <p className="py-6 text-center text-xs sm:text-sm text-muted">
            Belum ada baris transkrip untuk rapat ini.
          </p>
        ) : (
          <div className="space-y-2.5">
            {transcripts.map((tr) => {
              const isMe = tr.track === 'me';
              const isActive = activeTranscript?.id === tr.id;
              const words = tr.text.trim().split(/\s+/).filter(Boolean);
              const segSpan = Math.max(1, tr.end_ms - tr.start_ms);
              const progressRatio = isActive
                ? Math.max(0, Math.min(1, (currentMs - tr.start_ms) / segSpan))
                : 0;
              const activeWordIdx = isActive && words.length > 0
                ? Math.min(words.length - 1, Math.floor(progressRatio * words.length))
                : -1;

              return (
                <div
                  key={tr.id}
                  ref={isActive ? activeRowRef : undefined}
                  className={`flex flex-col sm:flex-row gap-2 sm:gap-3 text-xs sm:text-sm p-3.5 rounded-xl border transition-colors ${
                    isActive
                      ? 'bg-card border-accent'
                      : 'bg-paper/40 border-transparent hover:border-line hover:bg-card/60'
                  }`}
                >
                  <div className="shrink-0">
                    <button
                      type="button"
                      disabled={!effectiveUrl}
                      onClick={() => seekTo(tr.start_ms)}
                      title={effectiveUrl ? `Putar mulai ${formatTime(tr.start_ms / 1000)}` : undefined}
                      className={`min-h-[36px] sm:min-h-[28px] rounded-md px-2 py-1 font-mono text-xs transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-ink font-semibold'
                          : 'border border-line bg-float text-written hover:bg-chrome disabled:cursor-default'
                      }`}
                    >
                      {formatTime(tr.start_ms / 1000)}
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-ink">
                        {tr.speaker || (isMe ? 'Anda' : 'Peserta')}
                      </span>
                      {tr.role && <span className="text-xs text-muted">{tr.role}</span>}
                      <span className="text-[11px] text-muted">
                        ({isMe ? 'Mikrofon' : 'Audio Rapat'})
                      </span>
                    </div>

                    <p className="leading-relaxed text-written">
                      {words.map((word, wIdx) => {
                        const wordStartMs = tr.start_ms + Math.round((wIdx / Math.max(1, words.length)) * segSpan);
                        const wordHighlighted = isActive && wIdx <= activeWordIdx;
                        return (
                          <React.Fragment key={wIdx}>
                            {effectiveUrl ? (
                              <button
                                type="button"
                                onClick={() => seekTo(wordStartMs)}
                                className={`inline text-left rounded px-0.5 transition-colors hover:text-ink ${
                                  wordHighlighted ? 'bg-accent/20 text-ink font-semibold' : ''
                                }`}
                              >
                                {word}
                              </button>
                            ) : (
                              <span>{word}</span>
                            )}
                            {wIdx < words.length - 1 ? ' ' : ''}
                          </React.Fragment>
                        );
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
