# NIAT Campus Elections 2026 — Product Requirements Document (PRD)

> **Owner:** Tarun Uttupulusu · **Status:** Scope locked · **Last updated:** 14 Nov 2026
> **Build deadline:** 17–18 Nov · **Voting:** 19–20 Nov · **Site live until:** 22–23 Nov, then shut down

---

## 0. TL;DR

A secure, mobile-first web platform where ~1,500 NIAT students log in with their **NIAT ID** (e.g. `N25H01A0693`), verify identity through **Google sign-in or an email link** matched against the official student sheet, and cast **exactly one vote per position** across 6–7 clubs (NSGC, Sports, Media, GenAI, …). Nominees get an Instagram-style campaign profile. Students see **live, anonymous vote counts**. The admin sees everything, including who voted for whom, and controls the whole election from one panel.

**Stack:** Next.js (on Cloudflare) · Firebase Auth + Firestore · Upstash Redis (cache + rate limit) · Cloudflare R2 (media) · Brevo (emails)

---

## 1. Goals & Non-Goals

### Goals
1. One real student = one account = one vote per position. No exceptions, enforced by the database, not the UI.
2. Smooth, fast, real-time feel on cheap phones and patchy campus Wi-Fi.
3. Near-zero cost (target: ₹0, hard ceiling ~₹500).
4. Engaging enough that turnout is high (campaign profiles, badges, live wall).
5. Results that are defensible: audit log, receipts, exportable records.

### Non-Goals
- Not a general college portal. Single-purpose, time-boxed (dies after 23 Nov).
- No native apps (PWA install covers it).
- No multi-tenant / reuse for other colleges in this version.

---

## 2. Users & Roles

| Role | Who | Can do |
|---|---|---|
| **Student (voter)** | All ~1,500 (≈1,200 seniors + ≈300 juniors, batch 2026) | Log in, view locked profile, view nominees & content, vote once per position, react, comment/ask (anonymous), predictions, pulse polls, view live counts & results |
| **Nominee** | Any student the admin toggles on (dynamic count, not fixed) | Everything a student can do **plus** a nominee dashboard: edit photo, bio, manifesto, post photos/videos/posters/stories, answer Q&A and debate questions |
| **Admin** | Tarun + designated organisers | Import students, manage positions & nominees, set voting window, pause, banners, resolve correction requests, view who voted for whom, analytics, reminders, export, moderate content |

> A nominee still votes as a normal student (including in their own position — admin can toggle "nominees cannot vote in own race" if the election committee wants that).

---

## 3. Feature Scope

Priority tiers so we always ship the core even if time runs out:
**P0** = must ship before 18 Nov · **P1** = ship if P0 is solid · **P2** = cut first if late

### 3.1 Identity & Access
| # | Feature | Tier |
|---|---|---|
| A1 | Admin imports official Excel sheet (name, phone, email, admission no., NIAT ID, batch) | P0 |
| A2 | Student enters NIAT ID → sees pre-filled details (**masked** before login, full after) | P0 |
| A3 | Sign in with **Google** (email must match the sheet) | P0 |
| A4 | Sign in via **email link** sent only to the registered email (fallback for non-Gmail) | P0 |
| A5 | Profile details are read-only for students | P0 |
| A6 | "Details wrong? Request admin" → account becomes `pending`, login blocked until admin resolves | P0 |
| A7 | Single-device session (new login kicks older device) | P1 |
| A8 | Site-wide lifecycle: pre-voting → voting → closed → results → shutdown (after 22/23 Nov) | P0 |

### 3.2 Voting
| # | Feature | Tier |
|---|---|---|
| V1 | Dashboard lists 6–7 positions; each shows its nominees | P0 |
| V2 | Pick exactly one nominee per position, confirm dialog, then locked forever | P0 |
| V3 | Progress tracker ("4 of 7 clubs voted") | P0 |
| V4 | Live anonymous vote counts + % beside each nominee photo, ranked high → low | P0 |
| V5 | Voting window (opens/closes at admin-set times) + countdown | P0 |
| V6 | Offline-safe voting (queued, auto-submits on reconnect, never double-counted) | P1 |
| V7 | Vote receipt code (e.g. `SP-7K3M`) shown in-app + emailed | P1 |
| V8 | "My Votes" page (choices, time, receipt codes, pending clubs) | P1 |
| V9 | Compare view: all nominees of a position side by side | P1 |

