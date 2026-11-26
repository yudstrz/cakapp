import lightIcon from '../../../../build/icon.png'
import { C_ARC, WAVE_BARS } from '../../../shared/logo'

/** The Cakapp monogram "C" + waveform mark. */
export function Logo({ size = 28, className = 'text-accent' }: { size?: number; className?: string }) {
  return (
    <svg data-testid="logo" role="img" aria-label="Cakapp" width={size} height={size} viewBox="0 0 100 100" className={`shrink-0 ${className}`}>
      <path d={C_ARC} fill="none" stroke="currentColor" strokeWidth="16" strokeLinecap="round" />
      {WAVE_BARS.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.width} height={b.height} rx={b.rx} fill="#10B981" />
      ))}
    </svg>
  )
}

/** The mark with the name next to it. Sized by its height. */
export function Wordmark({ height = 32 }: { height?: number }) {
  return (
    <svg data-testid="wordmark" role="img" aria-label="Cakapp" height={height} width={(height * 286) / 80} viewBox="0 0 286 80" className="shrink-0">
      <g transform="translate(4 7.5) scale(.65)">
        <path d={C_ARC} fill="none" stroke="var(--accent)" strokeWidth="16" strokeLinecap="round" />
        {WAVE_BARS.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.width} height={b.height} rx={b.rx} fill="#10B981" />
        ))}
      </g>
      <text className="text-ink" fill="currentColor" x="82" y="57" fontFamily="Arial, sans-serif" fontSize="52" fontWeight="700" letterSpacing="-1">Cakapp</text>
    </svg>
  )
}

/** The app tile used by the call prompt and its onboarding illustration. */
export function AppIcon({ className }: { className: string }) {
  return <picture className={className}>
    <source media="(prefers-color-scheme: dark)" srcSet="./favicon-dark.png" />
    <img src={lightIcon} alt="" className="size-full" />
  </picture>
}
