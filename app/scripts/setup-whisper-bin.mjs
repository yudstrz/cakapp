import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const app = join(here, '..')
const binDir = join(app, 'resources', 'bin')
const vadDir = join(app, 'resources', 'vad')

const installedBase = join(process.env.LOCALAPPDATA || 'C:\\Users\\SSD\\AppData\\Local', 'Programs', 'cakapp', 'resources')
const installedBin = join(installedBase, 'bin')
const installedVad = join(installedBase, 'vad')

const VAD_URL = 'https://huggingface.co/ggml-org/whisper-vad/resolve/9ffd54a1e1ee413ddf265af9913beaf518d1639b/ggml-silero-v6.2.0.bin'
const VAD_SHA256 = '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987'
const WHISPER_ZIP_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip'

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')

async function ensureWhisperBin() {
  mkdirSync(binDir, { recursive: true })
  const targetServer = join(binDir, 'whisper-server.exe')

  let sourceDir = join(tmpdir(), 'whisper-x64-test', 'Release')
  if (!existsSync(join(sourceDir, 'whisper-server.exe'))) {
    console.log('Downloading whisper-bin-x64.zip...')
    const zipPath = join(tmpdir(), 'whisper-bin-x64.zip')
    if (!existsSync(zipPath)) {
      const res = await fetch(WHISPER_ZIP_URL)
      if (!res.ok) throw new Error(`Failed to download whisper-bin-x64.zip: HTTP ${res.status}`)
      writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()))
    }
    const extractDir = join(tmpdir(), 'whisper-x64-test')
    mkdirSync(extractDir, { recursive: true })
    execSync(`tar -xf "${zipPath}" -C "${extractDir}"`, { stdio: 'inherit' })
    sourceDir = join(extractDir, 'Release')
  }

  if (existsSync(sourceDir)) {
    const files = readdirSync(sourceDir).filter(f => f.endsWith('.dll') || f === 'whisper-server.exe')
    for (const f of files) {
      const srcPath = join(sourceDir, f)
      const dstApp = join(binDir, f)
      copyFileSync(srcPath, dstApp)
      if (existsSync(installedBin)) {
        try { copyFileSync(srcPath, join(installedBin, f)) } catch (e) { /* ignore if in use */ }
      }
    }
    console.log(`Successfully installed ${files.length} whisper binary and library files to ${binDir}`)
    if (existsSync(installedBin)) {
      console.log(`Copied whisper binary files to installed app directory: ${installedBin}`)
    }
  }
}

async function ensureVad() {
  mkdirSync(vadDir, { recursive: true })
  const vad = join(vadDir, 'ggml-silero-v6.2.0.bin')
  if (!existsSync(vad) || sha(vad) !== VAD_SHA256) {
    console.log(`Fetching Silero VAD model from ${VAD_URL}...`)
    let res
    for (let i = 0; i < 3 && !res?.ok; i++) res = await fetch(VAD_URL).catch(() => undefined)
    if (!res?.ok) {
      console.warn('Could not fetch VAD model (continuing without VAD)')
      return
    }
    writeFileSync(vad + '.part', Buffer.from(await res.arrayBuffer()))
    if (sha(vad + '.part') !== VAD_SHA256) {
      rmSync(vad + '.part')
      console.error('VAD model checksum mismatch')
      return
    }
    renameSync(vad + '.part', vad)
    console.log(`Successfully fetched VAD model to ${vad}`)
  }

  if (existsSync(installedBase)) {
    mkdirSync(installedVad, { recursive: true })
    const installedVadFile = join(installedVad, 'ggml-silero-v6.2.0.bin')
    if (existsSync(vad) && !existsSync(installedVadFile)) {
      copyFileSync(vad, installedVadFile)
      console.log(`Copied VAD model to installed app directory: ${installedVadFile}`)
    }
  }
}

async function main() {
  await ensureWhisperBin()
  await ensureVad()
}

main().catch(err => {
  console.error('setup-whisper-bin error:', err)
  process.exit(1)
})
