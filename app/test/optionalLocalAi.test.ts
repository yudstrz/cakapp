import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Catalog, Hardware } from '@Cakapp/picker'
import bundled from '../../catalog/catalog.json'
import { SetupController } from '../src/main/setup'
import { fakeDownloadDeps } from '../src/main/fake'
import type { DownloadDeps } from '../src/main/downloader'

const catalog = bundled as unknown as Catalog
const m1max: Hardware = {
  os: 'darwin',
  arch: 'arm64',
  cpuModel: 'Apple M1 Max',
  totalRamGB: 32,
  freeDiskGB: 500,
  gpu: { kind: 'unified', name: 'Apple M1 Max', vramGB: 24 },
}

describe('Optional local notes AI download', () => {
  it('skips downloading local LLM notes model when notesPreference.load() returns true (Cloud AI mode)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cakapp-skip-notes-'))
    try {
      const asked: string[] = []
      const inner = fakeDownloadDeps({ stepMs: 0 })
      const deps: DownloadDeps = {
        ...inner,
        download: async (url, d, file, onProgress, signal) => {
          asked.push(url)
          return inner.download(url, d, file, onProgress, signal)
        },
      }

      const ctrl = new SetupController({
        modelsDir: dir,
        getHardware: async () => m1max,
        getCatalog: async () => catalog,
        download: deps,
        sha256Override: 'FAKE',
        notesPreference: {
          load: () => true,
          save: () => {},
        },
      })

      await ctrl.start()
      expect(ctrl.state.phase).toBe('ready')
      expect(ctrl.state.notesDownloading).toBeUndefined()
      expect(ctrl.notesPath()).toBeUndefined()
      expect(asked.some(u => u.includes('gemma') || u.includes('Qwen'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('cancels active local LLM download immediately when skipNotesDownload() is called', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cakapp-cancel-notes-'))
    try {
      let savedSkip = false
      const ctrl = new SetupController({
        modelsDir: dir,
        getHardware: async () => m1max,
        getCatalog: async () => catalog,
        download: fakeDownloadDeps({ stepMs: 50 }),
        sha256Override: 'FAKE',
        notesPreference: {
          load: () => savedSkip,
          save: (v) => { savedSkip = v },
        },
      })

      await ctrl.start()
      expect(ctrl.state.phase).toBe('ready')
      await ctrl.skipNotesDownload()
      expect(savedSkip).toBe(true)
      expect(ctrl.state.notesDownloading).toBeUndefined()
      expect(ctrl.state.notesFraction).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
