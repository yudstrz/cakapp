'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserProfile } from '@/lib/auth';
import { authClient } from '@/lib/auth-client';

export default function UserNav({ user }: { user: UserProfile | null }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await authClient.signOut();
      router.push('/');
      router.refresh();
    } catch {
      // Ignore signout error.
    } finally {
      setLoggingOut(false);
    }
  }

  if (user) {
    const initial = user.full_name ? user.full_name[0].toUpperCase() : 'U';
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-ink">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/15 text-[11px] font-semibold text-accent">
            {initial}
          </span>
          <span className="max-w-[110px] truncate font-medium">{user.full_name}</span>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="min-h-[44px] sm:min-h-[36px] rounded-lg border border-control bg-float px-3 py-1.5 text-xs font-medium text-ink hover:bg-chrome transition-colors"
        >
          {loggingOut ? 'Keluar...' : 'Keluar'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href="/login"
        className="inline-flex min-h-[44px] sm:min-h-[36px] items-center justify-center rounded-lg border border-control bg-float px-3 py-1.5 text-xs font-medium text-ink hover:bg-chrome transition-colors"
      >
        Masuk
      </a>
      <a
        href="/register"
        className="inline-flex min-h-[44px] sm:min-h-[36px] items-center justify-center rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-ink hover:opacity-90 transition-opacity"
      >
        Daftar Akun
      </a>
    </div>
  );
}
