# NIAT Campus Elections 2026 — Tech Stack (TECHSTACK.md)

> Companion to `PRD.md` and `DESIGN.md`. Every tool, why it was picked, what was rejected, free-tier limits, and how the pieces connect.
> ⚠️ Free-tier numbers below are from memory as of late 2026. **Re-check every limit on the provider's pricing page on setup day.** Pin exact package versions in `package.json` once installed.

---

## 0. Stack at a Glance

| Layer | Choice |
|---|---|
| Framework | **Next.js 15 (App Router) + React 19 + TypeScript (strict)** |
| Styling / UI | **Tailwind CSS + shadcn/ui + lucide-react + Motion (Framer Motion)** |
| Hosting | **Cloudflare Workers** via **OpenNext** (`@opennextjs/cloudflare`) + Cloudflare DNS/WAF/CDN |
| Auth | **Firebase Authentication** (Google + email link) |
| Main database | **Cloud Firestore** (region `asia-south1`, Mumbai) |
| Live vote counts | **Firebase Realtime Database** (mirror of tallies) |
| Server logic | **Cloud Functions for Firebase (2nd gen, `asia-south1`)** + a few Next.js route handlers |
| Cache / rate limit | **Upstash Redis** (`@upstash/redis`, `@upstash/ratelimit`) |
| Media storage | **Cloudflare R2** |
| Email | **Brevo** (transactional API) |
| Forms / validation | **React Hook Form + Zod** |
| Testing | **Vitest, Firebase Emulator + `@firebase/rules-unit-testing`, Playwright, k6** |
| CI/CD | **GitHub Actions → Wrangler deploy + Firebase deploy** |
| Monitoring | **Sentry (free), Firebase console, Cloudflare Analytics, Upstash console** |

---

## 1. ⚠️ Changes from PRD v1 (read this first)

While pricing out the stack properly, two problems showed up in the PRD's real-time design. These are the fixes:

**Problem 1: Cloudflare Workers free plan = 100k requests/day.**
The PRD had students polling `/api/tallies` every 2–3 s. ~500 students online × 20 requests/min over a voting day ≈ 1M+ requests. That blows the free limit in a couple of hours, and the site would start failing.

**Problem 2: Firestore live listeners for 1,500 students are read-heavy.**
Every tally change = 1 read per listening student.

**Fix: live counts move to Firebase Realtime Database (RTDB).**
- Students listen to one small `/tallies` node in RTDB. RTDB pushes **only the changed bytes** over one WebSocket. No polling, no Worker requests, no per-read billing (it bills by GB downloaded).
- Rough math: 9,000 votes × 500 listeners × ~150 bytes per delta ≈ **0.7 GB** for the whole election. The free 10 GB/month on Blaze covers it.
- A **Cloud Function** triggers on every new vote in Firestore, increments the tally (idempotently), and mirrors it to RTDB. Votes still live in Firestore with all the integrity rules.
- Bonus: no complicated "counter + vote in one batch" security rules anymore. Rules only guard the vote document; the server does the counting.

**Result:** truly real-time (≈1 s), cheaper, simpler, and Workers only serve page loads + a few APIs. I recommend updating PRD §5, §8, §9 to match — I can do that next.

---

## 2. Why Each Choice

### 2.1 Next.js 15 (App Router) + TypeScript
- **Why:** your main stack; route groups map cleanly to roles (`(public)`, `(student)`, `(nominee)`, `admin`); server components keep the landing page light; `next/image` + `next/font` give zero layout shift.
- **How we use it:** the student app is mostly **client components on a static shell** (data comes from Firebase SDK directly). Server rendering is used only where it helps (landing page, share images). This keeps Worker CPU low.
- **Rejected:** Vite + React SPA (fine, but loses image/font optimisation and OG image routes); Remix (no benefit for this).

### 2.2 Cloudflare Workers + OpenNext
- **Why:** free plan doesn't pause for bandwidth, global edge, static assets served free, sits behind Cloudflare WAF and rate limiting for free.
- **Note:** Cloudflare now recommends **Workers (via `@opennextjs/cloudflare`)** for full Next.js, not the older `next-on-pages` Pages adapter.
- **Limits to watch (free):** ~100k requests/day, ~10 ms CPU per request, worker bundle size cap.
- **Safety valve:** if the 18 Nov load test shows > 60k requests/day or CPU-limit errors, switch to **Workers Paid (~$5 for the month)**. Cheapest insurance in the whole project.
- **Rejected:** Vercel Hobby (your concern about pausing/fair-use is valid for a traffic spike); running both Vercel and Cloudflare (two deploys, double failure surface).

