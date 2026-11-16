# NIAT Elections '26

Mobile-first campus voting platform. Specs live in [`docs/`](docs/) — start with [`docs/MASTER.md`](docs/MASTER.md). Agent rules: [`AGENTS.md`](AGENTS.md).

## Run it locally

Everything runs on **Supabase** (database, sign-in, live counts, uploads) and **Vercel**. There is
no emulator: the local site uses the same Supabase project as the live site, so treat local data
as real. How it fits together: [`docs/FREE_HOSTING.md`](docs/FREE_HOSTING.md).

```bash
npm install
cp .env.example .env.local      # fill in the Supabase + Brevo values (see docs/ENV.md)
npm run db:apply                # create/upgrade the tables (safe to re-run)
npm run build && npm start      # http://localhost:3100
npm run ops:verify              # read-only health check
```

### Signing in

| Role | How |
|---|---|
| **Student / nominee** | `/login` → NIAT ID → *Yes, that's me* → Google (must be the sheet email) or *Email me a sign-in link* |
| **Admin** | `/admin` → Google or *Email me a sign-in link*. Admins are rows in the `admins` table (add them in the Supabase table editor) |

### 2-step verification

Admins: always. Students & nominees: optional (Profile → *Turn on 2-step*), or required for all
when **Admin → Settings → "2-step for students & nominees"** is on. Authenticator secrets are
encrypted with `MFA_ENCRYPTION_KEY` (32 random bytes, base64 — never change it once in use).
Admins can reset a user's 2-step from **Students → Edit**.

### Emails — who sends what

| Email | Sent by | When |
|---|---|---|
| Sign-in link | Brevo (link made by Supabase Auth) | "Email me a sign-in link" on the login screens |
| Welcome | Brevo | A student's first sign-in (once) |
| "I voted" sticker | Brevo | After voting in **all** clubs (once; never names a nominee) |
| Announcements / promotions | Brevo | Admin → **Emails** → Announcement |
| Voting reminders | Brevo | Admin → **Emails** → Voting reminder (max 1/student/day) |
| "You can log in now" | Brevo | Admin resolves a correction request |
| Vote receipts | — | **In-app only** (receipt screen + My Votes) |

Up to 5 Brevo accounts are supported (`BREVO_API_KEY` + `EMAIL_FROM`, `BREVO_API_KEY_2` + `EMAIL_FROM_2`, `BREVO_API_KEY_3` + `EMAIL_FROM_3`, … in `.env.local` / Vercel). The app uses account 1 until 280 today, then account 2, then 3; anything beyond all of them waits in a queue and sends automatically (on the next housekeeping run, or next day).

### Optional services

| Feature | Without it | Needs |
|---|---|---|
| Bot check on the login lookup (Turnstile) | skipped | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET` |
| Edge rate limits for uploads | database rate limit only | Upstash env vars |

## Checks

```bash
npm run lint && npm run typecheck
npm test            # unit (Vitest)
npm run build
npm run ops:verify  # live project health (read-only)
```

## Project layout

```
app/                 pages (student, nominee studio, admin) + API routes
  api/db             browser reads/writes, checked by functions/src/rules.ts
  api/fn/[name]      server actions (functions/src/callables)
  api/cron/tick      scheduled housekeeping (vote sweep, settings mirror, email queue)
  fonts/             self-hosted open-licence fonts (Luckiest Guy, Nunito)
components/          ui/ (primitives) · auth/ · student/ · admin/ · public/ · shared/ · vote/
hooks/ lib/          client hooks · schema (Zod, single source of truth), Supabase-backed data/auth clients, helpers
functions/src/       server code: rules, callables, guards, Postgres store, live counts, mailer, 2-step (TOTP)
supabase/migrations/ tables, RLS, triggers, Realtime, Storage bucket (npm run db:apply)
scripts/ops/         operator scripts (use .env.local)
tests/               unit/
docs/                specs (start with MASTER.md) · FREE_HOSTING.md (Supabase + Vercel) · ENV.md (env files)
```

## Operator commands (real project)

| Command | What it does |
|---|---|
| `npm run ops:import -- <file.xlsx> [--write]` | Import the official student workbook (dry run without `--write`) |
| `npm run ops:window` | Open voting now, close 20 Nov 8:00 PM IST |
| `npm run ops:sync` | Mirror settings to the live display, count unreported votes, send queued emails |
