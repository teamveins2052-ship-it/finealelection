# NIAT Elections '26

Mobile-first campus voting platform. Specs live in [`docs/`](docs/) — start with [`docs/MASTER.md`](docs/MASTER.md). Agent rules: [`AGENTS.md`](AGENTS.md).

## Run it locally (everything on emulators — nothing touches real Firebase)

Needs **Node 20+** and **Java 11+** (for the Firebase emulators). Project ID `demo-niat-elections` is a *demo* project: it physically can't reach real Firebase.

```bash
npm install
npm --prefix functions install
cp .env.example .env.local      # already points at the emulators
```

Then three terminals:

```bash
npm run emulators               # 1 · Auth, Firestore, RTDB, Functions + UI at http://localhost:4000
npm run seed                    # 2 · 150 students, 7 positions, 18 nominees, ~60% turnout, voting live
npm run dev                     # 3 · app at http://localhost:3100
```

Re-seed any time (emulators keep running): `npm run seed:reset && npm run seed`. Try other phases:
`npm run seed -- --phase=campaign` · `--phase=paused` · `--phase=closed` · `--phase=results` · `--phase=concluded`.

### The three dashboards

| Role | How to get in | What you'll see |
|---|---|---|
| **Student** | Landing → NIAT ID `N25H01A0001` → *Yes, that's me* → **Emulator test sign-in** → `voter@niat.test` / `password123` | Home, Vote (ranked live counts), nominee profiles, confirm sheet + receipt, My Votes, Results, Profile |
| **Nominee** | NIAT ID `N25H01A0010` → `nominee@niat.test` | Everything a student sees + **Studio** tab (profile editor, Q&A inbox, stats) |
| **Admin** | Landing → *Election committee sign-in* (or `/admin`) → `admin@niat.test` | Overview + pause, Results + recount, Students, Import sheet, Requests, Positions & Nominees, Content, Banners, Reminders, Analytics, Audit Log, Export, Settings |
| **Voter-admin** | `/admin` → `judge@niat.test` | Admin + **Voters** (who voted for whom — audited) |

More test accounts (all `password123`): `halfdone@niat.test` (N25H01A0002, 4/7 voted), `alldone@niat.test` (N25H01A0003), `junior@niat.test` (N26H01A0001), `pending@niat.test` (N25H01A0004, blocked), `disabled@niat.test` (N25H01A0005), `nominee2@niat.test` (N25H01A0011). Google sign-in and email links also work against the Auth emulator (links appear in the Emulator UI → Authentication).

### 2-step verification (every role)

Every sign-in needs a code from an authenticator app (Google Authenticator / Microsoft Authenticator / Authy). Admins: always. Students & nominees: while **Admin → Settings → "2-step for students & nominees"** is on (default).

All seeded test accounts **except `voter@niat.test`** share one emulator-only secret. Add it to your authenticator app once (choose *Enter a setup key*, time-based):

```
JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP
```

Backup codes for those accounts: `TEST-2222`, `TEST-3333`, `TEST-4444`, `TEST-5555`, `TEST-6666` (each works once per seed). Sign in as `voter@niat.test` to try the first-time setup screens (QR code → confirm → backup codes). Admins can reset a user's 2-step from **Students → Edit**.

**Production:** set the secret `MFA_ENCRYPTION_KEY` (32 random bytes, base64) for Cloud Functions — e.g. `openssl rand -base64 32 | firebase functions:secrets:set MFA_ENCRYPTION_KEY` — and bind it in the function options before deploying. Functions refuse to run 2-step without it outside the emulator.

### Emails — who sends what

| Email | Sent by | When |
|---|---|---|
| Sign-in link | **Firebase Auth** | Student chooses "Email me a sign-in link" |
| Welcome | Brevo | A student's first sign-in (once) |
| "I voted" sticker | Brevo | After voting in **all** clubs (once; never names a nominee) |
| Announcements / promotions | Brevo | Admin → **Emails** → Announcement |
| Voting reminders | Brevo | Admin → **Emails** → Voting reminder (max 1/student/day) |
| "You can log in now" | Brevo | Admin resolves a correction request |
| Vote receipts | — | **In-app only** (receipt screen + My Votes) |

Up to 5 Brevo accounts are supported (`BREVO_API_KEY` + `EMAIL_FROM`, `BREVO_API_KEY_2` + `EMAIL_FROM_2`, `BREVO_API_KEY_3` + `EMAIL_FROM_3`, … in `functions/.env.<project>`). The app uses account 1 until 280 today, then account 2, then 3; anything beyond all of them waits in a queue and sends automatically (every 15 min, next day). Locally (no keys) emails are printed in the functions log instead.

### What works locally vs needs real services

| Feature | Local | Needs |
|---|---|---|
| Login, voting, live counts, receipts, admin, Q&A, reactions | ✅ emulators | — |
| Welcome / sticker / announcement / reminder / correction emails | logged to the functions console | Brevo keys (`BREVO_API_KEY`, optional `BREVO_API_KEY_2`) |
| Nominee photo & post uploads | shows "Uploads aren't configured" | Cloudflare R2 env vars + replace `media.YOURDOMAIN.com` in `firestore.rules` |
| Edge rate limits | in-memory per process | Upstash env vars |
| Bot check (Turnstile) | skipped | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET` |

## Checks

```bash
npm run lint && npm run typecheck
npm run functions:build
npm test            # unit (Vitest)
npm run test:rules  # Firestore security rules on the emulator
npm run build
```

## Project layout

```
app/                 pages (student, nominee studio, admin) + API routes
  api/fn/[name]      server actions on free hosting (runs functions/src callables)
  api/cron/tick      scheduled housekeeping (vote sweep, settings mirror, email queue)
  fonts/             self-hosted open-licence fonts (Luckiest Guy, Nunito)
components/          ui/ (primitives) · auth/ · student/ · admin/ · public/ · shared/ · vote/
hooks/ lib/          client hooks · schema (Zod, single source of truth), Firebase clients, helpers
functions/src/       callables, triggers, guards, mailer, 2-step (TOTP) — shared by Cloud Functions and /api/fn
scripts/seed/        emulator seed data + one-time production bootstrap
scripts/ops/         operator scripts for the real project (need .env.bootstrap)
tests/               unit/ + rules/ (Firestore security rules)
docs/                specs (start with MASTER.md) · FREE_HOSTING.md (Vercel) · ENV.md (env files)
```

## Operator commands (real project)

| Command | What it does |
|---|---|
| `npm run bootstrap` | One-time: first admin, settings, placeholder positions |
| `npm run ops:import -- <file.xlsx> [--write]` | Import the official student workbook (dry run without `--write`) |
| `npm run ops:window` | Open voting now, close 20 Nov 8:00 PM IST |
| `npm run ops:sync` | Mirror settings to the live display, count unreported votes, send queued emails |
