import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { userDataDir } from './paths'

let loaded = false

/** Load .env variables once from user profile, bundled resources, or workspace paths. */
export function loadAppEnv(): void {
  if (loaded) return
  loaded = true
  const candidates = [
    join(userDataDir(), '.env'),
    ...(process.resourcesPath ? [join(process.resourcesPath, '.env')] : []),
    join(process.cwd(), '.env'),
    join(process.cwd(), '.env.local'),
    join(process.cwd(), 'app/.env'),
    join(process.cwd(), 'app/.env.local'),
    join(__dirname, '../../.env'),
    join(__dirname, '../../../.env'),
  ]
  for (const envPath of candidates) {
    if (existsSync(envPath)) dotenv.config({ path: envPath, quiet: true })
  }
}
