# NIAT Campus Elections 2026 — Migrations (MIGRATION.md)

> Companion to `DATAMODEL.md`, `SCHEMA.md`, `RLSPOLICIES.md`, `SEEDDATA.md`.
> Firestore has no built-in migrations (no `prisma migrate`), so this defines **how data and schema change safely**: a versioned migration runner, backups, the real-student import, deploy order for rules/indexes/functions, election-day freeze, emergency repair migrations, and the post-election teardown.

---

## 1. What "migration" covers here

| Kind | Example | Tool |
|---|---|---|
| **Data migrations** | Backfill a new field, rebuild `directory`, recount tallies | Migration runner (§4) |
| **Schema changes** | New optional field, renamed enum value | Expand → migrate → contract (§3) |
| **Config migrations** | `firestore.rules`, `database.rules.json`, `firestore.indexes.json`, Functions | `firebase deploy` in a fixed order (§6) |
| **Real data load** | Official student Excel → prod | Admin import screen, rehearsed on staging (§7) |
| **Mirror rebuilds** | Redis cache, RTDB `/tallies`, `/wall` | Repair migrations (§9) |
| **Teardown** | Export, archive, delete PII after 23 Nov | Teardown migration (§10) |

---

## 2. Rules of the Road

1. **Backup before every prod migration.** No backup, no run (§5).
2. **Every migration is idempotent.** Running it twice gives the same result. It may crash halfway and be re-run.
3. **Dry-run first, always.** `--dry-run` prints what would change, with counts.
4. **Staging before prod.** Same migration, same command, staging first.
5. **Votes are never migrated in place.** `votes` is append-only — migrations may *read* votes, never update or delete them (teardown deletes only after the official export).
6. **Expand–contract for schema changes.** Never rename/remove a field in one step.
7. **Freeze windows** (§8): no schema migrations from **18 Nov 22:00 IST to 21 Nov 09:00 IST**. Only the emergency repair migrations in §9.
8. **Every prod run is logged** in `_migrations/{id}` and in `auditLogs` (`action: "migration_run"`).

---

## 3. Schema Change Pattern (Expand → Migrate → Contract)

Example: renaming `nominees.bio` → `nominees.about`.

| Step | Change | Safe because |
|---|---|---|
| 1. **Expand** | Add `about` as optional in `SCHEMA.md` + Zod; UI reads `about ?? bio`; writers write **both** | Old and new code both work |
| 2. **Rules** | Allow nominee updates to include `about` (keep `bio`) | Clients writing either field pass |
| 3. **Migrate** | Migration copies `bio → about` where `about` is missing | Idempotent (skips filled docs) |
| 4. **Switch** | UI reads only `about`; writers write only `about` | Data is complete |
| 5. **Contract** | Migration removes `bio`; rules/Zod drop it | Nothing reads it anymore |

> During the 14–18 Nov build window, prefer **just adding optional fields** — contract steps can wait until after the election (or never, since the site is shut down on 23 Nov).

---

## 4. Migration Runner

### 4.1 Layout
```
scripts/migrate/
├─ run.ts                      # CLI: list | up <id|all> | down <id> | status
├─ context.ts                  # db, rtdb, logger, dryRun, batched helpers
├─ types.ts
└─ migrations/
   ├─ 0001_bootstrap_settings_positions.ts
   ├─ 0002_rebuild_directory.ts
   ├─ 0003_backfill_student_vote_counters.ts
   ├─ 0004_add_settings_receipts_flag.ts
   ├─ 0005_backfill_nominee_counters.ts
   ├─ 9001_recount_tallies.ts            # repair (allowed during freeze)
   ├─ 9002_rebuild_rtdb_mirrors.ts       # repair (allowed during freeze)
   ├─ 9003_purge_redis_cache.ts          # repair (allowed during freeze)
   └─ 9900_post_election_teardown.ts     # after official export only
```
`0xxx` = forward migrations run once, in order. `9xxx` = repair/maintenance migrations, re-runnable any time.

`package.json`:
```json
{
  "scripts": {
    "migrate": "tsx scripts/migrate/run.ts",
    "migrate:status": "tsx scripts/migrate/run.ts status",
    "backup:prod": "bash scripts/backup.sh"
  }
}
```

