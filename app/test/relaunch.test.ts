import { expect, it } from 'vitest'
import { relaunchOptions, stripAppImageEnv } from '../src/main/relaunch'

it('reopens the exact installed Mac bundle through Launch Services without inherited Electron arguments', () => {
  expect(relaunchOptions('darwin', true, '/Users/sam/My Apps/Cakapp.app/Contents/MacOS/Cakapp')).toEqual({ execPath: '/usr/bin/open', args: ['-n', '-a', '/Users/sam/My Apps/Cakapp.app'] })
})
it('leaves development and non-Mac relaunches to Electron', () => {
  expect(relaunchOptions('darwin', false, '/dev/Electron.app/Contents/MacOS/Electron')).toBeUndefined()
  expect(relaunchOptions('win32', true, 'C:\\Cakapp.exe')).toBeUndefined()
})

it('Linux starts the AppImage itself again: its mount goes away when Cakapp quits', () => {
  expect(relaunchOptions('linux', true, '/tmp/.mount_abc/Cakapp', '/home/sam/Cakapp.AppImage')).toEqual({ execPath: '/home/sam/Cakapp.AppImage' })
  expect(relaunchOptions('linux', true, '/usr/bin/Cakapp')).toBeUndefined()
})

it('a relaunch forgets the library path that points into the AppImage mount it takes with it', () => {
  const env = { APPDIR: '/tmp/.mount_abc', LD_LIBRARY_PATH: '/tmp/.mount_abc/usr/lib:/opt/lib' }
  stripAppImageEnv(env)
  expect(env.LD_LIBRARY_PATH).toBe('/opt/lib')
  const onlyMount = { APPDIR: '/tmp/.mount_abc', LD_LIBRARY_PATH: '/tmp/.mount_abc/usr/lib' }
  stripAppImageEnv(onlyMount)
  expect(onlyMount.LD_LIBRARY_PATH).toBeUndefined()
})

it('a .deb or a dev run keeps the library path it was started with', () => {
  const env = { LD_LIBRARY_PATH: '/opt/lib' }
  stripAppImageEnv(env)
  expect(env.LD_LIBRARY_PATH).toBe('/opt/lib')
})