### 3.3 Nominee Campaign
| # | Feature | Tier |
|---|---|---|
| N1 | Admin toggles any student as nominee for a position (dynamic, add/remove anytime) | P0 |
| N2 | Nominee dashboard: photo, bio, "what I'll do if I win", plans for college | P0 |
| N3 | Instagram-style posts grid: photos, posters, short videos (≤30 s, compressed) | P1 |
| N4 | 24-hour stories | P2 |
| N5 | Anonymous Q&A on profile (nominee never sees who asked) + notification to nominee | P1 |
| N6 | Anonymous comments on posts, admin can delete | P2 |
| N7 | Emoji reactions (🔥 👏) — public support, not votes | P1 |
| N8 | Debate corner: admin posts one question per club, all nominees answer side by side | P2 |

### 3.4 Engagement
| # | Feature | Tier |
|---|---|---|
| E1 | Admin banners/announcements (image or text, schedulable) | P0 |
| E2 | Live voting wall on landing page (total votes ticker, "a student just voted in Media Club", no names) | P1 |
| E3 | "I voted" shareable badge/sticker per club + "voted in all clubs" badge | P1 |
| E4 | Results page unlocks at close: winners, %, confetti, shareable image | P1 |
| E5 | Winner prediction game + leaderboard after results | P2 |
| E6 | Daily pulse poll on home page | P2 |
| E7 | Dark mode + PWA install | P1 |

### 3.5 Admin Panel
| # | Feature | Tier |
|---|---|---|
| D1 | Overview: turnout (voted vs not voted out of 1,500), per-position live results | P0 |
| D2 | **Who voted for whom** per nominee (admin only) | P0 |
| D3 | Student management: search, edit email/phone, resolve correction requests | P0 |
| D4 | Positions & nominees management | P0 |
| D5 | Election settings: open/close times, emergency pause, results publish, site shutdown | P0 |
| D6 | Audit log (every vote, login, profile edit, admin action, timestamped) | P1 |
| D7 | Reminder emails to non-voters (one tap, batched) | P1 |
| D8 | Analytics: votes per hour, turnout by batch (seniors vs juniors), lowest-participation clubs | P1 |
| D9 | Export results + voter list + audit log (Excel/PDF) | P1 |
| D10 | Content moderation (delete posts/comments/questions) | P1 |

---

## 4. User Workflows

### 4.1 Admin setup (before 19 Nov)
1. Admin signs in (email listed in `admins` collection).
2. Uploads Excel sheet → parsed in browser (SheetJS) → validated (duplicate IDs, bad emails flagged) → batch-written to `students` + `directory`.
3. Creates positions (Sports President, Media Head, NSGC, GenAI, …) with display order.
4. Searches students → toggles nominees per position → they instantly get the nominee dashboard.
5. Sets voting window (19 Nov open → 20 Nov close) and site shutdown date.
6. Publishes a banner: "Voting opens 19 Nov, 9:00 AM".

### 4.2 Student login
```
Landing page (live wall + banner + countdown)
   │
   ▼
Enter NIAT ID ──► not found ──► "ID not in list — contact admin" (request form)
   │
   ▼ found
Show masked details:  Tarun U. · t*****@gmail.com · ******4321 · Batch 2025
   │
   ├── "These are wrong" ──► Correction request form ──► status = pending
   │                          ──► login BLOCKED ──► admin fixes ──► status = active ──► email: "you can log in now"
   │
   └── "These are correct"
          │
          ├── Continue with Google ──► Google email == sheet email? ──► ✅ in
          │                                                     └─► ❌ "Use your registered email / email link"
          └── Send sign-in link ──► link goes ONLY to sheet email ──► tap ──► ✅ in
   │
   ▼
Dashboard (full, unmasked profile — read-only)
```

