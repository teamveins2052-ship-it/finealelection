# Connecting real Firebase — step by step

> Do **staging** first (`niat-elections-staging`). Repeat the same steps for **prod** (`niat-elections-prod`) only after staging works end to end. Per AGENTS.md, a human runs every deploy.
> Time: ~45–60 min. You need: a Google account, a card for the Blaze plan, Node 20+, this repo.

---

## Step 1 — Create the project
1. Go to **https://console.firebase.google.com** → **Create a project**.
2. Name: `niat-elections-staging` (the project ID must match `.firebaserc`; if Google adds a suffix, update `.firebaserc` → `"staging"`).
3. Google Analytics: **off** (not needed, fewer trackers on students).

## Step 2 — Blaze plan + budget alert
1. Bottom-left **Spark → Upgrade** → **Blaze** (pay-as-you-go). Free quotas still apply; Cloud Functions and >100 live RTDB connections need Blaze.
2. Set a **budget alert of ₹400** (Google Cloud console → Billing → Budgets & alerts) with emails at 50 % and 90 %.

## Step 3 — Register the web app (gets your config)
1. Project overview → **</> Web** → nickname `niat-web` → **Register** (skip Hosting).
2. Copy the values from `firebaseConfig` — you need `apiKey`, `authDomain`, `projectId`, `appId`.

## Step 4 — Authentication
1. **Build → Authentication → Get started**.
2. **Sign-in method** tab:
   - **Google** → Enable → choose a support email → Save.
   - **Email/Password** → Enable **and** turn on **Email link (passwordless sign-in)** → Save. (Leave plain password sign-in off for students; nobody uses passwords.)
3. **Settings → Authorized domains**: `localhost` is there by default. Later add your real domain (e.g. `elections.yourdomain.com`) and the staging domain.

> 2-step verification is our own TOTP layer (no Identity Platform upgrade or SMS costs needed).

## Step 5 — Firestore
1. **Build → Firestore Database → Create database**.
2. Location: **asia-south1 (Mumbai)** — cannot be changed later.
3. Start in **production mode** (our rules get deployed in step 10).

## Step 6 — Realtime Database (live counts)
1. **Build → Realtime Database → Create database**.
2. Location: **Singapore (asia-southeast1)**. Start in **locked mode**.
3. Copy the URL shown at the top, e.g. `https://niat-elections-staging-default-rtdb.asia-southeast1.firebasedatabase.app`.

## Step 7 — Sign the CLI in
```bash
npx firebase login
npx firebase projects:list        # niat-elections-staging should appear
```

