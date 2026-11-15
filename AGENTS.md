# AGENTS.md — Instructions for AI Coding Agents

> Read by Claude Code, Cursor, Codex, Copilot and similar tools. Keep it at the **repo root**.
> For Claude Code also create `CLAUDE.md` containing one line: `@AGENTS.md` (or symlink: `ln -s AGENTS.md CLAUDE.md`).

---

## 1. Project in 5 lines

NIAT Campus Elections 2026: a mobile-first voting site for ~1,500 students. Login = NIAT ID → masked details → Google or email link matching the official sheet. One vote per position (6–7 clubs), live anonymous counts, Instagram-style nominee profiles, admin panel. Stack: **Next.js 15 (App Router) on Cloudflare Workers (OpenNext) · Firebase Auth + Firestore + Realtime Database + Cloud Functions · Upstash Redis · Cloudflare R2 · Brevo**.
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
npm run emulators                         # Firebase emulators (Auth, Firestore, RTDB, Functions)
npm run seed:reset && npm run seed        # dev data; add --phase=campaign|voting|paused|closed|results
npm run dev                               # http://localhost:3000

npm run lint
npx tsc --noEmit
npx vitest run                            # unit
firebase emulators:exec --only firestore "npx vitest run tests/rules"   # security rules
npx playwright test                       # e2e

cd functions && npm run build             # Cloud Functions typecheck/build
npm run migrate:status
```

Test logins (emulator, password `password123`): `voter@niat.test`, `halfdone@niat.test`, `alldone@niat.test`, `pending@niat.test`, `nominee@niat.test`, `admin@niat.test`, `judge@niat.test` (voter-admin). Full list: `docs/SEEDDATA.md` §4.

---

## 4. Repository Map

```
app/(public)/        landing, login, auth callback
app/(student)/       dashboard, vote/[positionId], nominee/[id], my-votes, results, profile
app/(nominee)/studio nominee dashboard
app/admin/           admin panel
app/api/             edge route handlers (directory, cached public reads, media upload-url, og)
components/          ui/ (shadcn) vote/ nominee/ admin/ shared/
lib/schema/          Zod schemas + types + ids helpers  ← single source of truth for shapes
lib/firebase/        client.ts (browser SDK), rest.ts (edge Firestore REST)
lib/auth/            verify-token.ts (jose, edge)
functions/src/       triggers/ callables/ auth/guards.ts
scripts/             seed/ migrate/ backup.sh
tests/               rules/ unit/ e2e/ load/
firestore.rules  database.rules.json  firestore.indexes.json
```

---

## 5. Non-Negotiable Rules

These protect the election. Breaking one is a blocker, not a style issue.

1. **Never write to production.** No commands with `-P prod`, `niat-elections-prod`, or prod credentials. No `firebase deploy` to prod, no `wrangler deploy` to prod, no prod migrations. Prepare the change; the human deploys.
2. **Votes are append-only.** Never write code that updates or deletes `votes/*`. Never let a client write `tallies`, `auditLogs`, `directory`, counters, `status`, `isNominee`, `receiptCode` or `counted`.
3. **Counting happens only in `onVoteCreated`** (idempotent via `counted` flag). Clients write the vote doc only.
4. **Never weaken `firestore.rules` or `database.rules.json`** to make something work. If a feature needs access, add the narrowest rule, add tests in `tests/rules/`, and update `docs/RLSPOLICIES.md`.
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
| `firebase-admin` doesn't run on Cloudflare's edge runtime | In `app/api/*` use `lib/firebase/rest.ts` (Firestore REST) and `lib/auth/verify-token.ts` (jose). Admin SDK only in `functions/` and `scripts/` |
| Workers free plan: ~100k requests/day, low CPU per request | Keep student pages as client components on a static shell; no polling APIs; heavy work goes to Functions |
| Live counts | Subscribe to RTDB `/tallies`, `/wall`, `/election` via `hooks/useTallies` etc. Never poll |
| Firestore listeners cost reads per client | Students: listen only to their own docs. Admins may use broader listeners |
| `xlsx` from npm is outdated | SheetJS is installed from the CDN tarball (see TECHSTACK §3) |
| Upstash | Use `@upstash/redis` (HTTP). Normal TCP Redis clients won't work on the edge |
| R2 uploads | Browser uploads directly with a presigned URL from `/api/media/upload-url`; compress images client-side first |
| Function triggers are at-least-once | Make every trigger idempotent |
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
3. Update `firestore.rules` + `docs/RLSPOLICIES.md`; add/adjust `tests/rules/` cases.
4. Add indexes to `firestore.indexes.json` if queried.
5. If existing data needs it: add a migration in `scripts/migrate/migrations/` (idempotent, dry-run aware) per `docs/MIGRATION.md`.
6. Update seeds in `scripts/seed/` so dev data has the field.
New fields start **optional** (expand → migrate → contract).

### Add a callable function
`functions/src/callables/<name>.ts` → `onCall({ region: "asia-south1", enforceAppCheck: true })` → guard → `rateLimit` → `Input.parse(req.data)` → state checks (phase, active, ownership) → write (transaction if counters) → `audit()` → typed return. Export from `functions/src/index.ts`. Add a test.

### Add an edge API route
`app/api/<name>/route.ts`, `export const runtime = "edge"` (or OpenNext default), Zod-validate params, Upstash rate limit, Redis cache-aside for public reads, `verifyFirebaseToken` for authenticated routes. Return `{ error: { code, message } }` with correct status on failure.

### Add a screen
Check the screen spec in `DESIGN.md` §6/§7 → build with existing components → implement all states → mobile 360 px first, then `md`/`lg` → light + dark → keyboard pass.

---

## 9. Definition of Done (every task)

- [ ] Matches the spec (feature ID from PRD §3 referenced in the PR/commit)
- [ ] `npm run lint` and `npx tsc --noEmit` clean (app **and** `functions/`)
- [ ] Unit tests for logic; **rules tests** for any rules change; e2e for user flows touched
- [ ] All UI states handled; works at 360 px; light/dark; keyboard
- [ ] No new client write paths to server-owned data; no PII leaks; inputs Zod-validated
- [ ] Docs updated in the same change if data/rules/architecture changed
- [ ] Seed data still runs: `npm run seed:reset && npm run seed`
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