### 4.2 `scripts/migrate/types.ts`
```ts
import type { Firestore } from "firebase-admin/firestore";
import type { Database } from "firebase-admin/database";

export interface MigrationContext {
  db: Firestore;
  rtdb: Database;
  dryRun: boolean;
  projectId: string;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  /** Iterate a whole collection in pages of `pageSize`, ordered by document ID (stable, resumable). */
  forEachPage: <T = FirebaseFirestore.DocumentData>(
    collection: string,
    fn: (docs: FirebaseFirestore.QueryDocumentSnapshot<T>[]) => Promise<void>,
    pageSize?: number,
  ) => Promise<number>;
  /** Batched writer that respects dryRun and the 500-op batch limit. */
  writer: () => {
    set: (path: string, data: object, merge?: boolean) => void;
    update: (path: string, data: object) => void;
    delete: (path: string) => void;
    commit: () => Promise<{ writes: number }>;
  };
}

export interface MigrationResult { scanned: number; changed: number; notes?: string }

export interface Migration {
  id: string;                       // "0002_rebuild_directory"
  description: string;
  /** Repair migrations may run during the election freeze. */
  kind: "forward" | "repair" | "teardown";
  /** Refuse to run unless the current election phase is one of these. */
  allowedPhases?: Array<"setup" | "campaign" | "voting" | "closed" | "results" | "concluded">;
  up: (ctx: MigrationContext) => Promise<MigrationResult>;
  down?: (ctx: MigrationContext) => Promise<MigrationResult>;
}
```

### 4.3 `scripts/migrate/context.ts`
```ts
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldPath, type WriteBatch } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";
import type { MigrationContext } from "./types";

export function createContext(dryRun: boolean): MigrationContext {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required");
  if (!getApps().length) {
    initializeApp({
      projectId,
      databaseURL: process.env.FIREBASE_DATABASE_URL,
      ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }),
    });
  }
  const db = getFirestore();
  const rtdb = getDatabase();

  const log: MigrationContext["log"] = (msg, extra) =>
    console.log(`${dryRun ? "[dry-run] " : ""}${msg}`, extra ? JSON.stringify(extra) : "");

  const forEachPage: MigrationContext["forEachPage"] = async (collection, fn, pageSize = 300) => {
    let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let total = 0;
    for (;;) {
      let q = db.collection(collection).orderBy(FieldPath.documentId()).limit(pageSize);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      await fn(snap.docs as never);
      total += snap.size;
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }
    return total;
  };

  const writer: MigrationContext["writer"] = () => {
    let batch: WriteBatch = db.batch();
    let ops = 0;
    let writes = 0;
    const pending: Promise<unknown>[] = [];
    const bump = () => {
      writes++;
      if (++ops >= 450) {
        if (!dryRun) pending.push(batch.commit());
        batch = db.batch();
        ops = 0;
      }
    };
    return {
      set: (path, data, merge = false) => { if (!dryRun) batch.set(db.doc(path), data, { merge }); bump(); },
      update: (path, data) => { if (!dryRun) batch.update(db.doc(path), data); bump(); },
      delete: (path) => { if (!dryRun) batch.delete(db.doc(path)); bump(); },
      commit: async () => {
        if (ops && !dryRun) pending.push(batch.commit());
        await Promise.all(pending);
        return { writes };
      },
    };
  };

  return { db, rtdb, dryRun, projectId, log, forEachPage, writer };
}
```

