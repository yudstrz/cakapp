import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { inspect } from 'node:util'

/** One line per message: time, level, then the message (errors with their stack). */
export function logLine(level: string, args: unknown[], at = new Date()): string {
  return `${at.toISOString()} ${level} ${args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack ?? String(a) : inspect(a, { depth: 3 }))).join(' ')}\n`
}

/** Append, keeping the file under cap bytes: rotate previous log to *.old.log so earlier events stay readable. */
export function writeLog(file: string, line: string, cap = 2_000_000) {
  mkdirSync(dirname(file), { recursive: true })
  if (existsSync(file) && statSync(file).size + line.length > cap) {
    const old = file.endsWith('.log') ? file.replace(/\.log$/, '.old.log') : join(dirname(file), 'main.old.log')
    renameSync(file, old)
  }
  appendFileSync(file, line)
}

/**
 * Warnings, errors and info (where a reply's time went) also go to a file in the profile (logs/main.log), so a problem
 * on someone's computer can be looked at afterwards; nothing leaves the computer.
 */
export function logToFile(file: string) {
  for (const level of ['info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      try { writeLog(file, logLine(level, args)) } catch { /* never let logging break the app */ }
    }
  }
}
