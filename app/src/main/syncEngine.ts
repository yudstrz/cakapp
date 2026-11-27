import { readFileSync, statSync } from 'node:fs'
import type { Folder, Meeting, Notes, Segment, Store } from './store'
import * as neon from './neon'
import * as cloudAi from './cloudAi'
import { getAiApiBaseUrl } from './aiKeyStore'

const MAX_CLOUD_AUDIO_BYTES = 25 * 1024 * 1024
const MAX_AUDIO_CHUNK_BYTES = 1_500_000

export type SyncStatus = {
  configured: boolean
  queueLength: number
  lastSyncedAt: number | null
  online: boolean
  error?: string
}

export type AudioUploadResolver = (meetingId: string) => Promise<{ filePath: string; mimeType: string } | null> | { filePath: string; mimeType: string } | null

type RemoteTransport =
  | { mode: 'neon' }
  | { mode: 'http'; baseUrl: string; headers: Record<string, string> }
  | null

function hasAuthHeader(headers: Record<string, string>): boolean {
  return Boolean(headers.Cookie || headers.Authorization)
}

export class SyncEngine {
  private lastSyncedAt: number | null = null
  private timer: NodeJS.Timeout | null = null
  private isSyncing = false
  private isOnline = true

  constructor(
    private store: Store,
    private getUserId: () => string | null,
    private onChanged?: () => void,
    autoStartIntervalMs = 60_000,
    private resolveAudio?: AudioUploadResolver
  ) {
    if (autoStartIntervalMs > 0) {
      this.timer = setInterval(() => {
        void this.flushQueue()
      }, autoStartIntervalMs)
    }
  }

  private async resolveTransport(): Promise<RemoteTransport> {
    if (neon.isNeonConfigured()) {
      return { mode: 'neon' }
    }
    const headers = await cloudAi.buildDesktopAuthHeaders().catch(() => ({} as Record<string, string>))
    if (!hasAuthHeader(headers)) {
      return null
    }
    return { mode: 'http', baseUrl: getAiApiBaseUrl(), headers }
  }

  async setOnline(online: boolean): Promise<{ processed: number; failed: number } | undefined> {
    this.isOnline = online
    if (online) {
      return this.flushQueue()
    }
  }

  async getStatus(): Promise<SyncStatus> {
    const transport = await this.resolveTransport()
    const configured = transport !== null
    let healthOnline = this.isOnline
    let error: string | undefined

    if (transport?.mode === 'neon' && this.isOnline) {
      const health = await neon.checkNeonHealth()
      if (!health.ok) {
        healthOnline = false
        error = health.error
      }
    } else if (transport?.mode === 'http' && this.isOnline) {
      try {
        const resp = await fetch(`${transport.baseUrl}/api/sync?probe=1`, { headers: transport.headers })
        if (!resp.ok) {
          healthOnline = false
          error = `Server sync status HTTP ${resp.status}`
        }
      } catch (err) {
        healthOnline = false
        error = err instanceof Error ? err.message : String(err)
      }
    }

    return {
      configured,
      queueLength: this.store.syncQueueCount(),
      lastSyncedAt: this.lastSyncedAt,
      online: healthOnline,
      ...(error ? { error } : {}),
    }
  }

  private async uploadAudioHttp(
    baseUrl: string,
    headers: Record<string, string>,
    meetingId: string,
    filePath: string,
    mimeType: string
  ): Promise<boolean> {
    try {
      const stat = statSync(filePath)
      if (!stat.isFile() || stat.size === 0 || stat.size > MAX_CLOUD_AUDIO_BYTES) return false
      const buf = readFileSync(filePath)
      const totalChunks = Math.max(1, Math.ceil(buf.length / MAX_AUDIO_CHUNK_BYTES))

      for (let i = 0; i < totalChunks; i++) {
        const start = i * MAX_AUDIO_CHUNK_BYTES
        const slice = buf.subarray(start, Math.min(start + MAX_AUDIO_CHUNK_BYTES, buf.length))
        const form = new FormData()
        form.set('file', new Blob([new Uint8Array(slice)], { type: mimeType }), `audio-part-${i}.bin`)
        form.set('chunkIndex', String(i))
        form.set('totalBytes', String(buf.length))
        form.set('mimeType', mimeType)
        form.set('finalize', String(i === totalChunks - 1))

        const resp = await fetch(`${baseUrl}/api/meetings/${encodeURIComponent(meetingId)}/audio`, {
          method: 'POST',
          headers,
          body: form,
        })
        if (!resp.ok) return false
      }
      return true
    } catch (err) {
      console.warn(`[syncEngine] Audio upload via HTTPS failed for ${meetingId}:`, err)
      return false
    }
  }

