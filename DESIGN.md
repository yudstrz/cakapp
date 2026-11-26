# Cakapp Design Direction — Editorial Paper & Ink

> **Design Read:** Reading this as: desktop meeting & note-taking workspace for focused professionals, in an **Editorial Paper & Ink** style, dial `ENERGY 2 / RHYTHM 2 / MOTION 1`.

## Core Identity & Purpose (antislop R-01, R-06, R-20, R-29, R-31)

- **Why Editorial Paper & Ink?** Cakapp's job is reading, writing, and reviewing meeting notes and transcripts. Warm archival paper (light) and warm inkstone (dark) reduce eye strain compared to cold `#18191D`/`#2563EB` generic tech-gray, while giving notes the tactile feel of an editorial notebook.
- **Why Top-Bar + Centered Canvas instead of 3-Column Shell?** Removing the permanent 208px left sidebar and permanent 270px right agenda rail eliminates the generic Electron/Slack clone look and gives meeting notes, transcripts, and Ask conversations an uninterrupted, focused reading surface.
- **Why Terracotta Accent (`#B84A27` / `#DF744F`)?** One warm, grounded accent reserved strictly for the primary action (`Start recording`), active navigation state, live recording indicator, and keyboard focus rings. Zero blue-purple gradients, zero glow-everywhere.
- **Why `Bricolage Grotesque` for Headings?** Bundled in `app/src/renderer/src/assets/bricolage-grotesque.ttf`; its expressive editorial character contrasts cleanly against system sans-serif body text used for long-form transcripts and UI controls.

## Color Tokens

### Light (Warm Archival Paper)
- `--bg`: `#FAF7F2`
- `--chrome`: `#F2EDE4`
- `--card`: `#F4EFE6`
- `--float`: `#FFFDF9`
- `--ink`: `#1C1917`
- `--written`: `#44403C`
- `--muted`: `#6B655E`
- `--line`: `#E5DFD3`
- `--accent`: `#B84A27`
- `--primary`: `#B84A27`
- `--primary-ink`: `#FFFDF9`

### Dark (Warm Inkstone)
- `--bg`: `#171513`
- `--chrome`: `#1F1C19`
- `--card`: `#23201C`
- `--float`: `#2A2622`
- `--ink`: `#F2ECE3`
- `--written`: `#C9C1B6`
- `--muted`: `#A39B91`
- `--line`: `#36312B`
- `--accent`: `#DF744F`
- `--primary`: `#C85732`
- `--primary-ink`: `#FFFDF9`

## Dials
- **ENERGY 2 (Balanced):** Distinct editorial masthead and warm terracotta primary CTA; calm, uncluttered reading surfaces.
- **RHYTHM 2 (Consistent with deliberate breaks):** Top command bar + horizontal folder strip + hairline-divided meeting index; collapsible Agenda drawer on demand rather than a permanent column.
- **MOTION 1 (Hover & crisp state transitions only):** No endless pulses or decorative floating animations.
