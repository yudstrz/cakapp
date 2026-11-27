import { describe, expect, it } from 'vitest'
import { evaluateHardwareReport } from '../src/main/hardware'
import { loadCatalog } from '../src/main/catalog'
import bundledCatalog from '../../catalog/catalog.json'
import licenses from '../../catalog/licenses.json'

const catalog = loadCatalog({ bundled: bundledCatalog, licenses })

describe('evaluateHardwareReport', () => {
  it('recommends local-optimal for PC with 16 GB RAM and discrete 8 GB GPU', () => {
    const rep = evaluateHardwareReport(
      {
        os: 'win32',
        arch: 'x64',
        cpuModel: 'AMD Ryzen 7 7800X3D',
        cores: 16,
        totalRamGB: 16,
        freeDiskGB: 120,
        gpu: { kind: 'discrete', name: 'NVIDIA GeForce RTX 4060', vramGB: 8 },
      },
      catalog,
    )

    expect(rep.recommendation.overall).toBe('local-optimal')
    expect(rep.recommendation.suggestedAiMode).toBe('local')
    expect(rep.recommendation.suggestedSttMode).toBe('local')
    expect(rep.llm.supported).toBe(true)
    expect(rep.llm.recommendedId).toBeTruthy()
    expect(rep.whisper.supported).toBe(true)
    expect(rep.whisper.recommendedId).toBe('whisper-large-v3-turbo-q5_0')
  })

  it('recommends cloud-recommended for low RAM (< 8 GB) or < 4 CPU cores without GPU', () => {
    const lowRam = evaluateHardwareReport(
      {
        os: 'win32',
        arch: 'x64',
        cpuModel: 'Intel Core i3-10110U',
        cores: 4,
        totalRamGB: 4,
        freeDiskGB: 50,
        gpu: { kind: 'none', name: '', vramGB: 0 },
      },
      catalog,
    )
    expect(lowRam.recommendation.overall).toBe('cloud-recommended')
    expect(lowRam.recommendation.suggestedAiMode).toBe('cloud')
    expect(lowRam.recommendation.suggestedSttMode).toBe('cloud')

    const timedOutSpeech = evaluateHardwareReport(
      {
        os: 'win32',
        arch: 'x64',
        cpuModel: 'Intel Core i5',
        cores: 6,
        totalRamGB: 16,
        freeDiskGB: 80,
        gpu: { kind: 'none', name: '', vramGB: 0 },
      },
      catalog,
      { key: 'test', model: null, rtf: { 'whisper-small-q5_1': null }, at: Date.now() },
    )
    expect(timedOutSpeech.recommendation.overall).toBe('cloud-recommended')
    expect(timedOutSpeech.whisper.supported).toBe(false)
    expect(timedOutSpeech.recommendation.suggestedSttMode).toBe('cloud')
  })

  it('suggests local-lite or cloud when RAM is 8-12 GB CPU-only without discrete GPU', () => {
    const midCpu = evaluateHardwareReport(
      {
        os: 'win32',
        arch: 'x64',
        cpuModel: 'Intel Core i5-1235U',
        cores: 10,
        totalRamGB: 12,
        freeDiskGB: 60,
        gpu: { kind: 'none', name: '', vramGB: 0 },
      },
      catalog,
    )
    expect(['local-lite', 'cloud-recommended']).toContain(midCpu.recommendation.overall)
    expect(midCpu.whisper.recommendedId).not.toBe('whisper-large-v3-turbo-q5_0')
  })
})
