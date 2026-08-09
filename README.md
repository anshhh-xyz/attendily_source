# Attendily

A per-user college attendance tracker: subjects with theory/lab typing, adjustable
minimum-attendance thresholds, a weekly class schedule, AI-assisted timetable import,
and push notifications timed around class end.

## Files in this project

- `index.html` — the whole frontend (HTML/CSS/JS, no build step)
- `sw.js` — service worker, receives push notifications
- `manifest.json` — PWA manifest (needed for iOS "Add to Home Screen" push support)
- `icon-192.png`, `icon-512.png` — app icons referenced by the manifest
- `config.example.js` — template for the local `config.js` you'll create (never commit the real one)
- `.gitignore` — excludes your real `config.js` from git
- `vercel.json` — tells Vercel how to generate `config.js` from environment variables at deploy time
- `schema-core.sql` — the base `subjects` table + per-user RLS
- `schema-schedule.sql` — adds `class_schedule`, `push_tokens`, `class_log`, and the cron job
- `supabase/functions/send-notifications/index.ts` — Edge Function, runs every minute, sends the push notifications
- `supabase/functions/parse-timetable/index.ts` — Edge Function, turns a timetable photo into structured schedule data via Gemini

## Setup, in order

### 1. Supabase project
1. Create a project at supabase.com.
2. SQL Editor → run `schema-core.sql`, then `schema-schedule.sql`.
   - In `schema-schedule.sql`, before running, replace `YOUR_PROJECT_REF` and `YOUR_SERVICE_ROLE_KEY`
     in the `cron.schedule(...)` block at the bottom with your real project ref and service role key
     (Settings → API).
3. Database → Extensions → enable `pg_cron` and `pg_net`.
4. Authentication → Providers → confirm Email is enabled, "Confirm email" turned on.
5. Authentication → URL Configuration → set **Site URL** and add a **Redirect URL** — both should be
   your real deployed domain once you have it (step 4 below), not localhost.

### 2. Generate keys
- VAPID keys for push: run `npx web-push generate-vapid-keys` locally. Save both.
- Gemini API key: from Google AI Studio.

### 3. Edge Function secrets
Using the Supabase CLI, from the project root:
```
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set GEMINI_API_KEY=...
supabase secrets set SITE_URL=https://your-vercel-domain.vercel.app
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```
Then deploy both functions:
```
supabase functions deploy send-notifications
supabase functions deploy parse-timetable
```

### 4. Local config for testing
Copy `config.example.js` to `config.js` in the same folder, fill in your real
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `VAPID_PUBLIC_KEY`. This file is git-ignored.

### 5. Deploy
1. Push everything (except your local `config.js`, which `.gitignore` already excludes) to GitHub.
2. Import the repo into Vercel.
3. Settings → Environment Variables → add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`
   for Production (and Preview if you want preview deploys to work too).
4. Deploy. `vercel.json`'s build command generates `config.js` from those variables automatically.
5. Go back to Supabase's Auth → URL Configuration and update Site URL / Redirect URLs to your
   real `*.vercel.app` domain, replacing localhost.

### 6. Test the full loop
- Sign up, confirm email, sign in.
- Add a subject, add a class time (or import a timetable photo).
- Turn on the Push notifications toggle in the Schedule panel — grant the permission prompt.
- Add a test class ending ~6 minutes from now to confirm the cron job fires within its 5-minute window.

## Known rough edges to expect
- Supabase's free-tier auth email sending is rate-limited; fine for testing, worth adding a
  custom SMTP provider (Authentication → Providers → SMTP Settings) before a real launch.
- iOS only receives push if the site has been added to the home screen first — a plain
  Safari tab can't get push notifications at all (Apple platform restriction).
- None of this has been run end-to-end with real keys yet — treat first deploy as debugging,
  the same way the auth setup needed a few rounds earlier.
