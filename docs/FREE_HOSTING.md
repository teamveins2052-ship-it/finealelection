# Free hosting (no Blaze plan)

The Firebase project stays on the free **Spark** plan (Auth, Firestore, Realtime Database).
Cloud Functions need Blaze, so the same callable code runs inside the Next.js server instead,
hosted free on **Vercel** (Hobby plan, region `bom1` Mumbai). Nothing about security changes:
every callable still runs its guard → rate limit → Zod parse → audit.

## How it works

| Before (Cloud Functions) | Now (Next.js server) |
|---|---|
| `httpsCallable(name)` | `POST /api/fn/<name>` → `functions/src/http.ts` → `callable.run(req)` (same code) |
| `onVoteCreated` trigger | browser calls `countMyVote` (only its own vote) right after writing; `runTick` sweeps any vote never reported |
| `onSettingsWritten` trigger | admin panel calls `syncElection` after saving; `runTick` also mirrors (covers console edits) |
| `onReactionWritten` trigger | browser calls `syncReactions` → server recounts that nominee with `count()` |
| `onStudentFirstLogin` trigger | student shell calls `welcome` after 2-step (server dedupes per student) |
| `drainMailQueue` schedule | `runTick` drains ≤50 queued emails |

`runTick` (functions/src/tick.ts) runs after `/api/fn` responses (Next `after()`), at most once a
minute across all servers (Firestore lease `_meta/tick`), plus a daily Vercel cron hitting
`/api/cron/tick` with `CRON_SECRET`. During voting, traffic keeps it running every minute.
Counting stays idempotent (`counted` flag), so double processing never double counts (AGENTS §5.3).

The old Cloud Functions still build and still work if the project ever moves to Blaze:
set `NEXT_PUBLIC_FUNCTIONS_MODE=callable` and `firebase deploy --only functions`.

## Vercel environment variables (Project → Settings → Environment Variables)

| Name | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | from `.env.local.real` (same order as `.env.example`; see `docs/ENV.md`) |
| `NEXT_PUBLIC_USE_EMULATORS` | `false` |
| `NEXT_PUBLIC_APP_URL`, `APP_URL` | the site URL, e.g. `https://elections.semmap.in` |
| `FIREBASE_SERVICE_ACCOUNT_B64` | base64 of the service-account key JSON (never commit the JSON) |
| `DATABASE_URL` | `https://election2026-2014a-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `MFA_ENCRYPTION_KEY` | 32-byte base64 key (same one forever — changing it breaks everyone's 2-step) |
| `BREVO_API_KEY`, `_2`, `_3`, `EMAIL_FROM`, `_2`, `_3`, `EMAIL_REPLY_TO`, `BREVO_DAILY_CAP` | as in `functions/.env.example` |
| `BOOTSTRAP_ADMIN_EMAIL` | first admin's Google email |
| `CRON_SECRET` | long random string |
| `ENFORCE_APP_CHECK` | leave unset until App Check is set up |

Never set `USE_FIREBASE_EMULATORS` on Vercel.

After deploy: add the Vercel domain to Firebase → Authentication → Settings → **Authorized domains**.
