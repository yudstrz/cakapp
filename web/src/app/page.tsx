import React from 'react';
import Link from 'next/link';
import AudioPlayer from '@/components/AudioPlayer';
import MeetingNotesView from '@/components/MeetingNotesView';
import DesktopDownloadHub from '@/components/DesktopDownloadHub';
import { SHOWCASE_MEETING } from '@/lib/showcase';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      {/* Asymmetric Editorial Hero */}
      <section className="pt-10 sm:pt-16 pb-10 sm:pb-14">
        <div className="max-w-3xl space-y-5">
          <h1 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-ink leading-[1.12]">
            Rekam rapat tanpa bot, baca notulen dan putar transkrip dari mana saja.
          </h1>

          <p className="text-sm sm:text-base text-written leading-relaxed max-w-2xl">
            Cakapp merekam audio rapat Zoom, Google Meet, dan Microsoft Teams langsung dari audio sistem komputer Anda. Transkrip tersinkron dengan rekaman suara di portal web, siap dibagikan ke tim atau klien melalui satu tautan.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <Link
              href="/download"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-ink hover:opacity-90 transition-opacity"
            >
              Unduh Cakapp Desktop
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-control bg-float px-6 py-2.5 text-sm font-semibold text-ink hover:bg-chrome transition-colors"
            >
              Buka Dashboard Rapat
            </Link>
          </div>
        </div>
      </section>

      {/* OS-Detected Desktop App Download Strip */}
      <section className="pb-12 border-b border-line">
        <DesktopDownloadHub compact />
      </section>

      {/* Interactive Showcase Section */}
      <section className="py-12 border-b border-line space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">
              Contoh Rapat Interaktif
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
              Pemutar Audio & Transkrip Sinkron
            </h2>
            <p className="text-xs sm:text-sm text-written max-w-xl">
              Putar rekaman percakapan dwibahasa di bawah. Teks tersorot mengikuti audio yang diputar dan dapat diklik untuk melompat ke detik tersebut.
            </p>
          </div>
          <Link
            href="/dashboard/meetings/showcase-demo"
            className="inline-flex min-h-[44px] sm:min-h-[38px] items-center justify-center rounded-xl border border-control bg-float px-4 py-2 text-xs font-semibold text-ink hover:bg-chrome transition-colors shrink-0"
          >
            Buka Tampilan Penuh
          </Link>
        </div>

        <div className="rounded-xl border border-line bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 mb-1.5 text-xs text-muted">
            <span className="font-medium text-ink">{SHOWCASE_MEETING.app}</span>
            <span>·</span>
            <span>{SHOWCASE_MEETING.language}</span>
            <span>·</span>
            <span>Durasi 37 detik</span>
          </div>
          <h3 className="font-display font-semibold text-base sm:text-lg text-ink">
            {SHOWCASE_MEETING.title}
          </h3>
          <p className="text-xs text-written mt-0.5">
            Peserta: Budi Santoso (Product Manager), Sarah Wijaya (Tech Lead)
          </p>
        </div>

        <AudioPlayer
          audioUrl={SHOWCASE_MEETING.audioUrl || '/audio/showcase.wav'}
          transcripts={SHOWCASE_MEETING.transcripts}
          durationMs={SHOWCASE_MEETING.duration_ms}
        />

        <div className="rounded-2xl border border-line bg-float p-5 sm:p-7">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-line">
            <h3 className="font-display text-base sm:text-lg font-semibold text-ink">
              Ringkasan & Tindak Lanjut Rapat
            </h3>
            <span className="text-xs text-muted">Contoh Notulen</span>
          </div>
          <MeetingNotesView content={SHOWCASE_MEETING.notes.enhanced} />
        </div>
      </section>

      {/* Varied Editorial Breakdown (two asymmetric columns instead of 3 template cards) */}
      <section className="py-12 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        <div className="md:col-span-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            Cara Kerja Cakapp
          </p>
          <h2 className="font-display text-2xl font-semibold text-ink">
            Rekam lokal di perangkat, kolaborasi lewat web portal.
          </h2>
          <p className="text-sm text-written leading-relaxed">
            Audio mentah tetap berada di komputer Anda secara bawaan. Hanya notulen, transkrip, atau audio yang sengaja dibagikan yang tersinkron ke ruang kerja tim.
          </p>
        </div>

        <dl className="md:col-span-7 divide-y divide-line rounded-2xl border border-line bg-card px-5">
          <div className="py-4">
            <dt className="text-sm font-semibold text-ink">Perekam audio sistem tanpa bot</dt>
            <dd className="mt-1 text-xs sm:text-sm text-written leading-relaxed">
              Menangkap mikrofon dan suara panggilan lewat driver OS (WASAPI di Windows, CoreAudio di macOS) sehingga tidak ada peserta bot tambahan di panggilan Anda.
            </dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-semibold text-ink">Tautan berbagi aman & peran tim</dt>
            <dd className="mt-1 text-xs sm:text-sm text-written leading-relaxed">
              Pilih akses Private, Team Workspace dengan peran Owner/Editor/Viewer, atau tautan web publik read-only untuk klien tanpa perlu login.
            </dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-semibold text-ink">Pencarian & tanya-jawab lintas rapat</dt>
            <dd className="mt-1 text-xs sm:text-sm text-written leading-relaxed">
              Cari keputusan masa lalu dan ajukan pertanyaan di dashboard web dengan rujukan tautan ke rapat aslinya.
            </dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-semibold text-ink">Perekam rapat tatap muka di ponsel</dt>
            <dd className="mt-1 text-xs sm:text-sm text-written leading-relaxed">
              Buka dashboard dari browser Android atau iPhone untuk merekam diskusi tatap muka langsung dan mengubahnya menjadi notulen.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
