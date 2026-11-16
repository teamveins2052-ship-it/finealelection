# AGENTS.md — Instructions for AI Coding Agents

> Read by Claude Code, Cursor, Codex, Copilot and similar tools. Keep it at the **repo root**.
> For Claude Code also create `CLAUDE.md` containing one line: `@AGENTS.md` (or symlink: `ln -s AGENTS.md CLAUDE.md`).

---

## 1. Project in 5 lines

NIAT Campus Elections 2026: a mobile-first voting site for ~1,500 students. Login = NIAT ID → masked details → Google or email link matching the official sheet. One vote per position (6–7 clubs), live anonymous counts, Instagram-style nominee profiles, admin panel. Stack: **Next.js 15 (App Router) on Vercel · Supabase (Postgres + Auth + Realtime + Storage) · Brevo**. No Firebase anywhere — see `docs/FREE_HOSTING.md` for how it fits together.
**Hard deadlines:** code freeze **18 Nov 2026, 22:00 IST** · voting **19–20 Nov** · site shuts down **23 Nov**.

---

## 2. Read Before You Code

All specs live in `docs/`. Read **`docs/MASTER.md` first** — §3 says which doc wins when docs disagree.

| Working on… | Read |
|---|---|
| Anything | `docs/MASTER.md` |
| A feature / screen | `docs/PRD.md` §3 (feature IDs) + `docs/DESIGN.md` §4–8 |
| Data, fields, validation | `docs/SCHEMA.md` (code contract) + `docs/DATAMODEL.md` |
| Rules, auth, permissions | `docs/RLSPOLICIES.md` |
| Services, packages, env | `docs/TECHSTACK.md` |
| Test data | `docs/SEEDDATA.md` |
| Changing existing data | `docs/MIGRATION.md` |

**Precedence:** RLSPOLICIES > SCHEMA > DATAMODEL > TECHSTACK > DESIGN > PRD. Parts of PRD §5/§8/§9 are superseded (see MASTER §3) — do **not** implement Redis-polled tallies or client-side tally increments.

---

## 3. Commands

```bash
npm install
npm run db:apply                          # create/upgrade Supabase tables (idempotent)
npm run build && npm start                # http://localhost:3100 (settings in .env.local)

npm run lint
npx tsc --noEmit
npx vitest run                            # unit

npm run ops:verify                        # read-only health check of the Supabase project
npm run ops:sync                          # rebuild live display, count missed votes, send queued email
```

There is no emulator: local runs use the Supabase project in `.env.local`. Treat it as production.

---

## 4. Repository Map

```
app/(public)/        landing, login, auth callback
app/(student)/       dashboard, vote/[positionId], nominee/[id], my-votes, results, profile
app/(nominee)/studio nominee dashboard
app/admin/           admin panel
app/api/             db (browser reads/writes) · fn/[name] (server actions) · media/upload-url · health · cron/tick
components/          ui/ (shadcn) vote/ nominee/ admin/ shared/
lib/schema/          Zod schemas + types + ids helpers  ← single source of truth for shapes
lib/db/              browser document API, auth, live data (Supabase-backed)
lib/supabase/        browser Supabase client (auth + Realtime only)
functions/src/       server code: rules.ts (security rules) · callables/ · auth/guards.ts · lib/store.ts (Postgres)
supabase/migrations/ tables, RLS, triggers, Realtime, Storage bucket
scripts/             ops/ supabase/
tests/               unit/
```

---

## 5. Non-Negotiable Rules

These protect the election. Breaking one is a blocker, not a style issue.

1. **Never write to production without the human's OK.** The Supabase project in `.env.local` IS production. No data changes, migrations or deploys unless the human asked. Prepare the change; the human deploys.
2. **Votes are append-only.** Never write code that updates or deletes `votes/*`. Never let a client write `tallies`, `auditLogs`, `directory`, counters, `status`, `isNominee`, `receiptCode` or `counted`.
3. **Counting happens only in `countVote`** (`functions/src/triggers/on-vote-created.ts`, idempotent via `counted` flag). Clients write the vote doc only. A database trigger also blocks any vote update/delete.
4. **Never weaken `functions/src/rules.ts` or the RLS setup** in `supabase/migrations/` (RLS on, no browser policies except `rt` public nodes and `_changes`) to make something work. Add the narrowest rule, add a test, and update `docs/RLSPOLICIES.md`.
5. **No identity leaks.** Never put voter identity in data readable by students or nominees. Q&A/comment authors go only in `questionAuthors` / `commentAuthors`. Badges and share images never include the nominee voted for.
6. **No unmasked PII before login.** Pre-login responses use the `directory` masked fields only, via the rate-limited API.
7. **Every input goes through Zod** from `lib/schema` — client forms, API routes and callables. Never hand-build IDs: use `ids.vote()`, `ids.nominee()`, etc.
8. **Every callable starts with a guard** (`requireStudent` / `requireNominee` / `requireAdmin` / `requireVoterAdmin`) + `rateLimit` where user-triggered + Zod parse, then writes an audit log for state changes.
9. **Server time only** for windows and timestamps (`serverTimestamp()`, `request.time`). Never trust the client clock.
10. **No secrets in code or Git.** Use env vars listed in `docs/TECHSTACK.md` §5. Never commit `.env*` (except `.env.example`), service-account JSON, or the student sheet.
11. **Respect the freeze.** After 18 Nov 22:00 IST only bug fixes approved by the human; no schema, rules or dependency changes.

---

## 6. Platform Gotchas

