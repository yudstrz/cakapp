import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { electron } from '@better-auth/electron';
import { Pool } from 'pg';

/** Same scheme as electron-builder.yml `protocols` in the desktop app */
export const DESKTOP_SCHEME = 'com.cakapp.app';

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
    : undefined;

export const auth = betterAuth({
  database: new Pool({ connectionString: databaseUrl }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [`${DESKTOP_SCHEME}:/`],
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  ...(google ? { socialProviders: { google } } : {}),
  plugins: [electron(), nextCookies()],
});

export const googleEnabled = !!google;
