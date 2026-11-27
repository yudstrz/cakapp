import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { logLine, writeLog } from '../src/main/log'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

it('a log line has the time, the level and the error with its stack', () => {
  const line = logLine('error', ['web search failed', new Error('connect ECONNREFUSED')], new Date('2026-10-22T20:00:00Z'))
  expect(line).toMatch(/^2026-10-22T20:00:00.000Z error web search failed Error: connect ECONNREFUSED\n\s+at /)
})

it('moves main.log to main.old.log when crossing maxBytes so morning logs stay intact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'Cakapp-log-')); dirs.push(dir)
  const file = join(dir, 'main.log')
  const oldFile = join(dir, 'main.old.log')

  writeFileSync(file, 'morning-entry-'.repeat(20))
  writeLog(file, 'afternoon-entry\n', 100)

  expect(existsSync(oldFile)).toBe(true)
  expect(readFileSync(oldFile, 'utf8')).toContain('morning-entry-')
  expect(readFileSync(file, 'utf8')).toBe('afternoon-entry\n')
})
