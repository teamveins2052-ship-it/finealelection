# NIAT Campus Elections 2026 — Master Document (MASTER.md)

> **Start here.** This is the single entry point to the project: what we're building, which document is authoritative for what, every key decision, the dated build plan, and the commands you'll use daily.
> **Owner:** Tarun Uttupulusu · **Status:** Planning complete, build starts 14 Nov 2026
> **Hard dates:** build done **18 Nov** · voting **19–20 Nov** · site live until **23 Nov**

---

## 1. One-Paragraph Summary

A mobile-first voting platform for ~1,500 NIAT students (≈1,200 seniors + ≈300 juniors). Students enter their **NIAT ID**, see their pre-filled (read-only) details, and sign in with **Google or an email link** that must match the official sheet. They cast **exactly one vote per position** across 6–7 clubs (NSGC, Sports, Media, GenAI, …), watch **live anonymous counts**, and browse Instagram-style **nominee profiles**. Wrong details → correction request → login blocked until an admin fixes it. Admins run everything from a separate panel; only designated **voter-admins** can see who voted for whom. Built on **Next.js + Cloudflare + Firebase**, near-zero cost.

---

## 2. Document Map

| # | File | Answers | Authoritative for |
|---|---|---|---|
| 0 | **MASTER.md** | Where do I start? What overrides what? | Decisions log, build plan, conventions |
| 1 | **PRD.md** | What are we building and why? | Features, roles, user workflows, priorities (P0/P1/P2) |
| 2 | **DESIGN.md** | What does it look and feel like? | Tokens, components, every screen, states, copy, a11y |
| 3 | **TECHSTACK.md** | What tools, and how do they connect? | Services, packages, architecture, costs, environments |
| 4 | **DATAMODEL.md** | How is data organised and why? | Collections, relationships, RTDB, Redis, R2, lifecycles, invariants |
| 5 | **SCHEMA.md** | What exactly is in each field? | Field types, Zod schemas, TS types, converters |
| 6 | **RLSPOLICIES.md** | Who can do what? | `firestore.rules`, RTDB rules, function/API guards, rules tests |
| 7 | **SEEDDATA.md** | How do I get test data? | Seed datasets, test accounts, test Excel, bootstrap |
| 8 | **MIGRATION.md** | How does data change safely? | Migration runner, backups, deploy order, freeze, teardown |

**Reading order for a new contributor:** MASTER → PRD → DESIGN (§1–6) → TECHSTACK (§0–1, §4) → DATAMODEL → RLSPOLICIES (§3, §11). SCHEMA/SEEDDATA/MIGRATION when coding.

---

## 3. Precedence — When Documents Disagree

The PRD was written first; later docs corrected parts of it. **Follow this order:**

1. **RLSPOLICIES.md** — for anything about access or security rules
2. **SCHEMA.md** — for field names, types, validation
3. **DATAMODEL.md** — for structure and data flows
4. **TECHSTACK.md** — for services and architecture
5. **DESIGN.md** — for UI
6. **PRD.md** — for features and intent

### Known superseded parts of PRD.md
| PRD section | What it said | What's true now | Source |
|---|---|---|---|
| §5 Architecture | Students poll a Redis-cached `/api/tallies` every 2–3 s | Students **listen to Firebase Realtime Database** `/tallies` (push, ~1 s). Polling would exceed Cloudflare's 100k requests/day free limit | TECHSTACK §1 |
| §5, §8 | Client writes vote **and** increments tally in one batch; rules verify the +1 | Client writes **only the vote**; Cloud Function `onVoteCreated` counts idempotently and mirrors to RTDB | DATAMODEL §8 |
| §6 Hosting | "Next.js (on Cloudflare)" — Pages implied | **Cloudflare Workers via `@opennextjs/cloudflare`** | TECHSTACK §2.2 |
| §7 Data model | `tallies` readable by everyone | `tallies` admin-only in Firestore; public counts come from RTDB | RLSPOLICIES §3 |
| §8 Rules | Sketch | Full rules + catch-all deny | RLSPOLICIES §5 |
| §9 API | `/api/tallies`, `/api/wall`, `/api/receipt` | Removed — replaced by RTDB listeners and the vote trigger | TECHSTACK §4 |
| §2 Roles | "Admin sees who voted for whom" | Split: **admin** manages, **voter-admin** (`canViewVoters`) sees voters; every view audited | RLSPOLICIES §2 |

> PRD.md will be patched to match; until then, this table wins.

---

## 4. Decisions Log

