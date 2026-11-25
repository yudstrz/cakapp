import type { Metadata } from 'next';
import './globals.css';
import { getCurrentUser } from '@/lib/auth';
import UserNav from '@/components/UserNav';

export const metadata: Metadata = {
  title: 'Cakapp — AI Meeting Recorder & Smart Intelligence',
  description: 'Perekam rapat otomatis tanpa bot dengan transkripsi suara instan, ringkasan terstruktur, dan pemutar audio interaktif.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="id">
      <body className="min-h-screen bg-[#09090b] text-zinc-100 antialiased selection:bg-zinc-800 selection:text-white">
        <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#09090b]/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3.5">
            <a href="/" className="flex items-center gap-2.5 font-semibold text-lg tracking-tight text-zinc-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-200">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              </span>
              <span>Cakapp<span className="text-zinc-400 font-normal">.ai</span></span>
            </a>

            <nav className="flex items-center gap-3 sm:gap-5 text-sm font-medium">
              <a href="/dashboard" className="text-zinc-400 transition-colors hover:text-zinc-100 py-1">
                Dashboard
              </a>
              <a href="/download" className="text-zinc-400 transition-colors hover:text-zinc-100 py-1">
                Download App
              </a>
              <UserNav user={user} />
            </nav>
          </div>
        </header>

        <main>{children}</main>

        <footer className="border-t border-zinc-800/80 bg-zinc-950/60 py-8 text-xs text-zinc-500">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <p>© {new Date().getFullYear()} Cakapp.ai. Perekaman audio rapat privat tanpa bot.</p>
            <div className="flex gap-5">
              <a href="/download" className="hover:text-zinc-300 transition-colors">Download PC</a>
              <a href="/dashboard" className="hover:text-zinc-300 transition-colors">Portal Rapat</a>
              <a href="https://github.com/yudstrz/cakapp" target="_blank" rel="noreferrer" className="hover:text-zinc-300 transition-colors">GitHub</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
