import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => { const app = { getPath: (name: string) => `/fake/${name}` }; return { app, default: { app } } })
const { userDataDir, isFake } = await import('../src/main/paths')

afterEach(() => { delete process.env.Cakapp_USER_DATA; delete process.env.Cakapp_FAKE })

describe('userDataDir', () => {
  it('is the separate profile when one is set (tests)', () => {
    process.env.Cakapp_USER_DATA = '/tmp/profile'
    expect(userDataDir()).toBe('/tmp/profile')
  })
  it('is a Cakapp folder in app data otherwise', () => {
    expect(userDataDir()).toBe(join('/fake/appData', 'Cakapp'))
  })
})

describe('isFake', () => {
  it('is on only with Cakapp_FAKE=1', () => {
    expect(isFake()).toBe(false)
    process.env.Cakapp_FAKE = '1'
    expect(isFake()).toBe(true)
  })
})