| ID | Decision | Why | Alternatives rejected |
|---|---|---|---|
| D-01 | Login = NIAT ID → masked details → Google **or** email link to the **sheet's** email | NIAT IDs are guessable; inbox ownership proves identity | ID-only login (impersonation), SMS OTP (paid), password (support load) |
| D-02 | Details read-only; wrong details → request → `pending` → login blocked | User's strict rule; prevents students editing identity | Self-edit |
| D-03 | One vote per position enforced by doc ID `{niatId}_{positionId}` + rules | Database-level uniqueness, works offline/retries | UI-only checks |
| D-04 | Votes immutable, no changes after confirm | Trust, simplicity | Vote change window |
| D-05 | Live counts visible to students during voting | User's call (bandwagon risk flagged) | Hide until close |
| D-06 | Votes anonymous to students; visible to voter-admins only | User wants admin visibility; trust risk mitigated by tiering + audit + disclosure | All admins see votes |
| D-07 | Anonymous Q&A/comments via split author collections | Firestore can't hide fields from readers | Author field in same doc |
| D-08 | Firebase (Auth + Firestore + RTDB + Functions) on **Blaze with ₹400 budget alert** | Free quota still applies; avoids hard stop mid-election; RTDB >100 connections and Functions need it | Spark plan only |
| D-09 | Cloudflare Workers for hosting, behind Cloudflare WAF | No pausing, free bandwidth, rate limiting | Vercel Hobby, Vercel + Cloudflare together |
| D-10 | Upstash Redis for rate limiting + caching public reads | Edge-compatible, protects directory lookup | Redis for live tallies |
| D-11 | Cloudflare R2 for media | Zero egress; Firebase Storage needs Blaze + egress | Firebase Storage, Cloudinary |
| D-12 | Brevo for receipts/reminders/notifications | Firebase Auth only sends sign-in mail | Gmail SMTP |
| D-13 | Videos ≤ 30 s / 15 MB, no server transcoding | Cost and CPU | ffmpeg on server |
| D-14 | Nominees toggled by admin from any student; count is dynamic | User requirement | Fixed 18 |
| D-15 | Nominee changes locked once voting opens | Ballot integrity | Live changes |
| D-16 | "I voted" badge shows club, **never** nominee | Protects ballot secrecy on social media | Badge with nominee name |
| D-17 | Single Next.js app, not a monorepo | One app, 4-day build | Turborepo |
| D-18 | Site shuts down after 23 Nov; PII deleted after official export | Time-boxed, privacy | Keep running |
| D-19 | Telugu toggle — **not** building | User declined | — |
| D-20 | Get written election-committee sign-off before launch | Results must be defensible | Unofficial launch |

---

## 5. Feature Scope (summary)

Full list with IDs in PRD §3. Priorities: **P0** must ship · **P1** ship if P0 solid · **P2** cut first.

| Area | P0 | P1 | P2 |
|---|---|---|---|
| Identity | Excel import, NIAT lookup (masked), Google + email link, read-only profile, correction requests, lifecycle | Single-device session | — |
| Voting | Positions, one vote/position, confirm, progress, live counts, voting window + countdown | Offline queue, receipts, My Votes, compare view | — |
| Nominees | Admin toggle, profile (photo, bio, promises) | Posts grid, Q&A, reactions | Stories, comments, debate corner |
| Engagement | Banners | Live wall, "I voted" badge, results page, dark mode, PWA | Predictions, pulse polls |
| Admin | Overview/turnout, who-voted (voter-admin), students, requests, nominees, settings + pause | Audit log, reminders, analytics, export, moderation | — |

---

## 6. Architecture (current, authoritative)

```
Phone (PWA, Next.js UI)
   │
   ├─► Cloudflare (DNS · WAF · rate limit · Turnstile)
   │      └─► Workers (Next.js via OpenNext)
   │             ├─ /api/directory/:id   → Upstash Redis → Firestore REST   (masked lookup)
   │             ├─ /api/positions|nominees|banners|settings (cached public reads)
   │             ├─ /api/media/upload-url → presigned PUT → Cloudflare R2
   │             └─ /api/og/*            (share images)
   │
   ├─► Firebase Auth (Google / email link)  → verified email in ID token
   ├─► Firestore (direct SDK) — write own vote, read own data, profiles, content (rules-enforced)
   └─► Realtime Database (read-only) — /tallies /wall /election  (live push)

Firestore votes/{id} created ─► Cloud Function onVoteCreated
        → idempotent tally +1 → RTDB mirror → wall → audit → receipt email (Brevo)
Admin panel ─► Firestore listeners + callable functions (import, nominees, reminders, export, recount)
```