### 2.3 Firebase Authentication
- **Why:** free, handles Google OAuth and **email-link** sign-in (sends the email itself), verified emails in the token (`email_verified`), works offline-aware with the Firestore SDK.
- **How:** after sign-in, Firestore rules compare `request.auth.token.email` with `students/{niatId}.email`. No custom server session needed.
- **Rejected:** NextAuth/Auth.js (needs a DB adapter + server, more moving parts); OTP via SMS (paid).

### 2.4 Cloud Firestore (source of truth)
- **Why:** security rules enforce one-vote-per-position at the database level; **offline persistence** gives you the offline vote queue for free; deterministic doc IDs (`{niatId}_{positionId}`) make duplicates impossible.
- **Region:** `asia-south1` (Mumbai) for the lowest latency from Hyderabad.
- **Free quota (daily):** ~50k reads, ~20k writes, ~20k deletes, 1 GiB stored. With Blaze you keep these free and pay tiny amounts above them.
- **Rejected:** Supabase/Postgres (great, but you'd hand-build vote integrity in RLS + you're already on Firebase Auth); MongoDB Atlas (no client-side rules model).

### 2.5 Firebase Realtime Database (live tallies only)
- **Why:** best tool for "1,500 phones watching numbers change": WebSocket push, delta sync, billed by bandwidth not reads.
- **Region:** `asia-southeast1` (Singapore) — closest RTDB region.
- **Spark limit:** 100 simultaneous connections → **this is one of the reasons Blaze is required.** On Blaze: ~200k concurrent.
- **Stored there:** `/tallies/{positionId}`, `/wall` (total votes + last 10 anonymous ticker events), `/election` (paused/open flags for instant UI updates). Public read, server-only write.

