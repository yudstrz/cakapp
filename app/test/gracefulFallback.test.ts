import { describe, expect, it } from 'vitest'
import { measureSpeed } from '../src/main/asr/speedCheck'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { wavBytes } from '../src/main/asr/transcribe'

describe('Graceful Fallback when whisper-server binary is missing', () => {
  it('returns default RTF (0.5) with gpuOff: true when binary does not exist', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cakapp-test-fallback-'))
    const dummyClip = join(tempDir, 'clip.wav')
    writeFileSync(dummyClip, wavBytes(new Float32Array(16000))) // 1s clip

    const nonExistentBinary = join(tempDir, 'non-existent-whisper-server.exe')
    expect(existsSync(nonExistentBinary)).toBe(false)

    // Call measureSpeed with non-existent binary
    const result = await measureSpeed('/models/fake-model.bin', {
      binary: nonExistentBinary,
      clip: dummyClip,
    })

    expect(result).toEqual({ rtf: 0.5, gpuOff: true })
  })

  it('returns default RTF (0.5) when speed clip does not exist', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cakapp-test-fallback-clip-'))
    const nonExistentClip = join(tempDir, 'non-existent-clip.wav')
    const nonExistentBinary = join(tempDir, 'whisper-server.exe')

    const result = await measureSpeed('/models/fake-model.bin', {
      binary: nonExistentBinary,
      clip: nonExistentClip,
    })

    expect(result).toEqual({ rtf: 0.5, gpuOff: true })
  })
})