---

## 7. Conventions

| Topic | Convention |
|---|---|
| IDs | NIAT ID uppercase; position slug kebab-case; nominee `{positionId}_{niatId}`; vote `{niatId}_{positionId}` — always via `ids.*` helpers |
| Time | Store UTC `Timestamp`; display **IST** (`Asia/Kolkata`); server time only for rules/functions |
| Validation | Every input parsed with Zod from `lib/schema` — client, API routes and functions share schemas |
| Errors | User-facing: plain sentence + action. Logs: structured JSON with `niatId`/`action`, never full email/phone |
| Code style | TypeScript `strict`, ESLint + Prettier, no `any` in `lib/` |
| Branches | `main` = prod, `staging` = staging, feature branches → PR → staging |
| Commits | Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:` |
| Secrets | Never in Git; Cloudflare `wrangler secret`, Firebase `functions:secrets`, `.env.local` git-ignored |
| PII | Student sheet never committed, never pasted into chats or issue trackers |
| Docs | Any change to data/rules updates SCHEMA → DATAMODEL → RLSPOLICIES in the same PR |

---

## 8. Dated Build Plan

| Date | Phase | Deliverables | Done means | Docs |
|---|---|---|---|---|
| **Sat 14 Nov** | 0 · Setup | Repo, Next.js + shadcn, Firebase staging/prod (Blaze + budget), Cloudflare, Upstash, R2, Brevo, emulators, first deploy | Staging URL live; emulator login works | TECHSTACK §10 |
| **14–15 Nov** | 1 · Core (P0) | `lib/schema`, rules + tests, seed scripts, NIAT lookup API, login (Google + link), correction flow, dashboard, voting, `onVoteCreated`, RTDB live counts | Rules tests green; vote once per position; second vote rejected; wrong email blocked | SCHEMA, RLSPOLICIES, DATAMODEL §8 |
| **Mon 16 Nov** | 2 · Admin (P0) | Overview, students + import, requests, nominee toggle, settings/pause, banners, who-voted; **import real sheet on staging** | Admin runs a full mock election alone | PRD §3.5, MIGRATION §7 |
| **16–17 Nov** | 3 · Campaign & polish (P1) | Nominee studio + R2 uploads, posts, Q&A, reactions, receipts, My Votes, live wall, badges, results page, audit log, analytics, reminders, export, dark mode, PWA | **Nominee studio live by 17 Nov morning**; real students imported to prod | DESIGN §6–7 |
| **17 Nov** | 4 · Extras (P2) | Stories, comments, debate, predictions, pulse polls — only if 1–3 solid | — (cut without regret) | PRD §3 |
| **Wed 18 Nov** | 5 · Hardening | Load test 1,500 users, mobile QA, App Check enforce, dry run with 20 friends, go-live checklists | **Code freeze 22:00 IST** | RLSPOLICIES §13, MIGRATION §11 |
| **19–20 Nov** | Live | Monitor, resolve requests, reminders, repair migrations only | Zero lost/double votes | MIGRATION §8–9 |
| **20–21 Nov** | Results | Publish results, export, hand to college office | Office has export | MIGRATION §10 |
| **23 Nov** | Close | Concluded page, final backup, PII teardown | PII deleted | MIGRATION §10 |

---

## 9. Repository Layout (target)

```
niat-elections/
├─ docs/                    ← all 9 .md files live here
├─ app/                     (public)/ (student)/ (nominee)/ admin/ api/
├─ components/              ui/ vote/ nominee/ admin/ shared/
├─ lib/
│  ├─ schema/               common.ts entities.ts inputs.ts realtime.ts converters.ts
│  ├─ firebase/             client.ts rest.ts
│  ├─ auth/                 verify-token.ts
│  └─ redis.ts ratelimit.ts r2.ts email.ts vote.ts audit.ts
├─ hooks/
├─ functions/               src/{triggers,callables,auth/guards.ts,schema→../lib/schema}
├─ scripts/                 seed/ migrate/ backup.sh
├─ tests/                   rules/ unit/ e2e/ load/
├─ public/                  manifest.json icons/ seed-media/
├─ firestore.rules  firestore.indexes.json  database.rules.json  firebase.json
├─ wrangler.toml  open-next.config.ts
└─ .env.example
```

---

## 10. Daily Commands

```bash
# local
npm run emulators                       # Auth, Firestore, RTDB, Functions emulators
npm run seed:reset && npm run seed      # fresh dev data, voting live
npm run dev                             # app on localhost:3000

# quality
npm run lint && npx tsc --noEmit
firebase emulators:exec --only firestore "npx vitest run tests/rules"
npx playwright test

