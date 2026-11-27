'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface SearchResultItem {
  id: string;
  title: string;
  started_at: string | number;
  language?: string | null;
  app?: string | null;
  role?: string;
  excerpt?: string;
}

interface CitationItem {
  id: string;
  title: string;
  startedAt: number;
  excerpt: string;
}

export default function DashboardSearchAsk({
  initialMeetings,
}: {
  initialMeetings: SearchResultItem[];
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[] | null>(null);
  const [searchError, setSearchError] = useState('');

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askAnswer, setAskAnswer] = useState('');
  const [citations, setCitations] = useState<CitationItem[]>([]);
  const [askError, setAskError] = useState('');

  const displayedMeetings = searchResults ?? initialMeetings;

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) {
      setSearchResults(null);
      setSearchError('');
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const resp = await fetch(`/api/meetings/search?q=${encodeURIComponent(clean)}`);
      const data = (await resp.json()) as { ok?: boolean; results?: SearchResultItem[]; error?: { message?: string } };
      if (!resp.ok) {
        setSearchError(data.error?.message || 'Gagal mencari rapat.');
        return;
      }
      setSearchResults(data.results ?? []);
    } catch {
      setSearchError('Kendala jaringan saat mencari rapat.');
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQuery('');
    setSearchResults(null);
    setSearchError('');
  }

  async function runAsk(e: React.FormEvent) {
    e.preventDefault();
    const clean = question.trim();
    if (clean.length < 2) return;
    setAsking(true);
    setAskError('');
    setAskAnswer('');
    setCitations([]);
    try {
      const resp = await fetch('/api/meetings/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: clean }),
      });
      const data = (await resp.json()) as {
        answer?: string;
        citations?: CitationItem[];
        error?: { message?: string };
      };
      if (!resp.ok) {
        setAskError(data.error?.message || 'Gagal menjawab pertanyaan.');
        return;
      }
      setAskAnswer(data.answer ?? '');
      setCitations(data.citations ?? []);
    } catch {
      setAskError('Kendala jaringan saat menghubungi layanan tanya-jawab.');
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Tanya Lintas Rapat (RAG Ask) + Pencarian */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <form onSubmit={(e) => void runAsk(e)} className="lg:col-span-7 rounded-2xl border border-line bg-card p-5 space-y-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              Tanya Lintas Rapat (Ask)
            </h2>
            <p className="text-xs text-written mt-0.5">
              Ajukan pertanyaan seputar keputusan, jadwal, atau tindak lanjut dari seluruh rapat yang Anda miliki.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Contoh: Apa keputusan terkait jadwal rilis minggu lalu?"
              aria-label="Pertanyaan lintas rapat"
              className="flex-1 min-h-[44px] rounded-xl border border-control bg-float px-3.5 py-2 text-xs sm:text-sm text-ink placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={asking || question.trim().length < 2}
              className="min-h-[44px] rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-ink hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
            >
              {asking ? 'Mencari jawaban...' : 'Tanya Cakapp'}
            </button>
          </div>

          {askError && (
            <p role="alert" className="text-xs text-accent font-medium">
              {askError}
            </p>
          )}

          {askAnswer && (
            <div className="rounded-xl border border-line bg-float p-4 space-y-3 text-xs sm:text-sm">
              <p className="text-ink whitespace-pre-wrap leading-relaxed">{askAnswer}</p>
              {citations.length > 0 && (
                <div className="pt-2 border-t border-line space-y-1.5">
                  <p className="text-xs font-semibold text-muted">Sumber Rapat Terkait:</p>
                  <ul className="space-y-1">
                    {citations.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/dashboard/meetings/${c.id}`}
                          className="inline-flex items-center gap-2 text-xs font-medium text-accent hover:underline py-1"
                        >
                          <span>{c.title}</span>
                          <span className="text-muted">
                            ({new Date(c.startedAt).toLocaleDateString('id-ID')})
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </form>

        <form onSubmit={(e) => void runSearch(e)} className="lg:col-span-5 rounded-2xl border border-line bg-card p-5 space-y-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              Cari Rapat & Transkrip
            </h2>
            <p className="text-xs text-written mt-0.5">
              Cari kata kunci di judul, ringkasan notulen, atau isi percakapan.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari topik, nama peserta, proyek..."
              aria-label="Kata kunci pencarian rapat"
              className="flex-1 min-h-[44px] rounded-xl border border-control bg-float px-3.5 py-2 text-xs sm:text-sm text-ink placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={searching}
              className="min-h-[44px] rounded-xl border border-control bg-float px-4 py-2 text-xs font-semibold text-ink hover:bg-chrome transition-colors shrink-0"
            >
              {searching ? 'Mencari...' : 'Cari'}
            </button>
          </div>
          {searchResults !== null && (
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Ditemukan {searchResults.length} rapat untuk &ldquo;{query}&rdquo;</span>
              <button type="button" onClick={clearSearch} className="font-medium text-accent hover:underline py-1">
                Tampilkan semua
              </button>
            </div>
          )}
          {searchError && (
            <p role="alert" className="text-xs text-accent font-medium">
              {searchError}
            </p>
          )}
        </form>
      </div>

      {/* Meetings List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold text-ink">
            {searchResults !== null ? `Hasil Pencarian (${displayedMeetings.length})` : `Rapat Saya & Tim (${displayedMeetings.length})`}
          </h2>
        </div>

        {displayedMeetings.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-2xl border border-line bg-card">
            <h3 className="font-display text-base font-semibold text-ink">
              {searchResults !== null ? 'Tidak Ada Rapat yang Cocok' : 'Belum Ada Sesi Rapat'}
            </h3>
            <p className="mt-1.5 text-xs sm:text-sm text-written max-w-md mx-auto leading-relaxed">
              {searchResults !== null
                ? 'Coba gunakan kata kunci lain atau hapus filter pencarian.'
                : 'Rekam langsung lewat perekam suara di bawah, unggah file rekaman, atau nyalakan aplikasi Cakapp Desktop saat rapat.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {searchResults !== null ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="min-h-[44px] rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-ink hover:opacity-90"
                >
                  Reset Pencarian
                </button>
              ) : (
                <>
                  <Link
                    href="/download"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-ink hover:opacity-90"
                  >
                    Unduh Cakapp Desktop
                  </Link>
                  <Link
                    href="/dashboard/meetings/showcase-demo"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-control bg-float px-5 py-2 text-xs font-semibold text-ink hover:bg-chrome"
                  >
                    Lihat Contoh Rapat
                  </Link>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-line rounded-2xl border border-line bg-card overflow-hidden">
            {displayedMeetings.map((m) => {
              const dateStr = m.started_at
                ? new Date(Number(m.started_at)).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Waktu tidak tersedia';
              const roleLabel =
                m.role === 'viewer' ? 'Viewer' : m.role === 'editor' ? 'Editor' : 'Owner';

              return (
                <div
                  key={m.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 hover:bg-chrome/50 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-sm sm:text-base text-ink truncate">
                        {m.title || 'Rapat Tanpa Judul'}
                      </h3>
                      <span className="rounded-md border border-line bg-float px-2 py-0.5 text-[11px] font-medium text-written">
                        {roleLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>{dateStr}</span>
                      <span>·</span>
                      <span>{(m.language || 'id').toUpperCase()}</span>
                      {m.app && (
                        <>
                          <span>·</span>
                          <span>{m.app}</span>
                        </>
                      )}
                    </div>
                    {m.excerpt && (
                      <p className="text-xs text-written line-clamp-2 pt-0.5">
                        {m.excerpt.replace(/[#*`]/g, '')}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    <Link
                      href={`/dashboard/meetings/${m.id}`}
                      className="inline-flex min-h-[44px] sm:min-h-[38px] w-full sm:w-auto items-center justify-center rounded-xl border border-control bg-float px-4 py-2 text-xs font-semibold text-ink hover:bg-chrome transition-colors"
                    >
                      Buka Notulen
                    </Link>
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
