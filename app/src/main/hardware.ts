import os from 'node:os'
import { asrCandidates, pick, pickAsr, type Catalog, type Hardware, type OS } from '@cakapp/picker'
import { realDeps } from './downloader'
import { tooWeak } from './localCheck'
import type { Installed, SpeedResult } from './setup'

export type SysInfo = { platform: string; arch: string; cpuModel: string; totalRamBytes: number; freeDiskGB: number; cores?: number }

/** What the notes engine found (node-llama-cpp): the graphics it can use, their memory, their names. gpuType false: none */
export type GpuProbe = { gpuType: string | false; vramTotalGB: number; unifiedGB: number; gpuNames: string[] }

export type HardwareCheckReport = {
  hardware: {
    os: string
    arch: string
    cpuModel: string
    cores: number
    totalRamGB: number
    freeDiskGB: number
    gpuKind: 'unified' | 'discrete' | 'none'
    gpuName: string
    gpuVramGB: number
  }
  llm: {
    supported: boolean
    recommendedId: string | null
    recommendedName: string | null
    sizeGB: number | null
    estTokPerSec: number | null
    device: 'gpu' | 'split' | 'cpu' | null
    liteMode: boolean
    needsDiskGB: number | null
    installedOnDisk: boolean
  }
  whisper: {
    supported: boolean
    recommendedId: string | null
    recommendedName: string | null
    sizeGB: number | null
    speedRtf: number | null
    gpuOff: boolean
    installedOnDisk: boolean
  }
  recommendation: {
    overall: 'local-optimal' | 'local-lite' | 'cloud-recommended'
    headline: string
    reason: string
    suggestedAiMode: 'local' | 'cloud'
    suggestedSttMode: 'local' | 'cloud'
  }
}

/**
 * A Mac (Apple Silicon) shares memory with its graphics: no probe needed, as always. Windows and Linux ask the notes
 * engine what it can use: a card with its own memory, graphics sharing the memory, or none (also when the
 * check failed or crashed: then the processor alone).
 */
export function toHardware(sys: SysInfo, probe?: GpuProbe | null): Hardware {
  const mac = sys.platform === 'darwin'
  // A card next to graphics built into the processor: node-llama-cpp adds the card's memory to the shared memory, but
  // llama.cpp runs on the card, so it's a card with what's left once the shared part is taken out (#37)
  const ownGB = probe ? probe.vramTotalGB - probe.unifiedGB : 0
  const kind = mac ? 'unified' : !probe?.gpuType ? 'none' : probe.unifiedGB > 0 && ownGB < 2 ? 'unified' : 'discrete'
  return {
    os: sys.platform as OS,
    arch: sys.arch,
    cpuModel: sys.cpuModel,
    totalRamGB: Math.round((sys.totalRamBytes / 1e9) * 10) / 10,
    freeDiskGB: Math.round(sys.freeDiskGB * 10) / 10,
    gpu: mac ? { kind, name: sys.cpuModel, vramGB: 0 }
      : { kind, name: kind === 'none' ? '' : probe?.gpuNames[0] ?? '', vramGB: kind === 'none' ? 0 : Math.round((kind === 'discrete' ? ownGB : probe?.vramTotalGB ?? 0) * 10) / 10 },
    ...(!mac && sys.cores ? { cores: sys.cores } : {}),
  }
}

export async function readSysInfo(diskDir: string): Promise<SysInfo> {
  return {
    platform: process.platform, arch: process.arch,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    cores: os.availableParallelism(),
    totalRamBytes: os.totalmem(),
    freeDiskGB: await realDeps.freeDiskGB(diskDir),
  }
}