### 4.3 Voting
1. Dashboard shows position cards with progress (e.g. 2/7 done ✓).
2. Open a position → nominees ranked by live count with photo, %, reactions.
3. Tap a nominee → full profile (bio, manifesto, posts, stories, Q&A).
4. Tap **Vote** → confirm dialog ("You can't change this") → submit.
5. Card locks with ✓, receipt code shown + emailed, badge unlocked.
6. After all positions → "I voted in all clubs" badge to share.

### 4.4 Nominee
1. Admin toggles them → banner appears on their dashboard: "You're a nominee for Sports President — set up your profile".
2. Nominee dashboard: edit photo, bio, manifesto, upload posts/stories, answer Q&A & debate.
3. Changes appear to voters in real time. Editing locks when voting closes.

### 4.5 Election day ops (admin)
- Watch turnout & analytics → send reminders to non-voters (e.g. juniors lagging).
- Something wrong → **Emergency pause** → banner "Voting paused" → fix → resume.
- Resolve correction requests as they arrive.

### 4.6 After close
- Voting auto-locks at close time → admin publishes results → results page with confetti + share.
- Prediction leaderboard revealed.
- Admin exports everything for the college office.
- 22/23 Nov: site switches to "Election concluded" page; data kept for export, then deleted.

---

## 5. Architecture

```
                        ┌──────────────────────────┐
   Students' phones ───►│  Cloudflare (DNS, WAF,    │
   (PWA, Next.js UI)    │  DDoS, rate-limit, CDN)   │
                        └────────────┬─────────────┘
                                     │
                    ┌────────────────┴──────────────────┐
                    ▼                                   ▼
        ┌────────────────────────┐          ┌───────────────────────┐
        │ Next.js on Cloudflare  │          │ Cloudflare R2         │
        │ (Workers via OpenNext) │          │ nominee photos/videos │
        │  • pages (SSR/static)  │          └───────────────────────┘
        │  • /api route handlers │
        └──────┬─────────┬───────┘
               │         │
               ▼         ▼
   ┌──────────────────┐  ┌──────────────────────┐   ┌──────────────┐
   │ Upstash Redis    │  │ Firebase             │   │ Brevo (SMTP/ │
   │ • tally cache    │  │ • Auth (Google +     │   │ API) receipts│
   │ • profile cache  │  │   email link)        │   │ & reminders  │
   │ • rate limits    │  │ • Firestore (truth)  │   └──────────────┘
   └──────────────────┘  │ • Security Rules =   │
                         │   vote integrity     │
   Browser ─────────────►│ • Live listeners     │
   (direct SDK: auth,    └──────────────────────┘
    votes, own data)
```

### Key design principles
1. **Firestore Security Rules are the referee.** Votes are written directly from the browser, and rules guarantee: correct identity, voting window open, not paused, one vote per position, counter incremented by exactly 1. No server can be bypassed because no server is needed for the critical path.
2. **Vote document ID = `{niatId}_{positionId}`.** Duplicate votes are physically impossible — a second write is an update, and updates are denied.
3. **Reads are cached, writes go to the source of truth.** Public, high-traffic reads (tallies, nominee profiles, banners, live wall) go through `/api/*` → Redis (2–3 s TTL) → Firestore on miss. 1,500 students polling = a handful of Firestore reads per few seconds instead of thousands.
4. **Admin gets true real-time** via Firestore listeners (few users, so cheap).
5. **Students get near-real-time** (≤3 s delay) via cached polling. Visually identical, and it protects the free tier.

### Why not pure Firestore live listeners for everyone? (honest trade-off)
Each tally change triggers one read **per listening student**. ~9,000 votes × ~500 concurrent listeners ≈ 4.5 M reads — 90× the free daily limit (50k). The Redis cache layer turns that into ~30–60k reads/day.

---

## 6. Tech Decisions