### 2.6 Cloud Functions (2nd gen)
- **Why:** trusted server code next to the database, with full `firebase-admin` (not possible on Cloudflare's edge runtime).
- **Functions:**
  | Function | Trigger | Job |
  |---|---|---|
  | `onVoteCreated` | Firestore `votes/{id}` create | Idempotent tally increment (transaction with `counted` flag) → mirror to RTDB → update `/wall` → audit log → queue receipt email |
  | `onCorrectionResolved` | Firestore update | Email "you can log in now" |
  | `onQuestionCreated` | Firestore create | Notify nominee (email + in-app) |
  | `sendReminders` | Callable (admin only) | Batch emails to non-voters within Brevo cap |
  | `importStudents` | Callable (admin only) | Server-side validation + batched writes of parsed sheet |
  | `exportElection` | Callable (admin only) | Build Excel/PDF to R2, return signed URL |
  | `scheduledLifecycle` | Scheduler (every 5 min) | Auto open/close voting, expire stories, shut site after date |
  | `cleanupPII` | Manual/callable after 23 Nov | Delete personal data post-export |
- **Free quota:** ~2M invocations/month — we'll use ~15k.
- **Region:** `asia-south1`.

### 2.7 Upstash Redis
- **Why (real, not decorative):**
  1. **Rate limiting** NIAT ID lookups and login attempts (stops ID scraping/brute force) — `@upstash/ratelimit`.
  2. **Caching** public, read-heavy, slow-changing data: directory lookups, nominee profiles, banners, positions → protects Firestore reads and speeds up pages.
- **Why Upstash specifically:** HTTP-based, works on Cloudflare edge (normal Redis TCP clients don't).
- **Free tier:** ~500k commands/month, 256 MB. Plenty.
- **Rejected:** Redis for live tallies (RTDB does push; Redis would need polling through Workers again).

### 2.8 Cloudflare R2 (media)
- **Why:** zero egress fees (videos watched by 1,500 students would cost real money elsewhere); new Firebase Storage buckets need Blaze and bill egress.
- **Free tier:** ~10 GB storage, ~1M write ops & ~10M read ops/month.
- **Upload flow:** nominee requests a presigned URL from `/api/media/upload-url` (verifies nominee token, checks type/size) → browser uploads straight to R2 → URL saved to Firestore.
- **Library:** `aws4fetch` (tiny, edge-friendly S3 signing) instead of the heavy AWS SDK.
- **Images:** compressed in the browser before upload (`browser-image-compression`, max 1600 px, WebP).
- **Videos:** **no server transcoding** (ffmpeg costs CPU/money). Enforce ≤ 30 s and ≤ 15 MB in the browser before upload; poster frame captured client-side.

### 2.9 Brevo (email)
- **Why:** Firebase Auth only sends sign-in emails. Receipts, reminders and notifications need a transactional provider.
- **Free tier:** ~300 emails/day.
- **Budget:** receipts are optional-by-default (always shown in-app); reminders batched across two days; notifications digested hourly.
- **Rejected:** Gmail SMTP from a personal account (spam flags, ~500/day, account risk); Resend (fine alternative, ~100/day free).

### 2.10 Cloudflare (DNS / security)
- Free plan: DNS, proxy, DDoS protection, **WAF custom rules**, **one free rate-limiting rule** (put it on `/login*` and `/api/directory*`), **Turnstile** (bot check) for **Firebase App Check**.

---

## 3. Packages

```bash
# App
npx create-next-app@latest niat-elections --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*"
npx shadcn@latest init
npx shadcn@latest add button input card dialog sheet tabs badge table dropdown-menu \
  avatar progress skeleton switch select textarea toast form separator scroll-area

npm i firebase zod react-hook-form @hookform/resolvers \
      lucide-react motion next-themes sonner \
      @upstash/redis @upstash/ratelimit jose aws4fetch \
      recharts canvas-confetti browser-image-compression \
      date-fns date-fns-tz @tanstack/react-table clsx tailwind-merge

# SheetJS: install from the official CDN tarball (the npm "xlsx" package is outdated)
npm i https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz

# Cloudflare deploy
npm i -D @opennextjs/cloudflare wrangler

# Testing & quality
npm i -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom jsdom \
         @firebase/rules-unit-testing @playwright/test prettier prettier-plugin-tailwindcss

# Firebase CLI (global or npx)
npm i -g firebase-tools

# Cloud Functions (separate package in /functions)
cd functions && npm i firebase-admin firebase-functions exceljs pdfkit zod && npm i -D typescript
```

| Package | Purpose |
|---|---|
| `firebase` | Auth, Firestore (with offline persistence), RTDB client |
| `zod` | Shared validation schemas (client, routes, functions) |
| `react-hook-form` + resolvers | Fast forms (login, correction request, studio) |
| `motion` | Ranking reorder, counters, sheets |
| `next-themes` | Dark mode without flash |
| `sonner` | Toasts |
| `@upstash/redis` / `ratelimit` | Cache + rate limits on edge |
| `jose` | Verify Firebase ID tokens on Cloudflare edge (JWKS) |
| `aws4fetch` | Sign R2 presigned URLs on edge |
| `recharts` | Admin analytics |
| `canvas-confetti` | Results celebration (lazy-loaded) |
| `browser-image-compression` | Shrink nominee images before upload |
| `@tanstack/react-table` | Admin data tables |
| `xlsx` (SheetJS) | Parse the student sheet in admin's browser |
| `exceljs`, `pdfkit` | Exports, inside Cloud Functions (not shipped to browser) |
| `date-fns-tz` | All times shown in IST (`Asia/Kolkata`) |

**Share images:** Next.js `ImageResponse` (`next/og`) route, cached at the edge. If it trips the Worker CPU limit, fall back to client-side rendering with a `<canvas>`.

---

## 4. How the Pieces Connect

```
                 ┌────────────── Cloudflare (DNS · WAF · rate limit · Turnstile) ──────────────┐
                 │                                                                              │
Phone (PWA) ─────┼──► Workers (Next.js via OpenNext) ── /api/* ──► Upstash Redis (cache, limits) │
   │             │         │                                  └──► Firestore REST (on cache miss)│
   │             │         └── presigned URL ──► R2 (media) ◄── direct upload from phone         │
   │             └──────────────────────────────────────────────────────────────────────────────┘
   │
   ├──► Firebase Auth (Google / email link)  ── ID token with verified email
   │
   ├──► Firestore (direct SDK)
   │      • write own vote  votes/{niatId}_{positionId}   ← rules: identity, window, unique
   │      • read own student doc, positions, nominees, posts, Q&A
   │      • offline queue (persistence)
   │
   └──► Realtime Database (direct SDK, read-only)
          • /tallies  /wall  /election   ← live push, ~1 s

Firestore votes/{id} created
   └──► Cloud Function onVoteCreated (asia-south1)
          ├─ transaction: if !counted → counted=true, tallies/{pos} +1
          ├─ write same tally to RTDB /tallies/{pos}
          ├─ push anonymous event to RTDB /wall
          ├─ auditLogs entry
          └─ Brevo: receipt email (if within daily budget)
```

**Admin panel** reads Firestore directly with live listeners (few users, cheap) and calls callable functions for imports, reminders and exports.

---

## 5. Environments & Config

| Env | Firebase project | Domain | Purpose |
|---|---|---|---|
| `local` | Firebase **Emulator Suite** (Auth, Firestore, RTDB, Functions) | `localhost:3000` | Daily dev, rules tests |
| `staging` | `niat-elections-staging` | `staging.<domain>` | Dry run with friends on 18 Nov |
| `prod` | `niat-elections-prod` (Blaze + budget alert) | `elections.<domain>` | Real election |

```bash
# .env.local (Next.js)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=          # RTDB (asia-southeast1)
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_USE_EMULATORS=true              # local only

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=niat-elections-media
R2_PUBLIC_URL=
FIREBASE_SA_CLIENT_EMAIL=                    # edge Firestore REST on cache miss
FIREBASE_SA_PRIVATE_KEY=

# functions/.env (Cloud Functions; secrets via `firebase functions:secrets:set`)
BREVO_API_KEY=
EMAIL_FROM=elections@<domain>
APP_URL=
```

Secrets on Cloudflare: `npx wrangler secret put NAME` (never in `wrangler.toml`).

---

## 6. Tooling & Workflow

| Concern | Tool |
|---|---|
| Package manager | npm (or pnpm if you prefer; pick one, commit the lockfile) |
| Lint / format | ESLint (Next config) + Prettier + `prettier-plugin-tailwindcss` |
| Types | `tsc --noEmit` in CI, `strict: true` |
| Unit tests | Vitest (utils, validators, tally logic) |
| Rules tests | `@firebase/rules-unit-testing` on emulator — double vote, wrong email, pending account, paused, closed window, non-admin reading `votes` |
| E2E | Playwright: login → vote 7 positions → receipt; admin pause; nominee edit |
| Load test | k6: 1,500 virtual users hitting landing + `/api/*`; Firestore/RTDB load via a seeded script on staging |
| Git | GitHub, `main` = prod, `staging` branch = staging |
| CI | GitHub Actions: install → lint → typecheck → unit → rules tests (emulator) → build |
| CD | `staging` push → `wrangler deploy --env staging` + `firebase deploy -P staging`; `main` → prod (manual approval) |

---

## 7. Monitoring on Election Day

| What | Where | Alert |
|---|---|---|
| Firebase spend | Billing budget | Email at 50% / 90% of ₹400 |
| Firestore / RTDB usage | Firebase console → Usage | Check hourly |
| Function errors | Cloud Logging (filter `onVoteCreated`) | Log-based alert on errors |
| Worker requests / CPU errors | Cloudflare dashboard → Workers analytics | Watch vs 100k/day |
| Frontend errors | Sentry free | Email |
| Redis | Upstash console | Commands/day |
| Business health | Admin Overview: last vote time, votes/min, failed writes | Manual |

---

## 8. Cost Estimate (whole election)

| Service | Plan | Expected cost |
|---|---|---|
| Cloudflare Workers | Free (upgrade to $5 only if load test says so) | ₹0 – ₹420 |
| Cloudflare DNS/WAF/R2 | Free | ₹0 |
| Firebase (Auth, Firestore, RTDB, Functions) | **Blaze** with budget alert | ₹0 – ₹150 likely |
| Upstash Redis | Free | ₹0 |
| Brevo | Free | ₹0 |
| Sentry | Free | ₹0 |
| Domain | Existing / subdomain of yours | ₹0 (or ~₹800/yr new) |
| **Total** |  | **≈ ₹0 – ₹600** |

> Blaze needs a card on file. The budget alert only **warns**, it doesn't hard-stop. For a hard stop you'd need a small function that disables billing on a budget Pub/Sub alert — not worth it at this scale; just watch the dashboard.

---

## 9. Explicitly Not Using (and why)

| Tool | Why not |
|---|---|
| Socket.io / custom Node server | RTDB already gives managed WebSockets; a server is another thing to host and keep alive |
| Prisma / PostgreSQL | Firestore rules model fits one-vote integrity better; no ORM needed |
| Vercel + Cloudflare together | Two deploys, two configs, double failure surface |
| Load balancers | Cloudflare edge + Firebase autoscale already do this |
| Kubernetes / Docker | No servers to run |
| Redux / Zustand | Firebase listeners + React state + a couple of hooks are enough |
| ffmpeg video transcoding | CPU-heavy and paid; we cap length/size instead |
| SMS OTP | Paid per message |

---

## 10. Setup Order (Phase 0 checklist)

1. Create GitHub repo, Next.js app, shadcn init, push.
2. Firebase: create `staging` + `prod` projects → enable Auth (Google + Email link), Firestore (`asia-south1`), RTDB (`asia-southeast1`), Functions → upgrade prod to **Blaze** + **₹400 budget alert**.
3. Add authorised domains in Firebase Auth (localhost, staging, prod).
4. Cloudflare: add domain, proxy DNS, create R2 bucket + API token, Turnstile site key, one rate-limit rule on `/login*` and `/api/directory*`.
5. Upstash: create Redis DB (Mumbai/Singapore region), copy REST URL + token.
6. Brevo: create account, verify sender domain (SPF/DKIM via Cloudflare DNS), get API key.
7. Wire `.env.local`, start emulators (`firebase emulators:start`), confirm app talks to them.
8. First deploy: `npx opennextjs-cloudflare build && npx wrangler deploy` → site live on staging domain.

**Done = staging URL loads, Google sign-in works against the emulator/staging, and a test write to Firestore + RTDB succeeds.**
