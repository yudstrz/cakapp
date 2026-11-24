import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { helperCopyPath, installHelper, launchCommand, mcpAddress, startedHidden } from '../src/main/mcp/paths'

const dirs: string[] = []
afterEach(() => { dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })) })
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'Cakapp-mcp-paths-')); dirs.push(d); return d }

describe('where AI apps reach Cakapp', () => {
  it('is the socket in the profile folder on a Mac, as it always was', () => {
    expect(mcpAddress('darwin', '/Users/sam/Library/Application Support/Cakapp', 'ab12')).toBe('/Users/sam/Library/Application Support/Cakapp/mcp.sock')
  })
  it('is the socket in the profile folder on Linux', () => {
    expect(mcpAddress('linux', '/home/sam/.config/Cakapp', 'ab12')).toBe('/home/sam/.config/Cakapp/mcp.sock')
  })
  it('is a named pipe on Windows, named afresh each launch so no one else can take the name first', () => {
    expect(mcpAddress('win32', 'C:\\Users\\sam\\AppData\\Roaming\\Cakapp', 'ab12')).toBe('\\\\.\\pipe\\Cakapp-mcp-ab12')
  })
})

describe('what the helper opens when Cakapp is closed', () => {
  it('is nothing to record on a Mac (it opens Cakapp by its bundle id)', () => {
    expect(launchCommand('darwin', true, '/Applications/Cakapp.app/Contents/MacOS/Cakapp', {})).toBeUndefined()
  })
  it('is the installed Cakapp.exe on Windows', () => {
    const exe = 'C:\\Users\\sam\\AppData\\Local\\Programs\\Cakapp\\Cakapp.exe'
    expect(launchCommand('win32', true, exe, {})).toBe(exe)
  })
  it('is the AppImage on Linux, wherever it was started from this time', () => {
    expect(launchCommand('linux', true, '/tmp/.mount_Cakapp1/Cakapp', { APPIMAGE: '/home/sam/Apps/Cakapp.AppImage' })).toBe('/home/sam/Apps/Cakapp.AppImage')
    // not from an AppImage: the mount path would be gone next time
    expect(launchCommand('linux', true, '/opt/Cakapp/Cakapp', {})).toBeUndefined()
  })
  it('is nothing for a dev or test run (that would start a bare Electron)', () => {
    expect(launchCommand('win32', false, 'C:\\dev\\electron.exe', {})).toBeUndefined()
    expect(launchCommand('linux', false, '/dev/electron', { APPIMAGE: '/x.AppImage' })).toBeUndefined()
  })
  it('starts without a window when the helper asks, a Mac too (an AI app session no longer pops Cakapp up, #54)', () => {
    expect(startedHidden('win32', ['Cakapp.exe', '--hidden'])).toBe(true)
    expect(startedHidden('linux', ['Cakapp', '--hidden'])).toBe(true)
    expect(startedHidden('linux', ['Cakapp'])).toBe(false)
    expect(startedHidden('darwin', ['Cakapp', '--hidden'])).toBe(true)
    expect(startedHidden('darwin', ['Cakapp'])).toBe(false)
  })
})

describe('the helper AI apps are told to start', () => {
  it('is copied into the profile folder on Linux only (the AppImage moves each launch)', () => {
    expect(helperCopyPath('linux', '/home/sam/.config/Cakapp')).toBe('/home/sam/.config/Cakapp/bin/Cakapp-mcp')
    expect(helperCopyPath('darwin', '/x')).toBeUndefined()
    expect(helperCopyPath('win32', 'C:\\x')).toBeUndefined()
  })
  it('copies a new helper over the old one, runnable, and leaves an up to date one alone', () => {
    const dir = tmp()
    const src = join(dir, 'Cakapp-mcp'), dest = join(dir, 'profile', 'bin', 'Cakapp-mcp')
    writeFileSync(src, 'v1')
    expect(installHelper(src, dest)).toBe(true)
    expect(readFileSync(dest, 'utf8')).toBe('v1')
    if (process.platform !== 'win32') expect(statSync(dest).mode & 0o777).toBe(0o755)
    expect(installHelper(src, dest)).toBe(false)
    writeFileSync(src, 'v2')
    expect(installHelper(src, dest)).toBe(true)
    expect(readFileSync(dest, 'utf8')).toBe('v2')
  })
  it('gives up quietly when there is no helper to copy', () => {
    const dir = tmp()
    expect(installHelper(join(dir, 'missing'), join(dir, 'bin', 'Cakapp-mcp'))).toBe(false)
  })
})
