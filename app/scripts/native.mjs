// Builds the helpers for this computer into resources/bin.
// Mac: scripts/native.sh, unchanged.
// Windows and Linux: the Rust helpers (recorder, system helper, AI apps relay) with cargo, then whisper-server and the
// VAD model (scripts/whisper-build.mjs). YOGURT_NO_WHISPER=1 leaves whisper-server out (CI's fake-mode tests don't use it).
// Needs Rust (each crate's rust-toolchain.toml pins the version), CMake, and on Linux libpulse-dev and pkg-config.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
if (process.platform === 'darwin') {
  const r = spawnSync('sh', [join(here, 'native.sh')], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}
if (process.platform !== 'win32' && process.platform !== 'linux') {
  console.log(`no helpers for ${process.platform}`)
  process.exit(0)
}

const win = process.platform === 'win32'
const app = join(here, '..')
const bin = join(app, 'resources', 'bin')
const exe = (name) => (win ? `${name}.exe` : name)
/** crate folder in native/, and the program it builds */
const CRATES = [
  [win ? 'yogurt-audio-win' : 'yogurt-audio-linux', 'yogurt-audio'],
  ['yogurt-system', 'yogurt-system'],
  ['yogurt-mcp-relay', 'yogurt-mcp'],
]

/** newest change to anything a crate builds from */
const newest = (dir) => {
  let t = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'target' || e.name === 'smoke' || e.name.startsWith('.git')) continue
    const p = join(dir, e.name)
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs)
  }
  return t
}
const run = (cmd, args, opts) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) { console.error(`${cmd} ${args.join(' ')} failed${r.error ? `: ${r.error.message}` : ''}`); process.exit(1) }
}

const hasCmd = (cmd) => {
  try {
    const r = spawnSync(win ? 'where' : 'which', [cmd], { stdio: 'ignore' })
    return r.status === 0
  } catch {
    return false
  }
}
const hasCargo = hasCmd('cargo')
const hasCmake = hasCmd('cmake')
const hasCompiler = win ? hasCmd('cl') : (hasCmd('gcc') || hasCmd('clang'))

mkdirSync(bin, { recursive: true })
for (const [crate, name] of CRATES) {
  const dir = join(app, 'native', crate)
  const out = join(bin, exe(name))
  if (existsSync(out) && statSync(out).mtimeMs > newest(dir)) { console.log(`${exe(name)} is up to date`); continue }
  if (!hasCargo || !hasCmake || process.env.VERCEL) {
    if (!existsSync(out)) writeFileSync(out, '')
    console.log(`cargo or cmake not found or on Vercel; stub created for ${exe(name)}`)
    continue
  }
  // the crate's own pinned toolchain (rust-toolchain.toml), installed when rustup doesn't have it yet
  spawnSync('rustup', ['toolchain', 'install'], { cwd: dir, stdio: 'inherit' })
  // libopus 1.3.1 (the recorder's encoder, built from source) asks for an old CMake policy that CMake 4 refuses
  run('cargo', ['build', '--release', '--locked'], { cwd: dir, env: { ...process.env, CMAKE_POLICY_VERSION_MINIMUM: '3.5' } })
  copyFileSync(join(dir, 'target', 'release', exe(name)), out)
  if (!win) chmodSync(out, 0o755)
  console.log(`built ${out}`)
}

// The word list a Mac has in /usr/share/dict/words (Webster's Second International, 1934, public domain), from FreeBSD at a
// pinned commit: lowercase respelling (main/vocab.ts) needs to know everyday words, and Windows has no list of its own
const WORDS_URL = 'https://raw.githubusercontent.com/freebsd/freebsd-src/72f0bc868bf00586cba1e50057d8f1998b4abe80/share/dict/web2'
const WORDS_SHA256 = 'bf16d6eb0f1bc85915004bcb727aeb2f651b9dfa910ec7aa3dbf43fe9aefb87d'
const words = join(app, 'resources', 'dict', 'words')
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')
if (!existsSync(words) || sha(words) !== WORDS_SHA256) {
  mkdirSync(dirname(words), { recursive: true })
  let res
  for (let i = 0; i < 3 && !res?.ok; i++) res = await fetch(WORDS_URL).catch(() => undefined)
  if (!res?.ok) { console.warn('the word list could not be fetched (offline fallback)'); writeFileSync(words, '') }
  else {
    writeFileSync(words + '.part', Buffer.from(await res.arrayBuffer()))
    if (sha(words + '.part') !== WORDS_SHA256) { rmSync(words + '.part'); console.error("the word list's checksum is wrong"); process.exit(1) }
    renameSync(words + '.part', words)
    console.log(`fetched ${words}`)
  }
}

if (process.env.YOGURT_NO_WHISPER === '1') {
  console.log('whisper-server omitted via YOGURT_NO_WHISPER=1')
} else if (hasCmake && hasCompiler) {
  run(process.execPath, [join(here, 'whisper-build.mjs'), ...process.argv.slice(2)])
} else {
  console.log('Compiler not found; downloading prebuilt whisper-server binary and VAD model...')
  run(process.execPath, [join(here, 'setup-whisper-bin.mjs')])
}