### 4.4 `scripts/migrate/run.ts`
```ts
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { FieldValue } from "firebase-admin/firestore";
import { createContext } from "./context";
import type { Migration } from "./types";

const [cmd = "status", target] = process.argv.slice(2);
const dryRun = process.argv.includes("--dry-run");
const yes = process.argv.includes("--yes");
const force = process.argv.includes("--force"); // re-run a forward migration already applied

// Freeze window (IST) — only repair migrations allowed
const FREEZE_START = new Date("2026-11-18T22:00:00+05:30").getTime();
const FREEZE_END = new Date("2026-11-21T09:00:00+05:30").getTime();

async function loadMigrations(): Promise<Migration[]> {
  const dir = join(__dirname, "migrations");
  const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.ts$/.test(f)).sort();
  return Promise.all(files.map(async (f) => (await import(join(dir, f))).default as Migration));
}

async function confirm(question: string) {
  if (yes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`${question} Type the project ID to continue: `);
  rl.close();
  return ans.trim() === process.env.FIREBASE_PROJECT_ID;
}

async function main() {
  const ctx = createContext(dryRun);
  const isProd = /prod/i.test(ctx.projectId);
  const migrations = await loadMigrations();
  const applied = new Map(
    (await ctx.db.collection("_migrations").get()).docs.map((d) => [d.id, d.data()]),
  );

  if (cmd === "status" || cmd === "list") {
    for (const m of migrations) {
      const a = applied.get(m.id);
      console.log(`${a ? "✅" : "⬜"} ${m.id.padEnd(40)} ${m.kind.padEnd(9)} ${a ? `ran ${a.finishedAt?.toDate?.().toISOString()}` : ""}`);
    }
    return;
  }

  const settings = (await ctx.db.doc("settings/election").get()).data();
  const phase = settings?.phase ?? "setup";
  const inFreeze = Date.now() >= FREEZE_START && Date.now() < FREEZE_END;

  const toRun =
    target === "all"
      ? migrations.filter((m) => m.kind === "forward" && (!applied.has(m.id) || force))
      : migrations.filter((m) => m.id === target || m.id.startsWith(`${target}_`));
  if (!toRun.length) { console.log("Nothing to run."); return; }

  for (const m of toRun) {
    if (cmd === "up" && m.kind === "forward" && applied.has(m.id) && !force) { console.log(`⏭️  ${m.id} already applied`); continue; }
    if (inFreeze && m.kind !== "repair") throw new Error(`❄️  Freeze window: only repair migrations allowed (blocked ${m.id}).`);
    if (m.allowedPhases && !m.allowedPhases.includes(phase)) throw new Error(`${m.id} not allowed in phase "${phase}".`);
    if (cmd === "down" && !m.down) throw new Error(`${m.id} has no down().`);

    if (isProd && !dryRun) {
      const backupNote = process.env.BACKUP_ID ? `Backup: ${process.env.BACKUP_ID}.` : "⚠️  No BACKUP_ID set.";
      if (!process.env.BACKUP_ID && m.kind !== "repair") throw new Error("Prod run requires BACKUP_ID (run npm run backup:prod first).");
      if (!(await confirm(`About to run ${cmd} ${m.id} on PROD. ${backupNote}`))) throw new Error("Aborted.");
    }

    console.log(`▶️  ${cmd} ${m.id} — ${m.description}`);
    const started = Date.now();
    const result = cmd === "down" ? await m.down!(ctx) : await m.up(ctx);
    const ms = Date.now() - started;
    console.log(`✔️  ${m.id}: scanned ${result.scanned}, changed ${result.changed} in ${ms} ms ${result.notes ?? ""}`);

    if (!dryRun) {
      const record = {
        id: m.id, kind: m.kind, direction: cmd, scanned: result.scanned, changed: result.changed,
        notes: result.notes ?? null, durationMs: ms, backupId: process.env.BACKUP_ID ?? null,
        ranBy: process.env.USER ?? "unknown", finishedAt: FieldValue.serverTimestamp(),
      };
      if (cmd === "down") await ctx.db.doc(`_migrations/${m.id}`).delete();
      else await ctx.db.doc(`_migrations/${m.id}`).set(record);
      await ctx.db.collection("auditLogs").add({
        actor: "system", actorRole: "system", action: "migration_run",
        target: `_migrations/${m.id}`, meta: { direction: cmd, scanned: result.scanned, changed: result.changed },
        at: FieldValue.serverTimestamp(),
      });
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(`❌ ${e.message ?? e}`); process.exit(1); });
```
> Add `"migration_run"` to the `AuditAction` enum in `SCHEMA.md` / `lib/schema/common.ts`. `_migrations` is already covered by the catch-all deny rule in `RLSPOLICIES.md` (server-only).

Usage:
```bash
npm run migrate:status
npm run migrate -- up 0002 --dry-run
npm run migrate -- up 0002
npm run migrate -- up all
npm run migrate -- up 9001                       # repair, re-runnable
BACKUP_ID=2026-11-17T2200 npm run migrate -- up all   # prod (asks you to type the project ID)
```

