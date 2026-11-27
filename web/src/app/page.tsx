import React from 'react';
import Link from 'next/link';
import AudioPlayer from '@/components/AudioPlayer';
import MeetingNotesView from '@/components/MeetingNotesView';
import DesktopDownloadHub from '@/components/DesktopDownloadHub';
import { SHOWCASE_MEETING } from '@/lib/showcase';

export default function HomePage() {
  const previewLines = SHOWCASE_MEETING.transcripts.slice(0, 2);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Structured 2-Column Hero: clear value + live product preview without clutter */}
      <section className="pt-8 sm:pt-12 pb-8 sm:pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-secondary-soft px-3 py-1 text-xs font-semibold text-secondary">
              <span className="h-2 w-2 rounded-full bg-secondary-solid" aria-hidden="true" />
              <span>Rekam Audio Sistem + Portal Tim Terenkripsi</span>
            </div>

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

            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-written">
              <li className="inline-flex items-center gap-1.5">
                <span className="font-bold text-secondary" aria-hidden="true">✓</span>
                <span>Tanpa peserta bot tambahan</span>
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="font-bold text-secondary" aria-hidden="true">✓</span>
                <span>Whisper lokal &amp; Cloud AI fleksibel</span>
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="font-bold text-secondary" aria-hidden="true">✓</span>
                <span>Link baca &amp; workspace tim</span>
              </li>
            </ul>
          </div>

          <aside
            aria-label="Pratinjau Alur Rapat Cakapp"
            className="lg:col-span-5 rounded-2xl border border-line bg-card p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-line">
              <div className="min-w-0">
                <p className="text-xs text-muted truncate">{SHOWCASE_MEETING.app} · {SHOWCASE_MEETING.language}</p>
                <p className="font-display text-sm font-semibold text-ink truncate">{SHOWCASE_MEETING.title}</p>
              </div>
              <span className="shrink-0 rounded-md bg-secondary-soft px-2 py-0.5 text-[11px] font-semibold text-secondary">
                Tersinkron
              </span>
            </div>

            <div className="rounded-xl border border-line bg-paper p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                  <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                  Suara Saya (Mikrofon)
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                  <span className="h-2 w-2 rounded-full bg-secondary-solid" aria-hidden="true" />
                  Lawan Bicara (Sistem)
                </span>
              </div>
              <div className="flex items-end gap-1 h-8 pt-1" aria-hidden="true">
                {[38, 65, 92, 54, 80, 42, 70, 96, 60, 48, 84, 52, 74, 88, 44, 66].map((pct, i) => (
                  <span
                    key={i}
                    style={{ height: `${pct}%` }}
                    className={`flex-1 rounded-sm ${i % 3 === 1 ? 'bg-secondary-solid' : 'bg-primary'}`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {previewLines.map((line, i) => (
                <div
                  key={line.id}
                  className={`rounded-lg px-3 py-2 text-xs ${
                    i === 0 ? 'border-l-2 border-primary bg-accent-soft text-ink' : 'border border-line bg-paper text-written'
                  }`}
                >
                  <p className="font-semibold text-[11px] text-accent">{line.speaker}</p>
                  <p className="mt-0.5 line-clamp-2 leading-relaxed">{line.text}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 text-xs">
              <span className="text-secondary font-medium">Ringkasan AI &amp; Checklist Siap</span>
              <a href="#contoh-interaktif" className="font-semibold text-accent hover:underline">
                Putar contoh di bawah
              </a>
            </div>
          </aside>
        </div>
      </section>

      {/* OS-Detected Desktop App Download Strip */}
      <section className="pb-10 border-b border-line">
        <DesktopDownloadHub compact />
      </section>

      {/* Interactive Showcase Section */}
      <section id="contoh-interaktif" className="py-10 sm:py-12 border-b border-line space-y-6">
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
