'use client';

import React, { useRef, useState, useEffect } from 'react';

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
  if (isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({
  audioUrl,
  transcripts,
}: {
  audioUrl: string;
  transcripts: TranscriptItem[];
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      const cur = audio.currentTime;
      setCurrentTime(cur);

      // Find current transcript item
      const curMs = cur * 1000;
      const match = transcripts.find((t) => curMs >= t.start_ms && curMs <= t.end_ms);
      setActiveId(match ? match.id : null);
    };

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setActiveId(null);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [transcripts]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const targetTime = Number(e.target.value);
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  }

  function seekTo(ms: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const targetSeconds = ms / 1000;
    audio.currentTime = targetSeconds;
    setCurrentTime(targetSeconds);
    if (!isPlaying) {
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  }

  return (
    <div className="space-y-6">
      {/* Hidden audio element */}
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Player Bar */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-950/80 p-4 sm:p-5 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-950 hover:bg-white transition-transform active:scale-95 shadow-md"
              aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            >
              {isPlaying ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            <div>
              <div className="text-xs font-semibold text-zinc-100 flex items-center gap-2">
                <span>Rekaman Audio Rapat Asli</span>
                <span className="rounded bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 text-[9px] font-medium text-emerald-300">
                  Audio Aktif
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Putar untuk mendengar percakapan asli; baris transkrip di bawah otomatis tersorot sinkron karaoke.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-zinc-300 self-end sm:self-center">
            <span>{formatTime(currentTime)}</span>
            <span className="text-zinc-600">/</span>
            <span>{formatTime(duration || 37.3)}</span>
          </div>
        </div>

        {/* Progress Scrubber */}
        <div className="mt-3.5">
          <input
            type="range"
            min={0}
            max={duration || 37.3}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-100"
          />
        </div>
      </div>

      {/* Interactive Transcript Dialogue with karaoke highlight */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/80">
          <h2 className="text-sm sm:text-base font-semibold text-zinc-100 flex items-center gap-2">
            <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Transkrip Percakapan Lengkap ({transcripts.length} baris)
          </h2>
          <span className="text-[11px] text-zinc-500">
            Klik kalimat apa saja untuk melompat audio
          </span>
        </div>

        <div className="space-y-3">
          {transcripts.map((tr) => {
            const isMe = tr.track === 'me';
            const isActive = activeId === tr.id;

            return (
              <div
                key={tr.id}
                onClick={() => seekTo(tr.start_ms)}
                className={`group flex gap-3 text-xs sm:text-sm p-3 rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? 'bg-zinc-800/90 border border-zinc-600 ring-1 ring-zinc-500 shadow-sm'
                    : 'hover:bg-zinc-800/40 border border-transparent'
                }`}
              >
                <div className="flex flex-col items-start shrink-0 pt-0.5">
                  <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-zinc-100 text-zinc-950 font-semibold' : 'text-zinc-500 bg-zinc-900/60 group-hover:text-zinc-300'
                  }`}>
                    {formatTime(tr.start_ms / 1000)}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold ${isMe ? 'text-zinc-100' : 'text-zinc-300'}`}>
                      {tr.speaker}
                    </span>
                    {tr.role && (
                      <span className="text-[10px] text-zinc-400">
                        • {tr.role}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-600">
                      ({isMe ? 'Mic Input' : 'Speaker Output'})
                    </span>
                  </div>

                  <p className={`leading-relaxed transition-colors ${
                    isActive ? 'text-white font-medium' : 'text-zinc-300 group-hover:text-zinc-100'
                  }`}>
                    {tr.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
