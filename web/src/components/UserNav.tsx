'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserProfile } from '@/lib/auth';

export default function UserNav({ user }: { user: UserProfile | null }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
      router.refresh();
    } catch {
      // ignore
    } finally {
      setLoggingOut(false);
    }
  }

  if (user) {
    const initial = user.full_name ? user.full_name[0].toUpperCase() : 'U';
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-semibold text-zinc-100">
            {initial}
          </span>
          <span className="max-w-[120px] truncate font-medium">{user.full_name}</span>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
        >
          {loggingOut ? '...' : 'Keluar'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href="/login"
        className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
      >
        Login
      </a>
      <a
        href="/register"
        className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-white transition-colors"
      >
        Register
      </a>
    </div>
  );
}
