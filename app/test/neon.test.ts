import { describe, expect, it } from 'vitest'
import { checkNeonHealth, getDatabaseUrl, initNeonSchema, isNeonConfigured, syncMeetingToNeon } from '../src/main/neon'
import type { Meeting } from '../src/main/store'

describe('neon postgres integration', () => {
  it('detects neon configuration when DATABASE_URL is provided', () => {
    expect(isNeonConfigured()).toBe(true)
    expect(getDatabaseUrl()).toContain('neon.tech')
  })

  it('connects to Neon Postgres and verifies database health', async () => {
    const health = await checkNeonHealth()
    expect(health.ok).toBe(true)
    expect(health.version).toContain('PostgreSQL')
    expect(health.timestamp).toBeDefined()
  }, 15000)

  it('initializes schema and syncs meeting record to Neon', async () => {
    await initNeonSchema()

    const testMeeting: Meeting = {
      id: 'test-neon-meeting-' + Date.now(),
      title: 'Neon Cloud Verification Meeting',
      startedAt: Date.now() - 3600000,
      endedAt: Date.now(),
      eventId: null,
      app: 'Zoom',
      attendees: [{ name: 'Test Participant', email: 'test@neon.tech' }],
      state: 'done',
      language: 'en',
      titleSource: 'user',
      userId: 'test-user-neon',
    }

    const testSegments = [
      {
        id: 1,
        meetingId: testMeeting.id,
        track: 'me' as const,
        startMs: 0,
        endMs: 3000,
        text: 'Hello from Neon test meeting.',
        speaker: 'me',
      },
    ]

    const testNotes = {
      mine: 'Testing notes sync to Neon Postgres.',
      enhanced: 'Summary: Neon cloud sync operational.',
      edited: false,
    }

    const synced = await syncMeetingToNeon(testMeeting, testSegments, testNotes)
    expect(synced).toBe(true)
  }, 20000)
})
