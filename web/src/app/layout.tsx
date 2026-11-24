import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cakapp — AI Meeting Recorder & Smart Intelligence',
  description: 'Perekam rapat otomatis tanpa bot dengan transkripsi AI instan, ringkasan rapat, dan pemutar audio interaktif mirip Fathom.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <a href="/" className="flex items-center gap-2.5 font-bold text-xl tracking-tight text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/25">
                🎙️
              </span>
              <span>Cakapp<span className="text-blue-400">.ai</span></span>
            </a>
            <nav className="flex items-center gap-6 text-sm font-medium">
              <a href="/dashboard" className="text-slate-300 transition-colors hover:text-white">
                Dashboard
              </a>
              <a href="/download" className="text-slate-300 transition-colors hover:text-white">
                Download App
              </a>
              <a
                href="/download"
                className="rounded-lg bg-blue-600 px-4 py-2 text-white font-medium shadow-md transition-all hover:bg-blue-500 hover:shadow-blue-500/25"
              >
                Unduh Gratis
              </a>
            </nav>
          </div>
        </header>

        <main>{children}</main>

        <footer className="border-t border-slate-800 bg-slate-900/40 py-10 text-center text-sm text-slate-500">
          <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p>© {new Date().getFullYear()} Cakapp.ai — Enterprise Meeting Intelligence & No-Bot Recording.</p>
            <div className="flex gap-6">
              <a href="/download" className="hover:text-slate-300">Download PC</a>
              <a href="/dashboard" className="hover:text-slate-300">Portal Rapat</a>
              <a href="https://github.com/yudstrz/cakapp" target="_blank" rel="noreferrer" className="hover:text-slate-300">GitHub</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