# migrations
npm run migrate:status
npm run migrate -- up <id> --dry-run

# deploy (order matters — MIGRATION §6)
firebase deploy --only firestore:indexes -P staging
firebase deploy --only functions -P staging
firebase deploy --only firestore:rules,database -P staging
npx opennextjs-cloudflare build && npx wrangler deploy --env staging
```

---

## 11. Election-Day Runbook (19–20 Nov)

| Time (IST) | Action |
|---|---|
| 08:00 | Check dashboards (Firebase usage, Cloudflare, Sentry); `verifyIntegrity` green; banner "Voting opens at 9" |
| 09:00 | Voting opens automatically (`scheduledLifecycle`); watch first 50 votes land; RTDB counts updating |
| Hourly | Turnout by batch → reminders to lagging segments (respect Brevo cap) · resolve correction requests |
| Any problem | **Pause** (admin panel) → banner explains → diagnose → repair migration (`9001`/`9002`/`9003`) → resume |
| 17:00 day 2 | Voting closes automatically; run `9001_recount_tallies` twice (expect "no drift") |
| After close | Committee review → publish results → export → hand over |

**Incident triage:**
| Symptom | First move |
|---|---|
| Students can't log in | Check Firebase Auth status, authorised domains, App Check metrics |
| Counts not moving | Check `onVoteCreated` logs; run `9002` |
| Counts look wrong | `9001` recount (never restore votes from backup) |
| Site slow / 5xx | Cloudflare Workers analytics (CPU / request limit) → upgrade Workers Paid ($5) if limited |
| Spam / abuse in Q&A | Hide in Content moderation; rate limits already applied |
| Budget alert email | Check which service; RTDB bandwidth is the usual suspect — consider lowering share-image usage |

---

## 12. Open Items (blocking)

| # | Needed | From | By |
|---|---|---|---|
| 1 | Official student Excel sheet + exact column names | College office | 16 Nov |
| 2 | Final positions/clubs list and order | Election committee | 15 Nov |
| 3 | Exact voting open/close times; site shutdown date | Election committee | 15 Nov |
| 4 | Domain/subdomain (for Cloudflare, R2 media, Brevo sender) | Tarun | 14 Nov |
| 5 | Admin and voter-admin email lists | Tarun + committee | 16 Nov |
| 6 | Written sign-off: live counts visible, voter-admin visibility, nominee self-vote | Election committee | 17 Nov |
| 7 | Nominee list per position | Election committee | 16 Nov (campaign opens 17 Nov) |

---

## 13. Risks (top 8)

| Risk | Mitigation | Owner doc |
|---|---|---|
| Sheet emails don't match students' real Gmail | Email-link fallback, correction requests, "check your details" on 17 Nov | PRD §4.2 |
| Free-tier limits hit mid-election | Blaze + budget alert, RTDB push instead of polling, Workers Paid as fallback | TECHSTACK §1, §8 |
| Tally contention at 9 AM rush | Transactions + retries; shard counters if load test shows contention | DATAMODEL §8 |
| Double/lost votes | Deterministic IDs, rules, idempotent trigger, recount | RLSPOLICIES §11 |
| Trust: admins seeing votes | Voter-admin tier, audit, disclosure on login page | RLSPOLICIES §10 |
| Scope (30+ features in 4 days) | P0/P1/P2 tiers; P2 cut first | PRD §3 |
| Prod accident (seed/migration) | Prod guards, backups, dry-runs, freeze | SEEDDATA §1, MIGRATION §2 |
| Unofficial / disputed result | Committee sign-off, receipts, audit log, exports | MIGRATION §10 |

---

## 14. Using These Docs With an AI Coding Tool

Put `docs/` in the repo and start each task with a prompt like:

```
Read docs/MASTER.md (precedence §3), then docs/SCHEMA.md and docs/RLSPOLICIES.md.
Task: implement <feature ID from PRD §3> for <role>.
Constraints: use lib/schema Zod schemas and ids.* helpers; no new collections or fields
without updating SCHEMA.md + DATAMODEL.md + firestore.rules + rules tests; follow DESIGN.md
tokens/components and the states matrix (§8); production-quality error handling.
Deliver: full files, not snippets; list any doc updates needed.
```

---

## 15. Change Log

| Date | Change |
|---|---|
| 14 Nov 2026 | PRD, DESIGN, TECHSTACK (RTDB live counts), DATAMODEL, SCHEMA, RLSPOLICIES (voter-admin tier), SEEDDATA, MIGRATION, MASTER created |
