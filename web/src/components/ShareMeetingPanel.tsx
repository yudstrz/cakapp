'use client';

import React, { useEffect, useState } from 'react';

interface WorkspaceOption {
  id: string;
  name: string;
}

export default function ShareMeetingPanel({
  meetingId,
  initialMode,
  initialToken,
  initialWorkspaceId,
}: {
  meetingId: string;
  initialMode: 'private' | 'workspace' | 'public';
  initialToken: string | null;
  initialWorkspaceId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'private' | 'workspace' | 'public'>(initialMode);
  const [token, setToken] = useState<string | null>(initialToken);
  const [workspaceId, setWorkspaceId] = useState<string>(initialWorkspaceId || '');
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    void fetch('/api/workspaces')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { workspaces?: WorkspaceOption[] } | null) => {
        if (d?.workspaces) {
          setWorkspaces(d.workspaces);
          if (!workspaceId && d.workspaces.length > 0) {
            setWorkspaceId(d.workspaces[0].id);
          }
        }
      })
      .catch(() => {});
  }, [open, workspaceId]);

  const fullShareUrl =
    typeof window !== 'undefined' && mode === 'public' && token
      ? `${window.location.origin}/share/${token}`
      : mode === 'public' && token
        ? `/share/${token}`
        : '';

  async function saveShare(nextMode: 'private' | 'workspace' | 'public', rotate = false) {
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const resp = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareMode: nextMode,
          workspaceId: nextMode === 'workspace' ? workspaceId || null : null,
          rotateToken: rotate,
        }),
      });
      const data = (await resp.json()) as {
        shareMode?: 'private' | 'workspace' | 'public';
        shareToken?: string | null;
        error?: { message?: string };
      };
      if (!resp.ok) {
        setError(data.error?.message || 'Gagal menyimpan pengaturan berbagi.');
        return;
      }
      setMode(data.shareMode ?? nextMode);
      setToken(data.shareToken ?? null);
      setStatus(
        nextMode === 'public'
          ? 'Tautan publik aktif. Siapa pun yang memiliki tautan dapat melihat notulen dan audio rapat ini.'
          : nextMode === 'workspace'
            ? 'Rapat dibagikan ke anggota workspace tim terpilih.'
            : 'Rapat disetel Private (hanya Anda yang dapat mengakses).',
      );
    } catch {
      setError('Kendala jaringan saat memperbarui tautan berbagi.');
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!fullShareUrl) return;
    try {
      await navigator.clipboard.writeText(fullShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure.
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[44px] sm:min-h-[38px] items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-ink hover:opacity-90 transition-opacity"
      >
        {mode === 'public' ? 'Bagikan (Tautan Publik Aktif)' : mode === 'workspace' ? 'Bagikan (Tim Workspace)' : 'Bagikan Rapat'}
      </button>

      {open && (
        <div className="rounded-2xl border border-line bg-card p-4 sm:p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-ink">
              Pengaturan Akses & Tautan Berbagi
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-[36px] rounded-lg border border-control bg-float px-2.5 text-xs font-medium text-ink hover:bg-chrome"
            >
              Tutup
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              ['private', 'Private', 'Hanya Anda yang bisa membuka.'],
              ['workspace', 'Team Workspace', 'Dapat diakses rekan satu workspace.'],
              ['public', 'Public Web Link', 'Tautan read-only tanpa login.'],
            ] as const).map(([key, title, desc]) => (
              <button
                key={key}
                type="button"
                disabled={saving}
                aria-pressed={mode === key}
                onClick={() => {
                  setMode(key);
                  if (key !== 'workspace') void saveShare(key);
                }}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  mode === key
                    ? 'border-accent bg-float text-ink'
                    : 'border-line bg-paper text-written hover:bg-chrome'
                }`}
              >
                <p className="font-semibold text-ink">{title}</p>
                <p className="mt-0.5 text-[11px] text-muted">{desc}</p>
              </button>
            ))}
          </div>

          {mode === 'workspace' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              {workspaces.length === 0 ? (
                <p className="text-written">
                  Belum ada workspace tim. Buat workspace terlebih dahulu di halaman Dashboard.
                </p>
              ) : (
                <>
                  <select
                    value={workspaceId}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                    aria-label="Pilih workspace"
                    className="flex-1 min-h-[44px] sm:min-h-[36px] rounded-lg border border-control bg-float px-3 py-1.5 text-xs text-ink"
                  >
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={saving || !workspaceId}
                    onClick={() => void saveShare('workspace')}
                    className="min-h-[44px] sm:min-h-[36px] rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:opacity-90"
                  >
                    Simpan ke Workspace
                  </button>
                </>
              )}
            </div>
          )}

          {mode === 'public' && token && (
            <div className="space-y-2 pt-1">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  readOnly
                  value={fullShareUrl}
                  aria-label="Tautan berbagi publik"
                  className="flex-1 min-h-[44px] sm:min-h-[36px] rounded-lg border border-control bg-float px-3 py-1.5 font-mono text-xs text-ink"
                />
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="min-h-[44px] sm:min-h-[36px] rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:opacity-90"
                >
                  {copied ? 'Link Tersalin' : 'Salin Link'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveShare('public', true)}
                  className="min-h-[44px] sm:min-h-[36px] rounded-lg border border-control bg-float px-3 py-1.5 text-xs font-medium text-ink hover:bg-chrome"
                >
                  Reset Link
                </button>
              </div>
              <p className="text-[11px] text-muted">
                Penerima tautan hanya dapat melihat rapat ini saja dan tidak dapat membuka rapat Anda yang lain.
              </p>
            </div>
          )}

          {status && <p role="status" className="text-ink font-medium">{status}</p>}
          {error && <p role="alert" className="text-accent font-medium">{error}</p>}
        </div>
      )}
    </div>
  );
}
