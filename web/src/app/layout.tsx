import type { Metadata } from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { getCurrentUser } from '@/lib/auth';
import UserNav from '@/components/UserNav';
import ThemeToggle from '@/components/ThemeToggle';
import ElectronRedirectGuard from '@/components/ElectronRedirectGuard';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Cakapp: Perekam Rapat & Notulen Tanpa Bot',
  description: 'Perekam rapat otomatis tanpa bot dengan transkripsi lokal, pemutar audio sinkron, tautan berbagi tim, dan ringkasan notulen terstruktur.',
};

export const dynamic = 'force-dynamic';

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('cakapp:theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="id" suppressHydrationWarning className={`${bricolage.variable} ${jakarta.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased selection:bg-accent/20 selection:text-ink">
        <header className="sticky top-0 z-50 border-b border-line bg-chrome/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 py-2.5">
            <a href="/" className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight text-ink min-h-[44px] sm:min-h-0">
              <svg className="h-7 w-7 shrink-0 text-accent" viewBox="0 0 100 100" fill="none" aria-hidden="true">
                <path d="M 71.5 23.5 A 31 31 0 1 0 71.5 76.5" stroke="currentColor" strokeWidth="16" strokeLinecap="round" />
                <rect x="42" y="40" width="8.5" height="20" rx="4.25" fill="#10B981" />
                <rect x="56" y="30" width="8.5" height="40" rx="4.25" fill="#10B981" />
                <rect x="70" y="36" width="8.5" height="28" rx="4.25" fill="#10B981" />
              </svg>
              <span>Cakapp</span>
            </a>

            {/* Desktop navigation */}
            <nav className="hidden md:flex items-center gap-5 text-sm font-medium" aria-label="Navigasi Utama">
              <a href="/" className="text-written hover:text-ink transition-colors py-1">
                Beranda
              </a>
              <a href="/download" className="text-written hover:text-ink transition-colors py-1">
                Download
              </a>
              <a href="/dashboard" className="text-written hover:text-ink transition-colors py-1">
                Dashboard
              </a>
              <ThemeToggle />
              <UserNav user={user} />
            </nav>

            {/* Mobile navigation: compact disclosure menu so top bar never overflows on 320px-767px screens */}
            <div className="flex md:hidden items-center gap-2">
              <ThemeToggle />
              <details className="relative">
                <summary className="list-none inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-control bg-float px-3 text-xs font-semibold text-ink cursor-pointer">
                  <span>Menu</span>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </summary>
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-control bg-float p-3 shadow-lg space-y-2 z-50">
                  <a href="/" className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-chrome">
                    Beranda
                  </a>
                  <a href="/download" className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-chrome">
                    Download Desktop
                  </a>
                  <a href="/dashboard" className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-chrome">
                    Dashboard Rapat
                  </a>
                  <div className="pt-2 border-t border-line">
                    <UserNav user={user} />
                  </div>
                </div>
              </details>
            </div>
          </div>
        </header>

        <main>
          <ElectronRedirectGuard />
          {children}
        </main>

        <footer className="border-t border-line bg-chrome/60 py-8 text-xs text-muted">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <p>© {new Date().getFullYear()} Cakapp by Maxy Academy. Perekam rapat privat tanpa bot.</p>
            <div className="flex flex-wrap items-center justify-center gap-5">
              <a href="/download" className="hover:text-ink transition-colors py-1">Download Desktop</a>
              <a href="/dashboard" className="hover:text-ink transition-colors py-1">Portal Rapat</a>
              <a href="https://github.com/yudstrz/cakapp" target="_blank" rel="noreferrer" className="hover:text-ink transition-colors py-1">GitHub</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