---

## 5. Backups & Restore

### 5.1 One-time setup (prod, Blaze required)
```bash
# Bucket for exports, same region as Firestore
gcloud storage buckets create gs://niat-elections-prod-backups --location=asia-south1
# Point-in-time recovery: read any version of the DB from the last 7 days
gcloud firestore databases update --database='(default)' --enable-pitr
# Scheduled daily backups (kept 7 days)
gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=7d
```
> PITR and scheduled backups add small storage costs (a few rupees at this data size). Worth it for an election.

### 5.2 `scripts/backup.sh` — manual export before any prod migration
```bash
#!/usr/bin/env bash
set -euo pipefail
PROJECT="${FIREBASE_PROJECT_ID:?set FIREBASE_PROJECT_ID}"
STAMP="$(TZ=Asia/Kolkata date +%Y-%m-%dT%H%M)"
gcloud firestore export "gs://${PROJECT}-backups/firestore/${STAMP}" --project="$PROJECT"
# RTDB is only a mirror (rebuildable), but snapshot it anyway
curl -s "$(gcloud auth print-access-token | xargs -I{} echo "${FIREBASE_DATABASE_URL}/.json?access_token={}")" \
  > "backups/rtdb-${STAMP}.json" || echo "RTDB snapshot skipped"
echo "BACKUP_ID=${STAMP}"
```

### 5.3 Restore playbook
| Situation | Action |
|---|---|
| A migration wrote bad data to a few docs | Read old values with **PITR** (`read_time` = before the run) and write them back with a script |
| A migration corrupted a whole collection | `gcloud firestore import gs://…/firestore/<STAMP> --collection-ids=<collection>` (overwrites docs with same IDs; docs created after the backup remain — delete them first if needed) |
| RTDB mirror wrong | Don't restore — run `9002_rebuild_rtdb_mirrors` |
| Redis serving stale data | Run `9003_purge_redis_cache` |
| Tallies look wrong | Run `9001_recount_tallies` (recomputes from votes) |

> ⚠️ **Never** restore the `votes` collection from a backup during voting — it would drop votes cast after the backup. Votes are fixed by recounting, not restoring.

---

## 6. Deploy Order (rules · indexes · functions · app)

Wrong order is the most common way to break a live Firebase app. Always:

| # | Deploy | Command | Why this order |
|---|---|---|---|
| 1 | **Indexes** | `firebase deploy --only firestore:indexes -P <env>` | Index builds take minutes; queries fail without them |
| 2 | Wait for indexes = **Enabled** | Firebase console → Indexes | — |
| 3 | **Functions** | `firebase deploy --only functions -P <env>` | New code that writes new fields goes live before rules expect them |
| 4 | **Rules (expand)** | `firebase deploy --only firestore:rules,database -P <env>` | Accept both old and new shapes |
| 5 | **Data migration** | `npm run migrate -- up <id>` | Fill new fields |
| 6 | **App** | `npx opennextjs-cloudflare build && npx wrangler deploy --env <env>` | Clients start using new fields |
| 7 | **Rules (contract)** — later | same as 4 | Only after all clients updated |

Rules changes are **instant** for every client — always run the rules test suite (`RLSPOLICIES.md §12`) against the exact file before deploying it.

---

## 7. Real Student Data Load (the most important "migration")

| When | Step | Done means |
|---|---|---|
| **16 Nov** | Receive official sheet. Check columns against `IMPORT_HEADER_MAP`. Never commit it to Git or upload to chat logs. | Columns map with no unknowns |
| 16 Nov | Import into **staging** via admin panel | Preview: counts of valid / warnings / errors |
| 16 Nov | Fix the source sheet (duplicates, bad emails) with the college office — don't "fix" data silently | Error count = 0 (warnings reviewed) |
| 16 Nov | Spot-check 20 random students on staging: lookup → masked details correct | 20/20 match |
| **17 Nov** | `npm run backup:prod` → import into **prod** via admin panel (`importStudents` callable) | `students` count == sheet rows − rejected |
| 17 Nov | Run `0002_rebuild_directory` on prod (idempotent safety net) | `directory` count == `students` count |
| 17 Nov | Reconcile: total, seniors, juniors, unique emails | Matches sheet totals |
| 17 Nov | Announce "check your details" so corrections arrive **before** voting | Correction requests flowing in |
| 18 Nov | Re-import updated sheet if the office sends one (upsert by NIAT ID; never touches status/votes) | Diff report reviewed |

