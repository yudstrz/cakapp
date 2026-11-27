import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSettings, updateSettings } from '../src/main/settings'
import { openStore, type Store } from '../src/main/store'
import { SyncEngine } from '../src/main/syncEngine'
import * as neonModule from '../src/main/neon'

describe('Cloud Audio Opt-In Setting & Sync', () => {
  let dir: string
  let store: Store

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cakapp-cloud-audio-'))
    store = openStore(':memory:')
  })

  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('keeps cloudAudioUpload disabled by default and persists explicit opt-in', () => {
    const file = join(dir, 'settings.json')
    expect(loadSettings(file).cloudAudioUpload).toBeUndefined()

    const enabled = updateSettings(file, { cloudAudioUpload: true })
    expect(enabled.cloudAudioUpload).toBe(true)

    const disabled = updateSettings(file, { cloudAudioUpload: undefined })
    expect(disabled.cloudAudioUpload).toBeUndefined()
  })

  it('invokes audio sync only when resolveAudio returns an audio file', async () => {
    const audioPath = join(dir, 'them.ogg')
    writeFileSync(audioPath, Buffer.from('OggS-mock-audio'))

    vi.spyOn(neonModule, 'isNeonConfigured').mockReturnValue(true)
    vi.spyOn(neonModule, 'syncMeetingToNeon').mockResolvedValue(true)
    const audioSpy = vi.spyOn(neonModule, 'syncMeetingAudioToNeon').mockResolvedValue(true)

    const m = store.createMeeting({
      title: 'Test Cloud Audio Sync',
      startedAt: 1000,
      endedAt: 5000,
      eventId: null,
      app: 'zoom',
      attendees: [],
      state: 'done',
      language: 'id',
    })

    const resolver = vi.fn().mockResolvedValue({ filePath: audioPath, mimeType: 'audio/ogg' })
    const engine = new SyncEngine(store, () => 'user-1', undefined, 0, resolver)
    const ok = await engine.pushMeeting(m.id)

    expect(ok).toBe(true)
    expect(resolver).toHaveBeenCalledWith(m.id)
    expect(audioSpy).toHaveBeenCalledWith(m.id, audioPath, 'audio/ogg')
  })
})