| Gotcha | Do this |
|---|---|
| Database access | Server only (`functions/src/lib/store.ts`, node-postgres via the Supabase pooler). Routes that use it must be `runtime = "nodejs"` |
| Browser data | Through `lib/db/*` → `/api/db` (rules) or `/api/fn` (actions). The browser Supabase client is for sign-in and Realtime only |
| Live counts | `rt` table via Supabase Realtime (`hooks/use-realtime`). Rebuilt at most every 8 s (`lib/live.ts`) — free plan: 2M messages/month, 200 connections. Never poll |
| Listeners | Each `onSnapshot` re-reads through the server on a `_changes` ping. Students: listen only to their own docs |
| `xlsx` from npm is outdated | SheetJS is installed from the CDN tarball (see TECHSTACK §3) |
| Uploads | Browser uploads to Supabase Storage (`media` bucket) with a signed URL from `/api/media/upload-url`; compress images first |
| Background work is best-effort | `runTick` runs after requests + daily cron. Everything it does must be idempotent |
| Single tally doc per position | Writes go through a transaction; if contention appears, switch to sharded counters (DATAMODEL §8) |
| Time zone | Store UTC, display `Asia/Kolkata` with `date-fns-tz` |

---

## 7. Coding Standards

- **TypeScript strict**, no `any` in `lib/` or `functions/`. Infer types from Zod (`z.infer`).
- **Components:** shadcn/ui + Tailwind tokens from `DESIGN.md` §3 (`bg-surface`, `text-muted`, `bg-primary`…). No hard-coded hex in components (club colours come from position data).
- **Every screen handles every state** in `DESIGN.md` §8: loading (skeleton matching layout), empty, error with retry, offline, paused, closed, pending account.
- **Accessibility:** 44 px tap targets, visible focus, labels on inputs, `aria-live="polite"` (throttled) for live counts, respect `prefers-reduced-motion`.
- **Performance:** voting path JS < 150 KB gz; dynamically import admin, studio, charts, confetti, story viewer; animate only `transform`/`opacity`; `next/image` with `sizes`.
- **Errors:** user sees one plain sentence + action (copy in DESIGN §9); logs get structured objects with IDs, never full email/phone.
- **Naming:** files `kebab-case.tsx`, components `PascalCase`, hooks `useThing`, Zod schemas `ThingSchema` / inputs `ThingInput`.
- **Comments:** explain *why*, not *what*. Note any security-relevant decision with a policy ID (e.g. `// P-VOT-02`).
- Prefer editing existing files over creating near-duplicates. Don't add dependencies without a reason stated in the PR; check bundle impact.

---

## 8. How to Do Common Tasks

### Add or change a field
1. Update `docs/SCHEMA.md` (field table + Zod) and `lib/schema/*`.
2. Update `docs/DATAMODEL.md` if structure/flow changes.
3. Update `functions/src/rules.ts` + `docs/RLSPOLICIES.md`; add a test.
4. Add an index in a new `supabase/migrations/NNNN_*.sql` if queried (expression index on `data->'field'`), then `npm run db:apply`.
5. If existing data needs it: a reviewed, idempotent SQL or script per `docs/MIGRATION.md`.
New fields start **optional** (expand → migrate → contract).

### Add a server action
`functions/src/callables/<name>.ts` → `onCall(callOpts, …)` → guard → `rateLimit` → `Input.parse(req.data)` → state checks (phase, active, ownership) → write (`db.runTransaction` if counters) → `audit()` → typed return. Register it in `functions/src/http.ts`. Add a test.

### Add an API route
`app/api/<name>/route.ts`, `runtime = "nodejs"`, Zod-validate input, `verifyAccessToken` (functions/src/lib/auth.ts) for signed-in routes, `rateLimit`. Return `{ error: { code, message } }` with correct status on failure.

### Add a screen
Check the screen spec in `DESIGN.md` §6/§7 → build with existing components → implement all states → mobile 360 px first, then `md`/`lg` → light + dark → keyboard pass.

---

## 9. Definition of Done (every task)

- [ ] Matches the spec (feature ID from PRD §3 referenced in the PR/commit)
- [ ] `npm run lint` and `npx tsc --noEmit` clean (app **and** `functions/`)
- [ ] Unit tests for logic, including any change to `functions/src/rules.ts`; e2e for user flows touched
- [ ] All UI states handled; works at 360 px; light/dark; keyboard
- [ ] No new client write paths to server-owned data; no PII leaks; inputs Zod-validated
- [ ] Docs updated in the same change if data/rules/architecture changed
- [ ] `npm run ops:verify` still passes
- [ ] Short summary of what changed + anything the human must do (env var, deploy step, migration)

---

## 10. When to Stop and Ask the Human

- Anything that would touch **production** (deploy, migrate, import, delete).
- A spec conflict not resolved by MASTER §3 precedence.
- A change to **who can see votes or voter identities**.
- Adding a paid service, a new third-party script, or anything that sends student data to a new destination.
- Removing or renaming a field after **17 Nov**, or any change during the freeze.
- Tests or rules you can't make pass without loosening security.

When blocked on a non-critical detail, pick the option most consistent with the docs, state the assumption in one line in your summary, and continue.

---

## 11. Commit & PR Format

```
feat(vote): confirm sheet with receipt card [V2, V7]
fix(rules): block self-vote when nomineesCanSelfVote=false [P-VOT-02/V-9]
chore(seed): add debate fixtures
docs(schema): add Post.posterUrl
```
PR description: what · why (feature/policy IDs) · how tested · screenshots (mobile + desktop) for UI · follow-ups / human actions.
