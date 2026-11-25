import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { openStore, type Store, type Meeting, type Segment, type Notes } from '../src/main/store'
import { SyncEngine } from '../src/main/syncEngine'
import { addTerm, cleanJargon, MAX_TERM, MAX_TERMS } from '../src/shared/jargon'
import { meetingWords, setJargon } from '../src/main/vocab'
import { spokenOf, whisperLanguage, WHISPER_LANGUAGES } from '../src/shared/spoken'
import { wordsOf } from '../src/shared/liveWords'
import * as neonModule from '../src/main/neon'

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
  })
})
