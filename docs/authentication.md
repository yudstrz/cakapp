# Optional Cakapp account setup

Cakapp works as a local guest without an account. Signing in does not upload existing meetings, notes, recordings, or transcripts.

1. Create a Supabase project and copy its project URL and publishable (or legacy anon) key into `app/.env`, following `app/.env.example`. Never put a service-role key in the desktop app.
2. In Supabase Authentication, enable email and password sign-in. Set the password policy to at least 8 characters.
3. For Google sign-in, enable Google as an OAuth provider and configure its client credentials in Supabase.
4. Add `http://127.0.0.1:48217/auth/callback` to Supabase's allowed redirect URLs. Configure Google's OAuth consent screen and redirect URI with Supabase's displayed callback URL.
5. Restart Cakapp. Account controls appear under **Settings → Account** when the app can use the operating system's encrypted storage.

Email confirmation depends on the Supabase project's email settings. Sessions are stored in the OS credential store through Electron `safeStorage` (Windows Credential Manager, macOS Keychain, or Linux Secret Service/KWallet). Cakapp does not accept Electron's Linux `basic_text` fallback; if secure storage is unavailable, sign-in stays disabled and guest mode remains available.