**Reconciliation query (run in a script, prod read-only):**
```ts
const all = await db.collection("students").count().get();
const juniors = await db.collection("students").where("batch", "==", "2026").count().get();
const active = await db.collection("students").where("status", "==", "active").count().get();
console.log({ total: all.data().count, juniors: juniors.data().count, active: active.data().count });
```

---

## 8. Timeline & Freeze Windows

| Window (IST) | Allowed |
|---|---|
| 14–16 Nov | Anything (build phase), staging first |
| 17 Nov | Forward migrations with backup; real data import |
| 18 Nov until 22:00 | Last forward migrations; final rules/index deploys; load test |
| **18 Nov 22:00 → 21 Nov 09:00** | ❄️ **Freeze.** Only `9001`, `9002`, `9003`; correction-request fixes through the admin panel; emergency pause |
| 21–23 Nov | Results, exports; no schema changes needed |
| After official export | `9900_post_election_teardown` |

The runner enforces the freeze automatically (§4.4).

---

## 9. Migrations — Code

### 9.1 `0001_bootstrap_settings_positions.ts`
Thin wrapper so a fresh environment can be brought up by the runner alone (same logic as `bootstrap-prod.ts` in `SEEDDATA.md`).
```ts
import { FieldValue } from "firebase-admin/firestore";
import type { Migration } from "../types";
import { POSITIONS } from "../../seed/positions";

const m: Migration = {
  id: "0001_bootstrap_settings_positions",
  description: "Create positions + empty tallies if missing (never overwrites)",
  kind: "forward",
  allowedPhases: ["setup", "campaign"],
  async up({ db, writer, log }) {
    const w = writer();
    let changed = 0;
    for (const [i, p] of POSITIONS.entries()) {
      if ((await db.doc(`positions/${p.id}`).get()).exists) continue;
      w.set(`positions/${p.id}`, {
        id: p.id, name: p.name, club: p.club, color: p.color, icon: p.icon, description: "",
        order: i + 1, active: true, nomineeCount: 0,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      w.set(`tallies/${p.id}`, { positionId: p.id, counts: {}, total: 0, updatedAt: FieldValue.serverTimestamp() });
      changed++;
      log(`+ position ${p.id}`);
    }
    await w.commit();
    return { scanned: POSITIONS.length, changed };
  },
};
export default m;
```

### 9.2 `0002_rebuild_directory.ts`
```ts
import type { Migration } from "../types";

const maskEmail = (e: string) => { const [u, d] = e.split("@"); return `${u[0]}${"*".repeat(Math.max(u.length - 1, 3))}@${d}`; };
const maskPhone = (p: string) => `******${p.slice(-4)}`;
const maskAdm = (a: string) => `${"*".repeat(Math.max(a.length - 3, 3))}${a.slice(-3)}`;

const m: Migration = {
  id: "0002_rebuild_directory",
  description: "Regenerate directory/{niatId} (masked lookup) from students; remove orphans",
  kind: "forward",
  async up({ forEachPage, writer, db }) {
    const w = writer();
    const seen = new Set<string>();
    let changed = 0;
    const scanned = await forEachPage<Record<string, string>>("students", async (docs) => {
      for (const d of docs) {
        const s = d.data();
        seen.add(d.id);
        const next = {
          name: s.name, maskedEmail: maskEmail(s.email), maskedPhone: maskPhone(s.phone),
          maskedAdmission: maskAdm(s.admissionNo), batch: s.batch, status: s.status,
        };
        const cur = (await db.doc(`directory/${d.id}`).get()).data();
        if (JSON.stringify(cur) !== JSON.stringify(next)) { w.set(`directory/${d.id}`, next); changed++; }
      }
    });
    await forEachPage("directory", async (docs) => {
      for (const d of docs) if (!seen.has(d.id)) { w.delete(`directory/${d.id}`); changed++; }
    });
    await w.commit();
    return { scanned, changed, notes: "purge Redis dir:* afterwards (9003)" };
  },
};
export default m;
```