| Concern | Choice | Why | Trade-off |
|---|---|---|---|
| Frontend | **Next.js 15 (App Router) + Tailwind + shadcn/ui** | Your stack, fast, SSR for landing | Needs OpenNext adapter on Cloudflare |
| Hosting | **Cloudflare Workers/Pages (free)** | No pausing, unlimited bandwidth, global edge | Edge runtime: no `firebase-admin` (we use REST + `jose` instead) |
| Auth | **Firebase Auth** (Google + email link) | Free, handles tokens & email-link sending | Email must match sheet exactly |
| Database | **Firestore** | Rules-based integrity, offline queue, live listeners | Read-heavy pricing → solved by cache |
| Cache / rate limit | **Upstash Redis** (HTTP, edge-friendly) | Shared cache across all edge locations, `@upstash/ratelimit` | Another service to configure |
| Media | **Cloudflare R2** | Free egress; Firebase Storage now needs Blaze plan | Presigned upload route needed |
| Email | **Brevo free (~300/day)** for receipts & reminders | Firebase Auth only sends sign-in emails | Daily cap → batch reminders across 2 days |
| Excel import | **SheetJS** in browser | No server upload of PII | Admin's browser does the work |
| Validation | **Zod** (client + API) | One schema everywhere | — |
| Charts | **Recharts** | Simple, light | — |
| Share images | **`@vercel/og`-style `ImageResponse` / Satori** on edge, fallback `html-to-image` client-side | Badges & results cards | Font bundling size |

### 💰 Cost recommendation (important)
Put Firebase on the **Blaze plan with a ₹400 budget alert**. You still get the full free quota; you only pay if you exceed it (worst case a few rupees). It removes the risk of Firebase **hard-stopping mid-election** when a free quota is hit, which is the real "site goes down" danger. Everything else stays on free tiers.
> ⚠️ Verify current free-tier limits (Firebase, Upstash, Brevo, Cloudflare) on setup day — they change.

---

## 7. Data Model (Firestore)

```
admins/{email}                      { addedAt }

students/{niatId}                   { niatId, name, email(lowercase), phone, admissionNo,
                                      batch: "2025" | "2026", status: "active"|"pending"|"disabled",
                                      isNominee: bool, activeSessionId, votedPositions: [], updatedAt }
                                    read: owner + admin · write: admin only (+ owner: activeSessionId only)

directory/{niatId}                  { name, maskedEmail, maskedPhone, batch, status }
                                    public read (rate-limited via API), admin write

correctionRequests/{id}             { niatId, field, currentValue, requestedValue, note,
                                      status: "open"|"resolved"|"rejected", createdAt, resolvedBy }

positions/{positionId}              { name, club, order, description, active }

nominees/{positionId_niatId}        { positionId, niatId, name, photoUrl, bio, manifesto,
                                      reactions: {fire, clap}, active, updatedAt }

posts/{postId}                      { nomineeId, type: "photo"|"video"|"poster"|"story",
                                      mediaUrl, caption, expiresAt?(stories), createdAt, deleted }

questions/{qId}                     { nomineeId, text, answer?, answeredAt?, createdAt }   ← NO author
questionAuthors/{qId}               { niatId }                                              ← admin-only
comments/{cId}                      { postId, text, createdAt }                            ← NO author
commentAuthors/{cId}                { niatId }                                              ← admin-only

debates/{debateId}                  { positionId, question, answers: { [nomineeId]: text } }

votes/{niatId_positionId}           { voterId, positionId, nomineeId, receiptCode, createdAt }
                                    read: owner + admin · create: rules-checked · update/delete: never

tallies/{positionId}                { counts: { [nomineeId]: n }, total, lastVoteId }
reactions/{niatId_nomineeId}        { type }
predictions/{niatId}                { picks: { [positionId]: nomineeId }, createdAt }
pulsePolls/{pollId} + pulseVotes/{pollId_niatId}

banners/{id}                        { text, imageUrl, link, startsAt, endsAt, active }
settings/election                   { opensAt, closesAt, paused, resultsPublished,
                                      siteClosesAt, nomineesCanSelfVote }
auditLogs/{autoId}                  { actor, action, target, meta, at }   ← admin-only read
```

**Why anonymity is split into separate collections:** Firestore can't hide individual fields from a reader. If the author ID were inside `questions`, anyone reading the question could read the author. Splitting puts identity in an admin-only collection.

