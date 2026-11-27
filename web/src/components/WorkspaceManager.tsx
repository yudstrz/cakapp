'use client';

import React, { useCallback, useEffect, useState } from 'react';

interface WorkspaceMember {
  workspace_id: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
}

interface WorkspaceInfo {
  id: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
  members: WorkspaceMember[];
}

export default function WorkspaceManager() {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsName, setWsName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'viewer' | 'editor' | 'owner'>('viewer');
  const [selectedWs, setSelectedWs] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/workspaces');
      if (resp.ok) {
        const data = (await resp.json()) as { workspaces?: WorkspaceInfo[] };
        const list = data.workspaces ?? [];
        setWorkspaces(list);
        if (list.length > 0 && !list.some((w) => w.id === selectedWs)) {
          setSelectedWs(list[0].id);
        }
      }
    } catch {
      setError('Gagal memuat daftar workspace tim.');
    } finally {
      setLoading(false);
    }
  }, [selectedWs]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (wsName.trim().length < 2) return;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const resp = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wsName.trim() }),
      });
      const data = (await resp.json()) as { id?: string; error?: { message?: string } };
      if (!resp.ok) {
        setError(data.error?.message || 'Gagal membuat workspace.');
        return;
      }
      setWsName('');
      if (data.id) setSelectedWs(data.id);
      setFeedback('Workspace tim berhasil dibuat.');
      await loadWorkspaces();
    } catch {
      setError('Kendala jaringan saat membuat workspace.');
    } finally {
      setBusy(false);
    }
  }

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWs || !inviteEmail.trim()) return;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const resp = await fetch('/api/workspaces/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: selectedWs,
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const data = (await resp.json()) as { error?: { message?: string } };
      if (!resp.ok) {
        setError(data.error?.message || 'Gagal mengundang anggota.');
        return;
      }
      setInviteEmail('');
      setFeedback('Anggota tim ditambahkan dengan hak akses terpilih.');
      await loadWorkspaces();
    } catch {
      setError('Kendala jaringan saat menambahkan anggota.');
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(workspaceId: string, email: string) {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const resp = await fetch('/api/workspaces/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, email }),
      });
      if (!resp.ok) {
        setError('Gagal menghapus anggota.');
        return;
      }
      await loadWorkspaces();
    } catch {
      setError('Kendala jaringan.');
    } finally {
      setBusy(false);
    }
  }

  const activeWs = workspaces.find((w) => w.id === selectedWs);

  return (
    <details className="rounded-2xl border border-line bg-card p-5">
      <summary className="cursor-pointer select-none font-display text-sm sm:text-base font-semibold text-ink py-1">
        Workspace Tim & Hak Akses (Owner / Editor / Viewer)
      </summary>

      <div className="mt-4 pt-4 border-t border-line space-y-5 text-xs">
        {loading && <p className="text-muted">Memuat daftar workspace...</p>}

        <form onSubmit={(e) => void createWorkspace(e)} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="Nama workspace baru (misal: Tim Produk)"
            aria-label="Nama workspace baru"
            className="flex-1 min-h-[44px] rounded-xl border border-control bg-float px-3 py-2 text-xs text-ink placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={busy || wsName.trim().length < 2}
            className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-ink hover:opacity-90 disabled:opacity-50"
          >
            Buat Workspace
          </button>
        </form>

        {workspaces.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="ws-select" className="font-medium text-ink">
                Workspace Aktif:
              </label>
              <select
                id="ws-select"
                value={selectedWs}
                onChange={(e) => setSelectedWs(e.target.value)}
                className="min-h-[44px] sm:min-h-[36px] rounded-lg border border-control bg-float px-3 py-1.5 text-xs text-ink"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.role})
                  </option>
                ))}
              </select>
            </div>

            {activeWs && activeWs.role === 'owner' && (
              <form onSubmit={(e) => void inviteMember(e)} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Email anggota tim..."
                  aria-label="Email anggota tim"
                  className="flex-1 min-h-[44px] rounded-xl border border-control bg-float px-3 py-2 text-xs text-ink placeholder:text-muted"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'viewer' | 'editor' | 'owner')}
                  aria-label="Peran anggota"
                  className="min-h-[44px] rounded-xl border border-control bg-float px-3 py-2 text-xs text-ink"
                >
                  <option value="viewer">Viewer (Hanya Baca)</option>
                  <option value="editor">Editor (Edit Notulen)</option>
                  <option value="owner">Owner (Penuh)</option>
                </select>
                <button
                  type="submit"
                  disabled={busy || !inviteEmail.trim()}
                  className="min-h-[44px] rounded-xl border border-control bg-float px-4 py-2 text-xs font-semibold text-ink hover:bg-chrome"
                >
                  Tambah Anggota
                </button>
              </form>
            )}

            {activeWs && activeWs.members.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-line bg-float">
                {activeWs.members.map((m) => (
                  <li key={m.email} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate">{m.email}</p>
                      <p className="text-[11px] text-muted uppercase">{m.role}</p>
                    </div>
                    {activeWs.role === 'owner' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeMember(activeWs.id, m.email)}
                        className="min-h-[36px] rounded-lg border border-control bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-chrome"
                      >
                        Hapus
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {feedback && <p role="status" className="text-ink font-medium">{feedback}</p>}
        {error && <p role="alert" className="text-accent font-medium">{error}</p>}
      </div>
    </details>
  );
}