  private async syncOneMeeting(meeting: ReturnType<Store['meeting']>, transport: NonNullable<RemoteTransport>): Promise<boolean> {
    if (!meeting) return false
    const segments = this.store.segments(meeting.id)
    const notes = this.store.notes(meeting.id)

    if (transport.mode === 'neon') {
      const ok = await neon.syncMeetingToNeon(meeting, segments, notes)
      if (!ok) return false
      if (this.resolveAudio) {
        const audio = await Promise.resolve(this.resolveAudio(meeting.id)).catch(() => null)
        if (audio) {
          await neon.syncMeetingAudioToNeon(meeting.id, audio.filePath, audio.mimeType)
        }
      }
      return true
    }

    const resp = await fetch(`${transport.baseUrl}/api/sync`, {
      method: 'POST',
      headers: { ...transport.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'meeting', meeting, segments, notes }),
    })
    if (!resp.ok) return false

    if (this.resolveAudio) {
      const audio = await Promise.resolve(this.resolveAudio(meeting.id)).catch(() => null)
      if (audio) {
        await this.uploadAudioHttp(transport.baseUrl, transport.headers, meeting.id, audio.filePath, audio.mimeType)
      }
    }
    return true
  }

  private async syncOneFolder(folder: Folder, transport: NonNullable<RemoteTransport>): Promise<boolean> {
    if (transport.mode === 'neon') {
      return neon.syncFolderToNeon(folder, this.getUserId())
    }
    const resp = await fetch(`${transport.baseUrl}/api/sync`, {
      method: 'POST',
      headers: { ...transport.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'folder', folder }),
    })
    return resp.ok
  }

  private async fetchHttpBundle(baseUrl: string, headers: Record<string, string>, since?: number): Promise<{
    meetings: Array<{ meeting: Meeting; segments: Segment[]; notes: Notes | null; updatedAt: number }>
    folders: Folder[]
  } | null> {
    const query = since !== undefined ? `?since=${encodeURIComponent(String(since))}` : ''
    const resp = await fetch(`${baseUrl}/api/sync${query}`, { headers })
    if (!resp.ok) return null
    const data = (await resp.json()) as {
      meetings?: Array<{ meeting: Meeting; segments: Segment[]; notes: Notes | null; updatedAt: number }>
      folders?: Folder[]
    }
    return { meetings: data.meetings ?? [], folders: data.folders ?? [] }
  }

  async pushMeeting(meetingId: string): Promise<boolean> {
    const meeting = this.store.meeting(meetingId)
    if (!meeting) return false

    const transport = this.isOnline ? await this.resolveTransport() : null
    if (transport) {
      try {
        const ok = await this.syncOneMeeting(meeting, transport)
        if (ok) {
          this.store.setMeetingSyncStatus(meetingId, 'synced')
          this.lastSyncedAt = Date.now()
          return true
        }
      } catch (err) {
        console.warn(`[syncEngine] Push meeting ${meetingId} failed, enqueueing:`, err)
      }
    }

    // Offline, guest mode, or failed: enqueue for later retry
    this.store.setMeetingSyncStatus(meetingId, 'pending')
    this.store.enqueueSync('meeting', meetingId, 'upsert')
    return false
  }

  async pushFolder(folderId: string): Promise<boolean> {
    const folder = this.store.folder(folderId)
    if (!folder) return false

    const transport = this.isOnline ? await this.resolveTransport() : null
    if (transport) {
      try {
        const ok = await this.syncOneFolder(folder, transport)
        if (ok) {
          this.lastSyncedAt = Date.now()
          return true
        }
      } catch (err) {
        console.warn(`[syncEngine] Push folder ${folderId} failed, enqueueing:`, err)
      }
    }

    this.store.enqueueSync('folder', folderId, 'upsert')
    return false
  }

  async pullMeetings(since?: number): Promise<{ pulled: number; errors: number }> {
    const transport = this.isOnline ? await this.resolveTransport() : null
    if (!transport) return { pulled: 0, errors: 0 }

    try {
      const remote =
        transport.mode === 'neon'
          ? await neon.fetchMeetingsFromNeon(this.getUserId(), since ?? this.lastSyncedAt ?? undefined)
          : (await this.fetchHttpBundle(transport.baseUrl, transport.headers, since ?? this.lastSyncedAt ?? undefined))?.meetings ?? []

      let pulled = 0
      for (const item of remote) {
        const updated = this.store.upsertMeetingFromCloud(
          item.meeting,
          item.segments,
          item.notes,
          item.updatedAt
        )
        if (updated) pulled++
      }

      this.lastSyncedAt = Date.now()
      if (pulled > 0 && this.onChanged) this.onChanged()
      return { pulled, errors: 0 }
    } catch (err) {
      console.error('[syncEngine] Pull meetings failed:', err)
      return { pulled: 0, errors: 1 }
    }
  }

  async pullFolders(): Promise<{ pulled: number; errors: number }> {
    const transport = this.isOnline ? await this.resolveTransport() : null
    if (!transport) return { pulled: 0, errors: 0 }

    try {
      const folders =
        transport.mode === 'neon'
          ? await neon.fetchFoldersFromNeon(this.getUserId())
          : (await this.fetchHttpBundle(transport.baseUrl, transport.headers))?.folders ?? []

      let pulled = 0
      for (const folder of folders) {
        const updated = this.store.upsertFolderFromCloud(folder)
        if (updated) pulled++
      }

      if (pulled > 0 && this.onChanged) this.onChanged()
      return { pulled, errors: 0 }
    } catch (err) {
      console.error('[syncEngine] Pull folders failed:', err)
      return { pulled: 0, errors: 1 }
    }
  }

  async flushQueue(): Promise<{ processed: number; failed: number }> {
    if (this.isSyncing || !this.isOnline) {
      return { processed: 0, failed: 0 }
    }
    const transport = await this.resolveTransport()
    if (!transport) {
      return { processed: 0, failed: 0 }
    }

    this.isSyncing = true
    let processed = 0
    let failed = 0

    try {
      const items = this.store.peekSyncQueue(50)
      for (const item of items) {
        try {
          if (item.entityType === 'meeting') {
            const m = this.store.meeting(item.entityId)
            if (!m) {
              this.store.dequeueSync(item.id)
              processed++
              continue
            }
            const ok = await this.syncOneMeeting(m, transport)
            if (ok) {
              this.store.setMeetingSyncStatus(m.id, 'synced')
              this.store.dequeueSync(item.id)
              processed++
            } else {
              this.store.updateSyncAttempt(item.id, 'Sync failed')
              failed++
            }
          } else if (item.entityType === 'folder') {
            const f = this.store.folder(item.entityId)
            if (!f) {
              this.store.dequeueSync(item.id)
              processed++
              continue
            }
            const ok = await this.syncOneFolder(f, transport)
            if (ok) {
              this.store.dequeueSync(item.id)
              processed++
            } else {
              this.store.updateSyncAttempt(item.id, 'Sync failed')
              failed++
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          this.store.updateSyncAttempt(item.id, msg)
          failed++
        }
      }

      if (processed > 0) {
        this.lastSyncedAt = Date.now()
      }
    } finally {
      this.isSyncing = false
    }

    return { processed, failed }
  }

  async syncAll(): Promise<{ pushed: number; pulled: number; queueFlushed: number }> {
    const transport = this.isOnline ? await this.resolveTransport() : null
    if (transport) {
      for (const m of this.store.pendingSyncMeetings(50)) {
        this.store.enqueueSync('meeting', m.id, 'upsert')
      }
    }
    const queue = await this.flushQueue()
    const meetings = await this.pullMeetings()
    const folders = await this.pullFolders()
    return {
      pushed: queue.processed,
      pulled: meetings.pulled + folders.pulled,
      queueFlushed: queue.processed,
    }
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