### 9.3 `0003_backfill_student_vote_counters.ts`
```ts
import type { Migration } from "../types";

const m: Migration = {
  id: "0003_backfill_student_vote_counters",
  description: "Recompute students.votedPositions / votedCount from votes",
  kind: "forward",
  async up({ forEachPage, writer }) {
    const byVoter = new Map<string, Set<string>>();
    await forEachPage<{ voterId: string; positionId: string }>("votes", async (docs) => {
      for (const d of docs) {
        const v = d.data();
        (byVoter.get(v.voterId) ?? byVoter.set(v.voterId, new Set()).get(v.voterId)!).add(v.positionId);
      }
    });
    const w = writer();
    let changed = 0;
    const scanned = await forEachPage<{ votedPositions?: string[]; votedCount?: number }>("students", async (docs) => {
      for (const d of docs) {
        const want = [...(byVoter.get(d.id) ?? [])].sort();
        const have = [...(d.data().votedPositions ?? [])].sort();
        if (JSON.stringify(want) !== JSON.stringify(have) || d.data().votedCount !== want.length) {
          w.update(`students/${d.id}`, { votedPositions: want, votedCount: want.length });
          changed++;
        }
      }
    });
    await w.commit();
    return { scanned, changed };
  },
};
export default m;
```

### 9.4 `0004_add_settings_receipts_flag.ts` (expand example)
```ts
import type { Migration } from "../types";

const m: Migration = {
  id: "0004_add_settings_receipts_flag",
  description: "Add settings.receiptsByEmail (default true) and nomineesCanSelfVote if missing",
  kind: "forward",
  async up({ db, writer }) {
    const snap = await db.doc("settings/election").get();
    const s = snap.data() ?? {};
    const patch: Record<string, boolean> = {};
    if (s.receiptsByEmail === undefined) patch.receiptsByEmail = true;
    if (s.nomineesCanSelfVote === undefined) patch.nomineesCanSelfVote = true;
    if (!Object.keys(patch).length) return { scanned: 1, changed: 0 };
    const w = writer();
    w.set("settings/election", patch, true);
    await w.commit();
    return { scanned: 1, changed: 1 };
  },
  async down({ writer }) {
    const { FieldValue } = await import("firebase-admin/firestore");
    const w = writer();
    w.update("settings/election", { receiptsByEmail: FieldValue.delete() });
    await w.commit();
    return { scanned: 1, changed: 1 };
  },
};
export default m;
```

### 9.5 `0005_backfill_nominee_counters.ts`
```ts
import type { Migration } from "../types";

const m: Migration = {
  id: "0005_backfill_nominee_counters",
  description: "Recompute nominees.postCount, hasActiveStory, reactionCounts and positions.nomineeCount",
  kind: "forward",
  async up({ db, forEachPage, writer }) {
    const now = Date.now();
    const posts = new Map<string, { count: number; story: boolean }>();
    await forEachPage<{ nomineeId: string; deleted: boolean; type: string; expiresAt?: FirebaseFirestore.Timestamp }>("posts", async (docs) => {
      for (const d of docs) {
        const p = d.data();
        if (p.deleted) continue;
        const e = posts.get(p.nomineeId) ?? { count: 0, story: false };
        if (p.type === "story") { if ((p.expiresAt?.toMillis() ?? 0) > now) e.story = true; }
        else e.count++;
        posts.set(p.nomineeId, e);
      }
    });
    const reactions = new Map<string, { fire: number; clap: number }>();
    await forEachPage<{ nomineeId: string; type: "fire" | "clap" }>("reactions", async (docs) => {
      for (const d of docs) {
        const r = d.data();
        const e = reactions.get(r.nomineeId) ?? { fire: 0, clap: 0 };
        e[r.type]++;
        reactions.set(r.nomineeId, e);
      }
    });
    const w = writer();
    const perPosition = new Map<string, number>();
    let changed = 0;
    const scanned = await forEachPage<{ positionId: string; active: boolean }>("nominees", async (docs) => {
      for (const d of docs) {
        const n = d.data();
        if (n.active) perPosition.set(n.positionId, (perPosition.get(n.positionId) ?? 0) + 1);
        const p = posts.get(d.id) ?? { count: 0, story: false };
        w.update(`nominees/${d.id}`, {
          postCount: p.count, hasActiveStory: p.story, reactionCounts: reactions.get(d.id) ?? { fire: 0, clap: 0 },
        });
        changed++;
      }
    });
    for (const pos of (await db.collection("positions").get()).docs) {
      w.update(`positions/${pos.id}`, { nomineeCount: perPosition.get(pos.id) ?? 0 });
    }
    await w.commit();
    return { scanned, changed };
  },
};
export default m;
```

