import React from 'react';
import Link from 'next/link';
import { getDb } from '@/lib/neon';
import { getCurrentUser } from '@/lib/auth';
import { ensurePortalSchema } from '@/lib/meetings';
import WebAudioStudioCard from '@/components/WebAudioStudioCard';
import DesktopAppBanner from '@/components/DesktopAppBanner';
import DashboardSearchAsk from '@/components/DashboardSearchAsk';
import WorkspaceManager from '@/components/WorkspaceManager';

export const revalidate = 0;

interface DashboardMeetingRow {
  id: string;
  user_id: string | null;
  title: string;
  started_at: string | number;
  ended_at: string | number | null;
  language: string | null;
  app: string | null;
  role: string;
  excerpt: string;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  let userMeetings: DashboardMeetingRow[] = [];
  let isConfigured = true;
  let statusNotice = '';

  const sql = getDb();
  if (!sql) {
    isConfigured = false;
    statusNotice = 'DATABASE_URL belum ditambahkan di menu Environment Variables Vercel.';
  } else if (user) {
    try {
      await ensurePortalSchema(sql);
      const email = (user.email || '').trim().toLowerCase();
      userMeetings = (await sql`
        SELECT DISTINCT m.id, m.user_id, m.title, m.started_at, m.ended_at, m.language, m.app,
          CASE WHEN m.user_id = ${user.id} THEN 'owner' ELSE COALESCE(wm.role, 'viewer') END AS role,
          LEFT(COALESCE(n.enhanced, n.mine, ''), 220) AS excerpt
        FROM meetings m
        LEFT JOIN notes n ON n.meeting_id = m.id
        LEFT JOIN workspace_members wm
          ON wm.workspace_id = m.workspace_id
         AND (wm.user_id = ${user.id} OR (${email} <> '' AND lower(wm.email) = ${email}))
        WHERE m.user_id = ${user.id}
           OR (COALESCE(m.share_mode, 'private') = 'workspace' AND wm.workspace_id IS NOT NULL)
        ORDER BY m.started_at DESC
        LIMIT 30
      `) as DashboardMeetingRow[];
    } catch (err: unknown) {
      statusNotice = err instanceof Error ? err.message : 'Gagal memuat data dari database cloud.';
    }
  }

  const hasDesktopMeetings = userMeetings.some((m) => m.app !== 'Audio Web');

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-line">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
              Dashboard Rapat
            </h1>
            {user && (
              <span className="rounded-md border border-line bg-card px-2.5 py-0.5 text-xs font-medium text-written">
                {user.email}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-written">
            {user
              ? `Selamat datang, ${user.full_name}. Kelola rekaman rapat, transkrip, dan tautan berbagi tim di sini.`
              : 'Portal pemutar rekaman audio, transkrip sinkron, dan notulen rapat.'}
          </p>
        </div>

        <Link
          href="/download"
          className="inline-flex min-h-[44px] sm:min-h-[38px] items-center justify-center rounded-xl border border-control bg-float px-4 py-2 text-xs font-semibold text-ink hover:bg-chrome transition-colors shrink-0"
        >
          Unduh Desktop Recorder
        </Link>
      </div>

      {!isConfigured && (
        <div role="alert" className="mt-6 rounded-xl border border-line bg-card p-4 text-xs text-ink">
          <p className="font-semibold mb-1">Perhatian Konfigurasi Database</p>
          <p className="text-written">{statusNotice}</p>
        </div>
      )}

      {!user && (
        <div className="mt-8 space-y-6">
          <div className="rounded-2xl border border-line bg-card p-6 sm:p-8 text-center max-w-xl mx-auto">
            <h2 className="font-display text-lg sm:text-xl font-semibold text-ink">
              Akses Ruang Rapat Pribadi & Tim
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-written leading-relaxed">
              Masuk atau daftar akun untuk melihat riwayat rapat yang tersinkronisasi dari desktop, merekam rapat tatap muka dari ponsel, dan membagikan link notulen.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center rounded-xl border border-control bg-float px-5 py-2 text-xs font-semibold text-ink hover:bg-chrome transition-colors"
              >
                Masuk ke Akun
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-ink hover:opacity-90 transition-opacity"
              >
                Daftar Akun Baru
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-float p-4 text-center max-w-xl mx-auto">
            <p className="text-xs text-written">
              Ingin mencoba pemutar audio karaoke & notulen tanpa login?{' '}
              <Link href="/dashboard/meetings/showcase-demo" className="font-semibold text-accent hover:underline">
                Buka Contoh Showcase
              </Link>
            </p>
          </div>
        </div>
      )}

      {user && (
        <div className="mt-8 space-y-8">
          <DesktopAppBanner hasDesktopMeetings={hasDesktopMeetings} />
          <WebAudioStudioCard />
          <DashboardSearchAsk initialMeetings={userMeetings} />
          <WorkspaceManager />

          <div className="rounded-xl border border-line bg-float p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span className="text-written">
              Contoh pemutar audio karaoke dan notulen interaktif tersedia pada halaman Showcase Demo.
            </span>
            <Link
              href="/dashboard/meetings/showcase-demo"
              className="font-semibold text-accent hover:underline shrink-0 py-1"
            >
              Buka Notulen Showcase
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
