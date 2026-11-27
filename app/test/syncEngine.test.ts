import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { openStore, type Store, type Meeting, type Segment, type Notes } from '../src/main/store'
import { SyncEngine } from '../src/main/syncEngine'
import { addTerm, cleanJargon, MAX_TERM, MAX_TERMS } from '../src/shared/jargon'
import { meetingWords, setJargon } from '../src/main/vocab'
import { spokenOf, whisperLanguage, WHISPER_LANGUAGES } from '../src/shared/spoken'
import { wordsOf } from '../src/shared/liveWords'
import * as neonModule from '../src/main/neon'
import * as cloudAiModule from '../src/main/cloudAi'

describe('Day 2 (Rabu) - Local Whisper Engine & Two-Way Sync Verification', () => {
  let store: Store

  beforeEach(() => {
    store = openStore(':memory:')
  })

  afterEach(() => {
    store.close()
    vi.restoreAllMocks()
  })

  // TC-2.1: Transkripsi Whisper Bilingual & Code-Switching
  describe('TC-2.1: Whisper Bilingual & Code-Switching Support', () => {
    it('supports bilingual / multi-language mode across 99 languages', () => {
      expect(WHISPER_LANGUAGES).toBe(99)
      expect(spokenOf('multi')).toBe('multi')
      expect(spokenOf('en')).toBe('en')
      expect(spokenOf('unknown')).toBe('en')

      // In multi mode, whisperLanguage returns undefined so whisper auto-detects code-switching
      expect(whisperLanguage('multi')).toBeUndefined()
      expect(whisperLanguage('en')).toBe('en')
    })

    it('stores and retrieves code-switching bilingual transcript segments accurately', () => {
      const m = store.createMeeting({
        title: 'Rapat Koordinasi Mingguan',
        startedAt: 1000,
        endedAt: 2000,
        eventId: null,
        app: 'zoom',
        attendees: [{ name: 'Budi Santoso', email: 'budi@cakapp.com' }],
        state: 'done',
        language: 'multi',
      })

      // Bilingual segment: Indonesian and English code-switching
      const bilingualText = 'Tolong follow up action item rapat Q3 ke PIC terkait sebelum EOD'
      store.addSegments([{
        meetingId: m.id,
        track: 'me',
        startMs: 100,
        endMs: 1500,
        text: bilingualText,
        speaker: 'Budi Santoso',
      }])

      const segs = store.segments(m.id)
      expect(segs.length).toBe(1)
      expect(segs[0].text).toBe(bilingualText)
      expect(segs[0].track).toBe('me')
      expect(segs[0].speaker).toBe('Budi Santoso')
    })
  })

  // TC-2.2: Custom Jargon Perusahaan
  describe('TC-2.2: Custom Jargon & Vocabulary Prompt Injection', () => {
    it('manages corporate vocabulary with cleaning, limits, and deduplication', () => {
      let jargon: string[] = []

      // Register 3 company terms
      jargon = addTerm(jargon, 'Cakapp Cloud')
      jargon = addTerm(jargon, 'Maxy Academy')
      jargon = addTerm(jargon, 'Q3 Action Plan')

      expect(jargon).toEqual(['Cakapp Cloud', 'Maxy Academy', 'Q3 Action Plan'])

      // Case-insensitive deduplication
      const duplicate = addTerm(jargon, 'cakapp cloud')
      expect(duplicate).toEqual(jargon)

      // Max term length check
      const longTerm = 'A'.repeat(MAX_TERM + 20)
      const cleaned = addTerm([], longTerm)
      expect(cleaned[0].length).toBe(MAX_TERM)

      // CleanJargon utility
      expect(cleanJargon(['Term 1', '  Term 2  ', 'Term 1'])).toEqual(['Term 1', 'Term 2'])
    })

    it('injects company jargon into Whisper vocabulary conditioning prompt', () => {
      setJargon(() => ['Cakapp Cloud', 'Maxy Academy', 'Q3 Action Plan'])

      const words = meetingWords({
        title: 'Weekly Standup',
        titleSource: 'user',
        attendees: [{ name: 'Alice Smith', email: 'alice@cakapp.com' }],
      })

      expect(words.jargon).toEqual(['Cakapp Cloud', 'Maxy Academy', 'Q3 Action Plan'])
      expect(words.names).toContain('Alice Smith')
      expect(words.companies).toContain('Cakapp')
    })
  })

  // TC-2.3: Live Word Streaming
  describe('TC-2.3: Live Word Streaming', () => {
    it('emits ordered word tokens with accurate timeline placement', () => {
      const heard = {
        startMs: 0,
        endMs: 1200,
        text: 'Halo selamat pagi',
        words: [
          { text: 'Halo', startMs: 0, endMs: 300 },
          { text: 'selamat', startMs: 350, endMs: 750 },
          { text: 'pagi', startMs: 800, endMs: 1200 },
        ],
      }

      const stream = wordsOf(heard)
      expect(stream.length).toBe(3)
      expect(stream.map((w) => w.text)).toEqual(['Halo', 'selamat', 'pagi'])
      expect(stream[0].startMs).toBe(0)
      expect(stream[2].endMs).toBe(1200)
    })

    it('spreads words reasonably when individual word timestamps are missing', () => {
      const heard = {
        startMs: 1000,
        endMs: 2000,
        text: 'Review sprint backlog',
      }

      const stream = wordsOf(heard)
      expect(stream.length).toBe(3)
      expect(stream.map((w) => w.text)).toEqual(['Review', 'sprint', 'backlog'])
      expect(stream[0].rough).toBe(true)
      expect(stream[2].endMs).toBe(2000)
    })
  })

  // TC-2.4: Pengorganisasian Folder
  describe('TC-2.4: Folder Management & Persistence', () => {
    it('creates, customizes, and persists folders and meeting memberships', () => {
      const financeFolder = store.createFolder('Divisi Finance', { icon: 'folder', color: 'blue' })
      const execFolder = store.createFolder('Rapat Direksi', { icon: 'folder', color: 'default' })

      expect(financeFolder.name).toBe('Divisi Finance')
      expect(financeFolder.color).toBe('blue')
      expect(execFolder.name).toBe('Rapat Direksi')

      const m = store.createMeeting({
        title: 'Q3 Financial Review',
        startedAt: 1000,
        endedAt: 2000,
        eventId: null,
        app: 'teams',
        attendees: [],
        state: 'done',
      })

      store.addToFolder(financeFolder.id, m.id)

      const folders = store.foldersOf(m.id)
      expect(folders.length).toBe(1)
      expect(folders[0].id).toBe(financeFolder.id)
      expect(folders[0].name).toBe('Divisi Finance')

      const choices = store.folderMeetingChoices(financeFolder.id)
      expect(choices.some((c) => c.id === m.id && c.inFolder)).toBe(true)
    })
  })

  // TC-2.5: Uji Ketahanan Offline & Auto-Push Sync
  describe('TC-2.5: Offline Queue & Auto-Push Sync Resilience', () => {
    it('enqueues meeting mutation when offline and marks status pending', async () => {
      const syncEngine = new SyncEngine(store, () => 'user-123', undefined, 0)
      syncEngine.setOnline(false) // Simulate offline connection

      const m = store.createMeeting({
        title: 'Offline Brainstorming Session',
        startedAt: 1000,
        endedAt: 2000,
        eventId: null,
        app: null,
        attendees: [],
        state: 'done',
        userId: 'user-123',
      })

      const pushed = await syncEngine.pushMeeting(m.id)
      expect(pushed).toBe(false)

      // Verified offline state: sync_status is 'pending' and item is queued in SQLite
      const status = store.meetingSyncStatus(m.id)
      expect(status?.status).toBe('pending')
      expect(store.syncQueueCount()).toBe(1)

      const queue = store.peekSyncQueue(10)
      expect(queue[0].entityType).toBe('meeting')
      expect(queue[0].entityId).toBe(m.id)
      expect(queue[0].action).toBe('upsert')

      syncEngine.destroy()
    })

    it('flushes offline queue automatically when connection is restored', async () => {
      const syncEngine = new SyncEngine(store, () => 'user-123', undefined, 0)
      syncEngine.setOnline(false)

      const m = store.createMeeting({
        title: 'Standup Sprint 12',
        startedAt: 1000,
        endedAt: 2000,
        eventId: null,
        app: null,
        attendees: [],
        state: 'done',
        userId: 'user-123',
      })

      await syncEngine.pushMeeting(m.id)
      expect(store.syncQueueCount()).toBe(1)

      // Mock neon functions to simulate successful sync upon reconnect
      vi.spyOn(neonModule, 'isNeonConfigured').mockReturnValue(true)
      vi.spyOn(neonModule, 'syncMeetingToNeon').mockResolvedValue(true)

      const res = await syncEngine.setOnline(true)

      expect(res?.processed).toBe(1)
      expect(res?.failed).toBe(0)
      expect(store.syncQueueCount()).toBe(0)

      // Meeting status is now 'synced'
      const status = store.meetingSyncStatus(m.id)
      expect(status?.status).toBe('synced')

      syncEngine.destroy()
    })
  })

  // TC-2.6: Uji Pull Sync Multi-Device & Conflict Handling
  describe('TC-2.6: Multi-Device Pull Sync & Last-Write-Wins Conflict Resolution', () => {
    it('pulls cloud meetings into a fresh device store', async () => {
      const laptopBStore = openStore(':memory:')
      const syncEngineB = new SyncEngine(laptopBStore, () => 'user-123', undefined, 0)

      const cloudMeeting: Meeting = {
        id: 'meeting-cloud-1',
        title: 'All-Hands Product Roadmap',
        startedAt: 5000,
        endedAt: 8000,
        eventId: null,
        app: 'zoom',
        attendees: [{ name: 'CEO', email: 'ceo@cakapp.com' }],
        state: 'done',
        language: 'id',
        titleSource: 'user',
        userId: 'user-123',
      }
      const cloudSegments: Segment[] = [
        { id: 1, meetingId: 'meeting-cloud-1', track: 'me', startMs: 100, endMs: 2000, text: 'Selamat pagi tim.', speaker: 'CEO' },
      ]
      const cloudNotes: Notes = {
        mine: 'Target Q3 release',
        enhanced: 'Summary: Target Q3 release confirmed.',
        edited: false,
      }

      vi.spyOn(neonModule, 'isNeonConfigured').mockReturnValue(true)
      vi.spyOn(neonModule, 'fetchMeetingsFromNeon').mockResolvedValue([
        {
          meeting: cloudMeeting,
          segments: cloudSegments,
          notes: cloudNotes,
          updatedAt: 9000,
        },
      ])

      const pullResult = await syncEngineB.pullMeetings()
      expect(pullResult.pulled).toBe(1)

      const downloaded = laptopBStore.meeting('meeting-cloud-1')
      expect(downloaded).toBeDefined()
      expect(downloaded?.title).toBe('All-Hands Product Roadmap')
      expect(laptopBStore.segments('meeting-cloud-1').length).toBe(1)
      expect(laptopBStore.notes('meeting-cloud-1').enhanced).toBe('Summary: Target Q3 release confirmed.')

      syncEngineB.destroy()
      laptopBStore.close()
    })

    it('resolves conflicts using Last-Write-Wins based on timestamps', () => {
      const m = store.createMeeting({
        title: 'Local Meeting Title v1',
        startedAt: 1000,
        endedAt: 2000,
        eventId: null,
        app: null,
        attendees: [],
        state: 'done',
      }, 'm-conflict')

      // 1. Cloud update has older timestamp than local -> Local is preserved
      const olderCloudMeeting: Meeting = {
        ...m,
        title: 'Older Cloud Title',
      }
      const updatedOlder = store.upsertMeetingFromCloud(olderCloudMeeting, [], null, 500)
      expect(updatedOlder).toBe(false)
      expect(store.meeting('m-conflict')?.title).toBe('Local Meeting Title v1')

      // 2. Cloud update has newer timestamp -> Cloud update is applied
      const newerCloudMeeting: Meeting = {
        ...m,
        title: 'Newer Cloud Title from Laptop B',
      }
      const futureTime = Date.now() + 100_000
      const updatedNewer = store.upsertMeetingFromCloud(newerCloudMeeting, [], null, futureTime)
      expect(updatedNewer).toBe(true)
      expect(store.meeting('m-conflict')?.title).toBe('Newer Cloud Title from Laptop B')
    })

    it('syncs meetings via HTTPS portal API when DATABASE_URL is absent', async () => {
      const originalFetch = globalThis.fetch
      const calls: Array<{ url: string; method: string; body?: string }> = []
      vi.spyOn(neonModule, 'isNeonConfigured').mockReturnValue(false)
      vi.spyOn(cloudAiModule, 'buildDesktopAuthHeaders').mockResolvedValue({
        Cookie: 'better-auth.session_token=test-cookie',
      })
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined })
        if (url.includes('/api/sync?probe=1')) {
          return new Response(JSON.stringify({ ok: true, meetings: [], folders: [] }), { status: 200 })
        }
        if (method === 'POST' && url.endsWith('/api/sync')) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }
        return new Response(JSON.stringify({
          ok: true,
          meetings: [{
            meeting: {
              id: 'm-remote-http',
              title: 'Synced From Web',
              startedAt: 4000,
              endedAt: 5000,
              eventId: null,
              app: 'meet',
              attendees: [],
              state: 'done',
              language: 'id',
              titleSource: 'user',
              userId: 'user-123',
            },
            segments: [],
            notes: null,
            updatedAt: Date.now() + 10_000,
          }],
          folders: [],
        }), { status: 200 })
      }) as typeof fetch

      try {
        const engine = new SyncEngine(store, () => 'user-123', undefined, 0)
        const m = store.createMeeting({
          title: 'Pre-login Local Meeting',
          startedAt: 1000,
          endedAt: 2000,
          eventId: null,
          app: 'zoom',
          attendees: [],
          state: 'done',
        }, 'm-http-push')
        store.addSegments([{ meetingId: m.id, track: 'me', startMs: 0, endMs: 500, text: 'Tes sync HTTPS', speaker: null }])

        const status = await engine.getStatus()
        expect(status.configured).toBe(true)
        expect(status.online).toBe(true)

        const syncRes = await engine.syncAll()
        expect(syncRes.pushed).toBe(1)
        expect(store.meetingSyncStatus(m.id)?.status).toBe('synced')
        expect(store.meeting('m-remote-http')?.title).toBe('Synced From Web')
        expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/sync') && c.body?.includes('m-http-push'))).toBe(true)
        engine.destroy()
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('isolates meetings/folders per active account, blocks cross-account push, and sends updatedAt on edits', async () => {
      const originalFetch = globalThis.fetch
      const postedIds: string[] = []
      const postedPayloads: Array<{ meeting?: { id?: string; updatedAt?: number } }> = []
      vi.spyOn(neonModule, 'isNeonConfigured').mockReturnValue(false)
      vi.spyOn(cloudAiModule, 'buildDesktopAuthHeaders').mockResolvedValue({
        Cookie: 'better-auth.session_token=test-cookie',
      })
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/api/sync?probe=1')) {
          return new Response(JSON.stringify({ ok: true, meetings: [], folders: [] }), { status: 200 })
        }
        if (init?.method === 'POST' && typeof init.body === 'string') {
          const body = JSON.parse(init.body) as { meeting?: { id?: string; updatedAt?: number } }
          postedPayloads.push(body)
          if (body.meeting?.id) postedIds.push(body.meeting.id)
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }
        return new Response(JSON.stringify({ ok: true, meetings: [], folders: [] }), { status: 200 })
      }) as typeof fetch

      try {
        // 1. Account A creates private meeting + folder; Guest creates an unowned meeting
        store.setScopeUserId('user-A')
        const folderA = store.createFolder('Folder Rahasia A')
        const mA = store.createMeeting({
          title: 'Budget Confidential A',
          startedAt: 1000,
          endedAt: 2000,
          eventId: null,
          app: 'zoom',
          attendees: [],
          state: 'done',
          userId: 'user-A',
        }, 'm-user-a')
        store.setNotes(mA.id, 'Rahasia A', 'Ringkasan A')
        store.enqueueSync('meeting', mA.id, 'upsert')

        store.setScopeUserId(null)
        const mGuest = store.createMeeting({
          title: 'Guest Draft Meeting',
          startedAt: 1100,
          endedAt: 2100,
          eventId: null,
          app: 'meet',
          attendees: [],
          state: 'done',
        }, 'm-guest')

        // 2. Signed-out (null) and Account B never see Account A's meeting, folder, or search results
        expect(store.meetings({ limit: 50 }).map((m) => m.id)).toEqual(['m-guest'])
        expect(store.folders().map((f) => f.id)).not.toContain(folderA.id)

        store.setScopeUserId('user-B')
        expect(store.meetings({ limit: 50 }).map((m) => m.id)).toEqual(['m-guest'])
        expect(store.folders().map((f) => f.id)).not.toContain(folderA.id)
        expect(store.search('Budget Confidential A', 10)).toHaveLength(0)

        // 3. Switching active account on SyncEngine blocks pushing A's queued meeting under B's token
        let currentUser: string | null = 'user-A'
        const engine = new SyncEngine(store, () => currentUser, undefined, 0)
        await engine.pullMeetings()

        currentUser = 'user-B'
        engine.resetAccount()

        expect(store.pendingSyncMeetings(50, 'user-B').map((m) => m.id)).toEqual(['m-guest'])
        expect(await engine.pushMeeting('m-user-a')).toBe(false)
        expect(await engine.pushFolder(folderA.id)).toBe(false)

        const flushed = await engine.flushQueue()
        expect(flushed.processed).toBe(0)
        expect(postedIds).not.toContain('m-user-a')

        // 4. Account B claims the Guest meeting on sync, and subsequent note/rename edits mark pending + send updatedAt
        await engine.pushMeeting(mGuest.id)
        expect(postedIds).toContain('m-guest')
        expect(store.meeting(mGuest.id)?.userId).toBe('user-B')
        expect(store.meetingSyncStatus(mGuest.id)?.status).toBe('synced')

        const beforeEdit = store.meeting(mGuest.id)?.updatedAt ?? 0
        store.setNotes(mGuest.id, 'Catatan diperbarui', 'Ringkasan baru')
        expect(store.meetingSyncStatus(mGuest.id)?.status).toBe('pending')
        store.updateMeeting(mGuest.id, { title: 'Guest Draft Renamed' })
        expect(store.meetingSyncStatus(mGuest.id)?.status).toBe('pending')

        await engine.pushMeeting(mGuest.id)
        const latestPayload = postedPayloads.at(-1)
        expect(latestPayload?.meeting?.updatedAt).toBeGreaterThanOrEqual(beforeEdit)

        // 5. When Account A signs back in, A's queued meeting flushes properly
        currentUser = 'user-A'
        store.setScopeUserId('user-A')
        engine.resetAccount()
        const flushedA = await engine.flushQueue()
        expect(flushedA.processed).toBe(1)
        expect(postedIds).toContain('m-user-a')
        engine.destroy()
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