### 9.6 `9001_recount_tallies.ts` (repair — allowed during freeze)
```ts
import { FieldValue } from "firebase-admin/firestore";
import type { Migration } from "../types";

const m: Migration = {
  id: "9001_recount_tallies",
  description: "Recompute every tally from the votes collection; mirror to RTDB. Read-only over votes.",
  kind: "repair",
  async up({ db, rtdb, forEachPage, writer, dryRun, log }) {
    const counts = new Map<string, Map<string, number>>();
    for (const n of (await db.collection("nominees").get()).docs) {
      const { positionId } = n.data();
      (counts.get(positionId) ?? counts.set(positionId, new Map()).get(positionId)!).set(n.id, 0);
    }
    const scanned = await forEachPage<{ positionId: string; nomineeId: string }>("votes", async (docs) => {
      for (const d of docs) {
        const v = d.data();
        const pos = counts.get(v.positionId) ?? counts.set(v.positionId, new Map()).get(v.positionId)!;
        pos.set(v.nomineeId, (pos.get(v.nomineeId) ?? 0) + 1);
      }
    });
    const w = writer();
    let changed = 0;
    for (const [positionId, map] of counts) {
      const c = Object.fromEntries(map);
      const total = Object.values(c).reduce((a, b) => a + b, 0);
      const cur = (await db.doc(`tallies/${positionId}`).get()).data();
      if (cur?.total !== total || JSON.stringify(cur?.counts ?? {}) !== JSON.stringify(c)) {
        log(`~ ${positionId}: ${cur?.total ?? "?"} → ${total}`);
        changed++;
      }
      w.set(`tallies/${positionId}`, { positionId, counts: c, total, updatedAt: FieldValue.serverTimestamp() });
      if (!dryRun) await rtdb.ref(`tallies/${positionId}`).set({ counts: c, total, updatedAt: Date.now() });
    }
    await w.commit();
    return { scanned, changed, notes: changed ? "⚠️ drift found and fixed — investigate onVoteCreated logs" : "no drift" };
  },
};
export default m;
```
> Recount is safe **while voting continues**: if a vote lands mid-recount, `onVoteCreated` increments right after. Run it twice a minute apart; the second run should report "no drift".

### 9.7 `9002_rebuild_rtdb_mirrors.ts` (repair)
```ts
import type { Migration } from "../types";

const m: Migration = {
  id: "9002_rebuild_rtdb_mirrors",
  description: "Rewrite RTDB /tallies, /election, /wall totals from Firestore",
  kind: "repair",
  async up({ db, rtdb, dryRun }) {
    const tallies = await db.collection("tallies").get();
    const s = (await db.doc("settings/election").get()).data()!;
    const voters = await db.collection("students").where("votedCount", ">", 0).count().get();
    const active = await db.collection("students").where("status", "==", "active").count().get();
    const totalVotes = tallies.docs.reduce((a, d) => a + (d.data().total ?? 0), 0);
    if (!dryRun) {
      for (const t of tallies.docs) {
        const { counts, total } = t.data();
        await rtdb.ref(`tallies/${t.id}`).set({ counts, total, updatedAt: Date.now() });
      }
      await rtdb.ref("election").set({
        phase: s.phase, paused: s.paused, closesAt: s.closesAt.toMillis(), resultsPublished: s.resultsPublished,
      });
      await rtdb.ref("wall").update({
        totalVotes, votersCount: voters.data().count,
        turnoutPct: +((voters.data().count / Math.max(active.data().count, 1)) * 100).toFixed(1),
      });
    }
    return { scanned: tallies.size, changed: tallies.size + 2 };
  },
};
export default m;
```

