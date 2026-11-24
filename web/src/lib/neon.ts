import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let sqlClient: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> | null {
  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!databaseUrl) {
    return null;
  }
  try {
    if (!sqlClient) {
      sqlClient = neon(databaseUrl);
    }
    return sqlClient;
  } catch (err) {
    console.error('Failed to initialize Neon client:', err);
    return null;
  }
}