## Step 8 — Functions settings & secrets
1. Create `functions/.env.niat-elections-staging` from `functions/.env.example` and fill `DATABASE_URL` (step 6), `APP_URL`, `EMAIL_FROM`. Leave `ENFORCE_APP_CHECK` unset for now.
2. Create the 2-step encryption key (stored in Google Secret Manager, never in files):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   npx firebase functions:secrets:set MFA_ENCRYPTION_KEY -P staging
   ```
   Paste the printed value when asked. **Use a different key for prod**, and never change it after users enroll (their 2-step would stop working).

## Step 9 — No key files needed
Google now blocks service-account key creation by default ("Key creation is not allowed on this service account"). Good — this project doesn't need keys:
- The pre-login student lookup and email check run as Cloud Functions (`lookupStudent`, `checkStudentEmail`), which have Google credentials built in.
- The first admin is created with the one-time **Set up this election** button (step 12).

Just make sure `functions/.env.<project-id>` contains `BOOTSTRAP_ADMIN_EMAIL=<your Google email>` and the election dates.

## Step 10 — Deploy the backend (order matters — MIGRATION §6)
```bash
npx firebase deploy --only firestore:indexes -P staging
```
Wait until **Firestore → Indexes** shows all as *Enabled* (a few minutes), then:
```bash
npx firebase deploy --only functions -P staging
npx firebase deploy --only firestore:rules,database -P staging
```
First functions deploy may ask to enable APIs (Cloud Build, Artifact Registry, Secret Manager) — answer **yes**.

## Step 11 — Point the app at the real project
1. Back up the emulator settings: copy `.env.local` → `.env.local.emulator`.
2. Copy `.env.example` → `.env.local.real` (see `docs/ENV.md`), then run `npm run env:real`, and fill in the web config (step 3) and RTDB URL (step 6). Make sure `NEXT_PUBLIC_USE_EMULATORS=false` and **no** `*_EMULATOR_HOST` lines remain.
3. Restart the dev server.

## Step 12 — Create the first admin (one click)
1. Open **http://localhost:3100/admin** → **Continue with Google** with the `BOOTSTRAP_ADMIN_EMAIL` account.
2. You'll see "isn't on the admin list" → click **Set up this election**. It creates you as admin (and voter-admin), `settings/election` with your dates, and 7 placeholder positions. It works once only, for that email only.
3. The page reloads into 2-step setup. Add more admins later in Firebase console → Firestore → `admins` → add a document whose ID is their lowercase email with fields `email` (string), `name` (string), `canViewVoters` (boolean), `addedBy` (string), `createdAt` (timestamp).

> Alternative if you *do* have a key file: `npm run bootstrap` with `.env.bootstrap` (see `.env.bootstrap.example`).

## Step 13 — First sign-in & real data
1. Set up **2-step** (scan the QR with your authenticator app, save the backup codes).
2. **Admin → Import sheet** → upload the student Excel (on staging, use a small test sheet with your own and friends' details — not the real class list until you're ready).
3. **Admin → Positions & Nominees** → fix positions, add nominees.
4. Test as a student: landing → your NIAT ID → Google or email link → 2-step → vote.

## Step 14 — App Check (17–18 Nov)
1. Google Cloud console → **Security → reCAPTCHA Enterprise** → create a **website key** for your domains (and `localhost` for testing).
2. Firebase console → **App Check → Apps → your web app → reCAPTCHA Enterprise** → paste the key → Save.
3. Put the site key in `.env.local` as `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY`, redeploy the app.
4. **17 Nov:** watch App Check metrics (Firestore, RTDB, Functions) — most requests should be *verified*.
5. **18 Nov:** App Check → **Enforce** for Firestore and Realtime Database, and set `ENFORCE_APP_CHECK=true` in `functions/.env.<project>` then redeploy functions.

## Step 15 — Checklist before telling students
- [ ] Rules deployed (Firestore → Rules shows the 2-step helpers, no "open rules" warning)
- [ ] Your domain in Auth → Authorized domains
- [ ] Budget alert set
- [ ] `MFA_ENCRYPTION_KEY` set (different for prod)
- [ ] Admin 2-step done for every admin; voter-admins ≤ 2
- [ ] A test vote shows up live on another phone within ~1 s
- [ ] `Admin → Settings → 2-step for students` decided (see turnout risk in README)

## Switching back to emulators
Copy `.env.local.emulator` back to `.env.local`, restart `npm run dev`, and run `npm run emulators` again.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `auth/unauthorized-domain` on Google sign-in | Add the domain in Auth → Settings → Authorized domains |
| Lookup says "temporarily unavailable" | Check `FIREBASE_SA_*` in `.env.local`; key needs Datastore Viewer; private key keeps `\n` |
| Live counts never move | `DATABASE_URL` in `functions/.env.<project>` wrong, or RTDB rules not deployed |
| "This account can't set up the election" | `BOOTSTRAP_ADMIN_EMAIL` in `functions/.env.<project>` doesn't match your Google email → fix, redeploy functions |
| Every 2-step call fails | `MFA_ENCRYPTION_KEY` secret missing → step 8, then redeploy functions |
| `failed-precondition: App verification failed` | `ENFORCE_APP_CHECK=true` set before the web app sends App Check tokens → unset it or finish step 14 |
| "The query requires an index" | Step 10 indexes still building — wait |
