import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildWindowsUninstallPlan } from '../src/main/updates'

// #126: an update runs the old version's uninstaller first. When it crashed (0xC0000374), electron-builder's installer
// stopped with "Failed to uninstall old application files" and the person had to download the installer by hand.
// The new installer writes every file it needs over the old ones, so it notes the failure and carries on.
const builder = readFileSync(join(__dirname, '../electron-builder.yml'), 'utf8').replaceAll('\r\n', '\n')
const nsis = builder.slice(builder.indexOf('\nnsis:'), builder.indexOf('\nlinux:'))
const script = () => readFileSync(join(__dirname, '../build/installer.nsh'), 'utf8')

describe('a Windows update whose old uninstaller fails (#126)', () => {
  it('includes Cakapp\'s installer script', () => {
    expect(nsis).toMatch(/\n  include: build\/installer\.nsh\n/)
  })
  it('handles the old uninstaller\'s result itself, for per-user installs too, and never quits over it', () => {
    const s = script()
    expect(s).toMatch(/!macro customUnInstallCheck\b[\s\S]*?!macroend/)
    expect(s).toMatch(/!macro customUnInstallCheckCurrentUser\b[\s\S]*?!macroend/)
    for (const name of ['customUnInstallCheck', 'customUnInstallCheckCurrentUser']) {
      const body = s.match(new RegExp(`!macro ${name}\\b([\\s\\S]*?)!macroend`))![1]
      expect(body).toContain('DetailPrint')
      expect(body).not.toMatch(/\bQuit\b|\bAbort\b|MessageBox/)
    }
  })
})

describe('Windows uninstall modes (Keep Data vs Full Purge)', () => {
  it('offers interactive choice unless Silent, supports /PURGEDATA, and deletes local data only on purge', () => {
    const s = script()
    const body = s.match(/!macro customUnInstall\b([\s\S]*?)!macroend/)?.[1] ?? ''
    expect(body).toContain('${GetOptions} $R1 "/PURGEDATA"')
    expect(body).toContain('${ElseIfNot} ${Silent}')
    expect(body).toContain('MessageBox MB_YESNO|MB_ICONQUESTION')
    expect(body).toContain('RMDir /r "$APPDATA\\Cakapp"')
  })

  it('builds /S or /S /PURGEDATA command cleanly for packaged Windows only', () => {
    expect(
      buildWindowsUninstallPlan('C:\\dev\\electron.exe', { platform: 'win32', packaged: false, purgeData: true }),
    ).toBeNull()
    expect(
      buildWindowsUninstallPlan('/Applications/Cakapp.app/Contents/MacOS/Cakapp', { platform: 'darwin', packaged: true, purgeData: false }),
    ).toBeNull()

    const keep = buildWindowsUninstallPlan('C:\\Users\\SSD\\AppData\\Local\\Programs\\cakapp\\Cakapp.exe', {
      platform: 'win32',
      packaged: true,
      purgeData: false,
    })
    expect(keep?.uninstallerPath).toBe('C:\\Users\\SSD\\AppData\\Local\\Programs\\cakapp\\Uninstall Cakapp.exe')
    expect(keep?.args).toEqual(['/S'])

    const purge = buildWindowsUninstallPlan('C:\\Users\\SSD\\AppData\\Local\\Programs\\cakapp\\Cakapp.exe', {
      platform: 'win32',
      packaged: true,
      purgeData: true,
    })
    expect(purge?.args).toEqual(['/S', '/PURGEDATA'])
  })
})