/** Evaluate CPU/RAM/GPU/Disk + stored Whisper speed benchmark and recommend Local vs Cloud modes. */
export function evaluateHardwareReport(
  hw: Hardware,
  catalog: Catalog,
  speed?: SpeedResult,
  installed?: Installed,
): HardwareCheckReport {
  const llmPick = pick(hw, catalog.models)
  const rec = llmPick.recommended
  const weakReason = tooWeak(hw, !!rec)

  const asrChoice = pickAsr(hw, catalog)
  const speedBlockedAll = speed?.model === null
  const cpuTooFewCores = hw.os !== 'darwin' && hw.gpu.kind === 'none' && (hw.cores ?? 0) < 4
  const candidates = hw.os === 'darwin' ? [asrChoice.model] : asrCandidates(hw, catalog)
  const whisperRec =
    speedBlockedAll || cpuTooFewCores
      ? null
      : (speed?.model ? catalog.asr.find((a) => a.id === speed.model) : null) ?? candidates[0] ?? asrChoice.model
  const speedRtf = whisperRec && speed?.rtf ? (speed.rtf[whisperRec.id] ?? null) : null
  const whisperSupported = !!whisperRec && !speedBlockedAll && !cpuTooFewCores

  const hasEnoughDisk = rec ? rec.needsDiskGB === 0 : false
  let overall: HardwareCheckReport['recommendation']['overall']
  let headline: string
  let reason: string
  let suggestedAiMode: 'local' | 'cloud'
  let suggestedSttMode: 'local' | 'cloud'

  if (weakReason || !rec || !whisperSupported) {
    overall = 'cloud-recommended'
    headline = 'Disarankan Pakai Cloud AI & Cloud STT'
    if (hw.totalRamGB < 8) {
      reason = `RAM ${hw.totalRamGB} GB berada di bawah syarat minimal 8 GB untuk model AI lokal. Gunakan Cloud AI agar pembuatan notulen dan transkrip tetap lancar tanpa memberatkan laptop.`
    } else if (speedBlockedAll) {
      reason = 'Uji kecepatan Whisper lokal di perangkat ini terlalu lambat untuk percakapan live. Disarankan memakai Cloud STT (Gemini atau OpenAI).'
    } else if (cpuTooFewCores) {
      reason = `Prosesor memiliki ${hw.cores ?? 0} core tanpa GPU yang didukung (butuh minimal 4 core CPU untuk Whisper live). Gunakan Cloud STT (Gemini/OpenAI) sebagai default.`
    } else {
      reason = 'Spesifikasi perangkat belum memenuhi syarat nyaman untuk model AI offline. Mode Cloud AI disarankan agar rapat tetap berjalan ringan.'
    }
    suggestedAiMode = 'cloud'
    suggestedSttMode = 'cloud'
  } else if (llmPick.liteMode || !hasEnoughDisk || (hw.gpu.kind === 'none' && hw.totalRamGB < 16)) {
    overall = 'local-lite'
    headline = 'Bisa AI Lokal Ringan / Hybrid Cloud AI'
    const diskNote = hasEnoughDisk
      ? ''
      : ` Ruang disk bebas (${hw.freeDiskGB} GB) perlu tambahan ~${rec.needsDiskGB} GB untuk menyimpan model offline dengan aman.`
    reason = `Perangkat (${hw.totalRamGB} GB RAM, ${hw.cores ?? '-'} core${hw.gpu.kind === 'none' ? ', CPU saja' : `, GPU ${hw.gpu.name}`}) bisa menjalankan ${rec.model.name} (~${rec.estTokPerSec} tok/d) & ${whisperRec.name}. Untuk respons instan atau hemat baterai, Cloud AI juga sangat cocok.${diskNote}`
    suggestedAiMode = hasEnoughDisk ? 'local' : 'cloud'
    suggestedSttMode = speedRtf !== null && speedRtf > 0.8 ? 'cloud' : 'local'
  } else {
    overall = 'local-optimal'
    headline = 'Sangat Direkomendasikan untuk AI Lokal (Offline)'
    reason = `Spesifikasi (${hw.totalRamGB} GB RAM${hw.gpu.kind !== 'none' ? `, GPU ${hw.gpu.name}${hw.gpu.vramGB > 0 ? ` ${hw.gpu.vramGB} GB VRAM` : ''}` : ''}) mumpuni untuk ${rec.model.name} (${rec.build.sizeGB} GB, est. ~${rec.estTokPerSec} tok/d) dan ${whisperRec.name} secara offline gratis.`
    suggestedAiMode = 'local'
    suggestedSttMode = 'local'
  }

  return {
    hardware: {
      os: hw.os,
      arch: hw.arch,
      cpuModel: hw.cpuModel,
      cores: hw.cores ?? 0,
      totalRamGB: hw.totalRamGB,
      freeDiskGB: hw.freeDiskGB,
      gpuKind: hw.gpu.kind,
      gpuName: hw.gpu.name,
      gpuVramGB: hw.gpu.vramGB,
    },
    llm: {
      supported: !!rec && !weakReason,
      recommendedId: rec?.model.id ?? null,
      recommendedName: rec?.model.name ?? null,
      sizeGB: rec?.build.sizeGB ?? null,
      estTokPerSec: rec?.estTokPerSec ?? null,
      device: rec?.device ?? null,
      liteMode: llmPick.liteMode,
      needsDiskGB: rec?.needsDiskGB ?? null,
      installedOnDisk: !!(installed?.recommendedLlm || installed?.llm),
    },
    whisper: {
      supported: whisperSupported,
      recommendedId: whisperRec?.id ?? null,
      recommendedName: whisperRec?.name ?? null,
      sizeGB: whisperRec?.sizeGB ?? null,
      speedRtf,
      gpuOff: !!speed?.gpuOff,
      installedOnDisk: !!installed?.asr,
    },
    recommendation: {
      overall,
      headline,
      reason,
      suggestedAiMode,
      suggestedSttMode,
    },
  }
}
