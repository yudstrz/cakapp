import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { C_ARC, WAVE_BARS } from '../src/shared/logo'

const svg = (name: string) => readFileSync(join(import.meta.dirname, '../build', name), 'utf8')
const paths = (text: string) => [...text.matchAll(/ d="([^"]+)"/g)].map((m) => m[1])

// The app draws the logo from shared/logo.ts; the icons are rendered from build/*.svg. They must stay one drawing.
describe('logo', () => {
  it('matches build/logo.svg', () => {
    const content = svg('logo.svg')
    expect(paths(content)).toEqual([C_ARC])
    for (const bar of WAVE_BARS) {
      expect(content).toContain(`x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}"`)
    }
  })
  it('matches build/wordmark.svg', () => {
    const content = svg('wordmark.svg')
    expect(paths(content)).toEqual([C_ARC])
    expect(content).toContain('Cakapp')
  })
  it('matches build/icon.svg', () => {
    const content = svg('icon.svg')
    expect(paths(content)).toEqual([C_ARC])
    for (const bar of WAVE_BARS) {
      expect(content).toContain(`x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}"`)
    }
  })
})
