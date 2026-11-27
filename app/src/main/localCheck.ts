import type { Hardware } from '@cakapp/picker'
import { t } from '../shared/i18n'

/**
 * Everything runs on this computer: there is no cloud to fall back on. When no notes model runs well enough here,
 * setup stops with these words instead of downloading anything. A Mac keeps its words and its rule (the picker's).
 * Windows and Linux without graphics the engines can use run whisper on the processor: two voices, live, need at least
 * 4 cores (whisper's 4 threads; with fewer cores than threads it slowed 5 to 200 times). Fewer, and Cakapp says so
 * before downloading anything. That is only a quick first look: the speed check (setup.ts) then times the speech models.
 */
export const MIN_CPU_CORES = 4
export const needsDeferredLiveSpeech = (hw: Hardware): boolean =>
  hw.os !== 'darwin' && hw.gpu.kind === 'none' && hw.cores !== undefined && hw.cores < MIN_CPU_CORES

export function tooWeak(_hw: Hardware, hasPick: boolean): string | null {
  if (hasPick) return null
  return _hw.os === 'darwin'
    ? t('Cakapp needs a Mac with at least 8 GB of memory.')
    : t("Cakapp runs entirely on your computer, and this one isn't strong enough. It needs at least 8 GB of memory.")
}

/**
 * Windows and Linux: the speed check timed every speech model and none keeps up with two voices as they talk. Recording
 * stays off: a live transcript that falls further and further behind would drop what was said. Nothing goes to a cloud.
 */
export function tooSlow(os: string): string {
  return os === 'win32'
    ? t("Cakapp runs entirely on your computer, and this one can't write down a meeting as fast as people talk. Updating your graphics driver may help. Otherwise it needs a faster processor, or graphics it can use.")
    : t("Cakapp runs entirely on your computer, and this one can't write down a meeting as fast as people talk. Installing the driver for your graphics card may help. Otherwise it needs a faster processor, or graphics it can use.")
}