**Indexes:** `votes (positionId, nomineeId)`, `votes (voterId)`, `posts (nomineeId, createdAt desc)`, `questions (nomineeId, createdAt desc)`, `correctionRequests (status, createdAt)`, `auditLogs (at desc)`.

**Hot-spot note:** a single tally doc handles ~1 sustained write/sec. If voting opens with a rush, use **sharded counters** (`tallies/{positionId}/shards/{0..4}`) — the API sums shards before caching.

---

## 8. Security Rules — Vote Integrity (core sketch)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    function signedIn() { return request.auth != null && request.auth.token.email_verified == true; }
    function isAdmin()  { return signedIn() && exists(/databases/$(db)/documents/admins/$(request.auth.token.email)); }
    function student(id){ return get(/databases/$(db)/documents/students/$(id)).data; }
    function isOwner(id){ return signedIn()
                            && student(id).email == request.auth.token.email
                            && student(id).status == 'active'; }
    function election() { return get(/databases/$(db)/documents/settings/election).data; }
    function votingOpen(){ let e = election();
                           return e.paused == false && request.time >= e.opensAt && request.time < e.closesAt; }

    match /votes/{voteId} {
      allow read: if isAdmin() || (resource != null && isOwner(resource.data.voterId));
      allow create: if isOwner(request.resource.data.voterId)
        && votingOpen()
        && voteId == request.resource.data.voterId + '_' + request.resource.data.positionId
        && exists(/databases/$(db)/documents/nominees/$(request.resource.data.positionId + '_' + request.resource.data.nomineeId))
        && request.resource.data.keys().hasOnly(['voterId','positionId','nomineeId','receiptCode','createdAt'])
        && request.resource.data.createdAt == request.time
        // must be written in the same batch as a +1 on the tally:
        && getAfter(/databases/$(db)/documents/tallies/$(request.resource.data.positionId)).data.lastVoteId == voteId;
      allow update, delete: if false;
    }

    match /tallies/{positionId} {
      allow read: if true;
      allow update: if signedIn()
        && existsAfter(/databases/$(db)/documents/votes/$(request.resource.data.lastVoteId))
        && !exists(/databases/$(db)/documents/votes/$(request.resource.data.lastVoteId))
        && request.resource.data.total == resource.data.total + 1;
        // + check exactly one counts[nomineeId] increased by 1 (full version in Phase 1 code)
    }

    match /questionAuthors/{id} { allow read: if isAdmin(); allow create: if signedIn(); }
    match /auditLogs/{id}       { allow read: if isAdmin(); allow create: if signedIn(); allow update, delete: if false; }
    // ... remaining collections in Phase 1 code
  }
}
```
Client writes the vote as **one batched write**: `set(votes/{id})` + `update(tallies/{positionId}, { counts.X: increment(1), total: increment(1), lastVoteId: id })`. Both succeed or both fail.

---

## 9. API (Next.js route handlers on Cloudflare edge)

Only things the browser can't do safely itself. Every route: Zod validation, Upstash rate limit, structured JSON errors.

| Method & Route | Auth | Purpose | Cache |
|---|---|---|---|
| `GET /api/directory/:niatId` | public | Masked details for login step | Redis 60 s · rate limit 10/min/IP |
| `GET /api/tallies` | public | All positions' counts + % | Redis 2–3 s, edge cache 2 s |
| `GET /api/nominees/:positionId` | public | Nominee cards | Redis 30 s, purged on edit |
| `GET /api/wall` | public | Total votes + recent anonymous ticker | Redis 3 s |
| `GET /api/banners` | public | Active banners | Redis 60 s |
| `POST /api/receipt` | student (ID token) | Email vote receipt via Brevo | — |
| `POST /api/media/upload-url` | nominee | Presigned R2 upload URL (type/size checked) | — |
| `POST /api/admin/reminders` | admin | Email non-voters (batched, respects daily cap) | — |
| `POST /api/admin/cache/purge` | admin | Bust Redis keys after edits | — |
| `GET /api/og/badge` | public | "I voted" / results share image | edge cache |

**Token verification on edge:** Firebase ID tokens verified with `jose` against Google's public JWKS. Firestore access from routes uses the REST API (with the user's own token where possible, so rules still apply).

**Example — `GET /api/tallies` response**
```json
{
  "updatedAt": "2026-11-19T10:42:03Z",
  "positions": [
    { "id": "sports-president", "name": "Sports Club President", "total": 812,
      "nominees": [
        { "id": "N25H01A0101", "name": "Ravi K", "photo": "https://…", "votes": 401, "pct": 49.4 },
        { "id": "N25H01A0223", "name": "Sneha P", "photo": "https://…", "votes": 300, "pct": 36.9 },
        { "id": "N25H01A0310", "name": "Arjun M", "photo": "https://…", "votes": 111, "pct": 13.7 }
      ] }
  ]
}
```

---

## 10. Folder Structure

Single Next.js app (a monorepo adds overhead with no benefit for a 9-day, one-app project).

```
niat-elections/
├─ app/
│  ├─ (public)/page.tsx                 # landing: live wall, banner, countdown, NIAT ID entry
│  ├─ (public)/login/…                   # masked details, Google / email link, correction request
│  ├─ (public)/auth/callback/page.tsx    # email-link completion
│  ├─ (student)/dashboard/page.tsx       # positions + progress
│  ├─ (student)/vote/[positionId]/…      # ranked nominees, compare, vote
│  ├─ (student)/nominee/[id]/…           # profile, posts, stories, Q&A
│  ├─ (student)/my-votes/page.tsx
│  ├─ (student)/results/page.tsx
│  ├─ (nominee)/studio/…                 # nominee dashboard: profile editor, posts, Q&A
│  ├─ admin/…                            # overview, students, nominees, settings, requests,
│  │                                     # analytics, audit, reminders, banners, moderation, export
│  └─ api/…                              # route handlers (section 9)
├─ components/ (ui/, vote/, nominee/, admin/, shared/)
├─ lib/
│  ├─ firebase/client.ts                 # app, auth, firestore (offline persistence on)
│  ├─ firebase/rest.ts                   # edge Firestore REST helpers
│  ├─ auth/verify-token.ts               # jose JWKS verification
│  ├─ redis.ts · ratelimit.ts
│  ├─ r2.ts · email.ts (Brevo)
│  ├─ vote.ts                            # batched vote write + receipt
│  ├─ validators/ (zod schemas)
│  └─ audit.ts
├─ hooks/ (useStudent, useSession, useTallies, useElection)
├─ firestore.rules · firestore.indexes.json
├─ scripts/ (seed-test-data.ts, load-test.k6.js)
├─ public/ (manifest.json, icons)
├─ .env.example
└─ README.md
```

---

## 11. Build Plan (realistic, dated)

| Phase | When | Deliverable | Done means |
|---|---|---|---|
| **0 · Setup** | 14 Nov | Repo, Firebase project (Blaze + budget alert), Cloudflare, Upstash, R2, Brevo, env config | Hello-world deployed on your domain via Cloudflare |
| **1 · Core** (P0) | 14–15 Nov | Excel import, directory, login (Google + link), correction flow, rules, voting, tallies API | Test student logs in, votes once per position; second vote rejected; wrong email blocked |
| **2 · Admin** (P0) | 16 Nov | Overview, who-voted, students, requests, nominees toggle, settings, pause, banners | Admin runs a full mock election alone |
| **3 · Campaign & polish** (P1) | 16–17 Nov | Nominee studio, posts (R2), Q&A, reactions, receipts, my-votes, live wall, badges, results page, audit log, analytics, reminders, export, dark mode, PWA | Nominees can set up profiles before 19 Nov |
| **4 · Extras** (P2) | 17 Nov (only if 1–3 are solid) | Stories, comments, debate, predictions, pulse poll | — cut without regret if late |
| **5 · Hardening** | 18 Nov | Load test (1,500 simulated users), rules unit tests, mobile QA, real-sheet import, dry run with 20 friends | **Code freeze 18 Nov night** |
| **Live** | 19–20 Nov | Monitor, resolve requests, reminders | Zero lost/double votes |
| **Close** | 21–23 Nov | Results, exports, shutdown page, data deletion | Office has the export; PII deleted |

> 🧠 **Ship rule:** nominees need their profiles ready *before* voting opens, so Phase 3's nominee studio should go out by the morning of 17 Nov at the latest.

---

## 12. Security, Performance & Ops

**Security**
- Rules enforce identity, window, pause, one-vote-per-position, append-only votes and audit logs.
- Masked PII before login; full details only to the verified owner and admins.
- Cloudflare WAF + rate limits on `/login` and `/api/directory` to stop ID enumeration and bots; Firebase App Check (reCAPTCHA Enterprise / Turnstile) on Firestore.
- Anonymous Q&A/comments: identity in admin-only collections.
- Uploads: presigned R2 URLs, type + size limits (images ≤ 2 MB, videos ≤ 30 s / 15 MB).
- Admins by email allow-list; every admin action audited.
- Delete PII after 23 Nov export.

**Performance ("no jerking")**
- Voting path is tiny: dashboard → position → confirm. No heavy media on it.
- Skeleton loaders, optimistic UI on vote, `next/image` + R2 via Cloudflare CDN, lazy-loaded videos (tap to play), code-split admin & studio.
- Tallies animate between values (no layout shift).
- Target: LCP < 2 s on 4G mid-range Android, vote confirm < 500 ms perceived.

**Monitoring**
- Firebase usage dashboard + budget alert, Upstash metrics, Cloudflare analytics.
- Client errors → a lightweight logger (Sentry free tier) — optional.
- Admin "health" card: last vote time, votes/minute, failed writes.

**Testing**
- Firestore rules unit tests with the emulator (double vote, wrong email, paused, closed window, pending student).
- k6 load test against cached APIs.
- Manual mobile QA on 3–4 real phones, slow 3G throttle.

---

## 13. Risks & Edge Cases

| Risk | Impact | Mitigation |
|---|---|---|
| Sheet email ≠ student's actual Gmail | Can't log in on day 1 | Email-link fallback + correction requests; import sheet early and announce "check your details" on 17–18 Nov |
| Someone types a classmate's NIAT ID | Sees their name/masked info | Masking + rate limits; they still can't log in without that inbox |
| Shared/known passwords to a student's Gmail | Impersonation | Out of our control; single-device session + audit log help detect |
| 9 AM rush on tally docs | Write contention, failed votes | Sharded counters; client auto-retry (same doc ID = safe) |
| Free-quota exhaustion | Site down mid-election | Blaze + budget alert; Redis cache; Cloudflare edge cache |
| Brevo daily cap | Reminders/receipts not sent | Receipts in-app always; reminders batched over 2 days |
| Admin mistakes (wrong nominee toggled) | Wrong ballot | Lock nominee changes once voting opens; audit log |
| **Admin can see who voted for whom** | Students' trust / secret-ballot expectations | Tell students clearly on the login page; restrict to 1–2 admins; every view of that screen is audited |
| Live counts create a bandwagon effect | Skewed result | Your call (kept visible) — committee should agree to it in advance |
| Inappropriate posts/comments | Reputational | Admin moderation, report button, delete instantly |
| Official status | Results disputed | Get written approval from the election committee/college before launch |

---

## 14. Environment Variables (`.env.example`)

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_APP_URL=https://elections.yourdomain.com
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=niat-elections-media
R2_PUBLIC_URL=
BREVO_API_KEY=
EMAIL_FROM=elections@yourdomain.com
FIREBASE_SA_CLIENT_EMAIL=        # server-only, for admin REST calls
FIREBASE_SA_PRIVATE_KEY=
```

---

## 15. Open Items (needed from Tarun)
1. The Excel sheet (exact column names).
2. Final list of positions/clubs and their order.
3. Exact voting open/close times and site shutdown date.
4. Domain name (for Cloudflare + email sender).
5. Admin email list.
6. Election committee sign-off on: live counts visible, admin can see voters, nominees voting for themselves.
