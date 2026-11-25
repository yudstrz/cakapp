import type { Store } from './store'
import * as neon from './neon'

export type SyncStatus = {
  configured: boolean
  queueLength: number
  lastSyncedAt: number | null
  online: boolean
  error?: string
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
    autoStartIntervalMs = 60_000
  ) {
    if (autoStartIntervalMs > 0) {
      this.timer = setInterval(() => {
        void this.flushQueue()
      }, autoStartIntervalMs)
    }
  }

  async setOnline(online: boolean): Promise<{ processed: number; failed: number } | undefined> {
    this.isOnline = online
    if (online) {
      return this.flushQueue()
    }
  }

  async getStatus(): Promise<SyncStatus> {
    const configured = neon.isNeonConfigured()
    let healthOnline = this.isOnline
    let error: string | undefined

    if (configured && this.isOnline) {
      const health = await neon.checkNeonHealth()
      if (!health.ok) {
        healthOnline = false
        error = health.error
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

  async pushMeeting(meetingId: string): Promise<boolean> {
    const meeting = this.store.meeting(meetingId)
    if (!meeting) return false

    const segments = this.store.segments(meetingId)
    const notes = this.store.notes(meetingId)

    if (this.isOnline && neon.isNeonConfigured()) {
      try {
        const ok = await neon.syncMeetingToNeon(meeting, segments, notes)
        if (ok) {
          this.store.setMeetingSyncStatus(meetingId, 'synced')
          this.lastSyncedAt = Date.now()
          return true
        }
      } catch (err) {
        console.warn(`[syncEngine] Push meeting ${meetingId} failed, enqueueing:`, err)
      }
    }

    // Offline or failed: enqueue for later retry
    this.store.setMeetingSyncStatus(meetingId, 'pending')
    this.store.enqueueSync('meeting', meetingId, 'upsert')
    return false
  }

  async pushFolder(folderId: string): Promise<boolean> {
    const folder = this.store.folder(folderId)
    if (!folder) return false

    const userId = this.getUserId()
    if (this.isOnline && neon.isNeonConfigured()) {
      try {
        const ok = await neon.syncFolderToNeon(folder, userId)
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
    if (!this.isOnline || !neon.isNeonConfigured()) {
      return { pulled: 0, errors: 0 }
    }

    try {
      const userId = this.getUserId()
      const remote = await neon.fetchMeetingsFromNeon(userId, since ?? this.lastSyncedAt ?? undefined)
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
    if (!this.isOnline || !neon.isNeonConfigured()) {
      return { pulled: 0, errors: 0 }
    }

    try {
      const userId = this.getUserId()
      const folders = await neon.fetchFoldersFromNeon(userId)
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
    if (this.isSyncing || !this.isOnline || !neon.isNeonConfigured()) {
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
            const segs = this.store.segments(m.id)
            const notes = this.store.notes(m.id)
            const ok = await neon.syncMeetingToNeon(m, segs, notes)
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
            const ok = await neon.syncFolderToNeon(f, this.getUserId())
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