### 9.8 `9003_purge_redis_cache.ts` (repair)
```ts
import { Redis } from "@upstash/redis";
import type { Migration } from "../types";

const m: Migration = {
  id: "9003_purge_redis_cache",
  description: "Delete cached keys (dir:*, positions:*, nominees:*, nominee:*, banners:*, settings:*); keep rate-limit keys",
  kind: "repair",
  async up({ dryRun, log }) {
    const redis = Redis.fromEnv();
    let cursor = "0";
    let scanned = 0;
    let changed = 0;
    const patterns = ["dir:*", "positions:*", "nominees:*", "nominee:*", "banners:*", "settings:*"];
    for (const match of patterns) {
      cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, { match, count: 200 });
        cursor = String(next);
        scanned += keys.length;
        if (keys.length && !dryRun) changed += await redis.del(...keys);
      } while (cursor !== "0");
      log(`purged ${match}`);
    }
    return { scanned, changed };
  },
};
export default m;
```

### 9.9 `9900_post_election_teardown.ts`
```ts
import type { Migration } from "../types";

const PII_COLLECTIONS = [
  "students", "directory", "correctionRequests", "questionAuthors", "commentAuthors",
  "reactions", "predictions", "pulseVotes", "_rateLimits",
];
const CONTENT_COLLECTIONS = ["questions", "comments", "posts", "debates"];
const ELECTION_COLLECTIONS = ["votes", "tallies", "auditLogs"];

const m: Migration = {
  id: "9900_post_election_teardown",
  description: "Delete PII and content after the official export. Requires EXPORT_CONFIRMED=<export id>.",
  kind: "teardown",
  allowedPhases: ["concluded"],
  async up({ db, rtdb, dryRun, log }) {
    const exportId = process.env.EXPORT_CONFIRMED;
    if (!exportId) throw new Error("Set EXPORT_CONFIRMED to the export folder handed to the college office.");
    const stage = process.env.TEARDOWN_STAGE ?? "pii"; // "pii" first; "all" only after the office confirms receipt
    const targets = stage === "all" ? [...PII_COLLECTIONS, ...CONTENT_COLLECTIONS, ...ELECTION_COLLECTIONS] : PII_COLLECTIONS;
    let changed = 0;
    for (const c of targets) {
      const n = (await db.collection(c).count().get()).data().count;
      log(`${dryRun ? "would delete" : "deleting"} ${c}: ${n} docs`);
      if (!dryRun) await db.recursiveDelete(db.collection(c));
      changed += n;
    }
    if (stage === "all" && !dryRun) await rtdb.ref("/").set(null);
    return { scanned: changed, changed, notes: `stage=${stage}, export=${exportId}. Also: delete R2 media (lifecycle), Redis DB, Brevo contacts.` };
  },
};
export default m;
```

---

## 10. Post-Election Teardown Plan

| Step | When | Action |
|---|---|---|
| 1 | Results published (20–21 Nov) | `exportElection` → results, voter list, audit log, requests to private R2 |
| 2 | 21–22 Nov | Hand exports to the college office; get written confirmation |
| 3 | 23 Nov | `phase = concluded` (site shows thank-you page) |
| 4 | 23 Nov | `npm run backup:prod` (final snapshot, keep 30 days, then delete) |
| 5 | 23 Nov | `EXPORT_CONFIRMED=<id> TEARDOWN_STAGE=pii npm run migrate -- up 9900` |
| 6 | After office confirms receipt | `TEARDOWN_STAGE=all … up 9900` |
| 7 | +30 days | Delete R2 media bucket contents, Upstash DB, backup exports; disable Blaze or delete the project |

---

## 11. Pre-Run Checklist (every prod migration)

- [ ] Ran on **staging** with the same command; numbers looked right
- [ ] `--dry-run` on **prod**; counts reviewed
- [ ] `npm run backup:prod` → `BACKUP_ID` exported
- [ ] Not in freeze window (or it's a `9xxx` repair)
- [ ] Rules/indexes it depends on are deployed and indexes are **Enabled**
- [ ] Someone else knows you're running it (WhatsApp the organisers)
- [ ] After run: `npm run migrate:status`, spot-check 5 docs, run `verifyIntegrity`
