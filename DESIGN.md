# Cakapp Design Direction — Sapphire Blue & Emerald Slate

> **Design Read:** Focused meeting workspace & web portal in a **Sapphire Blue & Emerald Slate** palette matching Cakapp's native brand icon (`#2563EB` C-arc + `#10B981` waveform bars), dial `ENERGY 2 / RHYTHM 2 / MOTION 1`.

## Core Identity & Purpose (antislop R-01, R-06, R-20, R-29, R-31)

- **Why Blue Primary + Green Secondary?** Established brand colors: crisp **Sapphire Blue** (`#2563EB` / `#60A5FA`) drives primary actions (`Start recording`, `Unduh Cakapp Desktop`, active navigation & focus rings), while **Emerald Green** (`#047857` / `#10B981` / `#34D399`) carries audio waveform tracks, synced/verified badges, and live readiness states. Zero orange/terracotta, zero neon purple gradients.
- **Why Elevated Slate Cards on Quiet Grounds?** Light (`#F6F8FB` bg / `#FFFFFF` card) and Dark (`#0B111A` bg / `#161F2E` card) keep distinct surface planes with crisp hairline borders (`#DCE3EE` / `#253247`) so workspaces feel structured rather than empty voids, while staying calm and readable.
- **Why `Bricolage Grotesque` + `Plus Jakarta Sans`?** Expressive headings contrast cleanly against legible sans-serif body text for transcripts and notulen.

## Color Tokens

### Light (Crisp Daylight Slate)
- `--bg`: `#F6F8FB`
- `--chrome`: `#EDF2F8`
- `--card`: `#FFFFFF`
- `--float`: `#FFFFFF`
- `--ink`: `#0F172A`
- `--written`: `#334155`
- `--muted`: `#475569`
- `--line`: `#DCE3EE`
- `--control-border`: `#64748B`
- `--primary`: `#2563EB` (`--primary-ink`: `#FFFFFF`, ratio 5.17:1 AA)
- `--accent`: `#1D4ED8` (`--accent-soft`: `#EBF2FE`)
- `--secondary`: `#047857` (`--secondary-solid`: `#10B981`, `--secondary-soft`: `#ECFDF5`)

### Dark (Deep Slate & Sapphire)
- `--bg`: `#0B111A`
- `--chrome`: `#111824`
- `--card`: `#161F2E`
- `--float`: `#1B2638`
- `--ink`: `#F1F5F9`
- `--written`: `#CBD5E1`
- `--muted`: `#94A3B8`
- `--line`: `#253247`
- `--control-border`: `#556680`
- `--primary`: `#2563EB` (`--primary-ink`: `#FFFFFF`, ratio 5.17:1 AA)
- `--accent`: `#60A5FA` (`--accent-soft`: `#172554`)
- `--secondary`: `#34D399` (`--secondary-solid`: `#10B981`, `--secondary-soft`: `#064E3B`)

## Dials
- **ENERGY 2 (Balanced):** Purposeful split hero with real product waveform/transcript preview; calm desktop cards with quick-action bar when meetings are few.
- **RHYTHM 2 (Structured):** Distinct elevated surfaces + clear hierarchy; no crowded card mosaics.
- **MOTION 1 (Crisp Transitions Only):** Instant state feedback without endless distracting animations.
