# NIAT Campus Elections 2026 — Seed Data (SEEDDATA.md)

> **⚠ Platform change (16 Nov 2026): the project now runs on Supabase, not Firebase.**
> Data = Postgres tables (`supabase/migrations/`), security = RLS + `functions/src/rules.ts`,
> live counts = `rt` table + Supabase Realtime, sign-in = Supabase Auth (Google / email link via
> Brevo), uploads = Supabase Storage, hosting = Vercel. See **`docs/FREE_HOSTING.md`** for the
> current setup and **`AGENTS.md`** for commands. Firebase-specific details below (emulators,
> firestore.rules, Cloud Functions, RTDB, R2, seeds) are historical.

> Companion to `DATAMODEL.md`, `SCHEMA.md`, `RLSPOLICIES.md`.
> Defines every seed dataset, the test accounts, a test Excel sheet full of edge cases, and copy-paste-ready seed / reset / prod-bootstrap scripts.

---

## 1. Ground Rules

| Rule | Why |
|---|---|
| **Fake students never touch prod.** Seeds run against the **emulator** or **staging** only. | Real election data must stay clean and auditable |
| **Prod gets only a bootstrap:** admins, settings, positions. Real students come from the official sheet via the admin import screen. | Single, audited path for real PII |
| Seeds use the **same ID builders and Zod schemas** as the app (`lib/schema`). | A seed that passes validation proves the schema works |
| Seeds are **deterministic** (`faker.seed(2026)`). | Same data every run → reproducible bugs and screenshots |
| Every script refuses to run if the project ID contains `prod` unless it's the bootstrap script with `--confirm`. | Guard against the classic "seeded production" accident |

---

## 2. Datasets

| Dataset | Command | Students | Nominees | Votes | Use for |
|---|---|---|---|---|---|
| `minimal` | `npm run seed -- --size=minimal` | 20 | 7 (1 per position) | 0 | Fast local dev, rules tests |
| `dev` (default) | `npm run seed` | 150 | 18 | ~60% turnout | Daily UI work, realistic screens |
| `demo` | `npm run seed -- --size=demo` | 300 | 18 | ~75% turnout + posts, Q&A, reactions | Showing the committee / screenshots |
| `load` | `npm run seed -- --size=load` | 1,500 | 21 | none (k6 casts them) | 18 Nov load test on staging |

**Phase flag** (sets `settings/election` relative to *now*):

| `--phase=` | Effect |
|---|---|
| `campaign` | Voting opens in 1 h → test nominee studio and countdown |
| `voting` *(default)* | Opened 1 h ago, closes in 24 h → test voting |
| `paused` | Voting window open but `paused: true` |
| `closed` | Closed 1 h ago, results not published |
| `results` | Closed + `resultsPublished: true` |
| `concluded` | Site closed → thank-you page |

---

## 3. Fixed Seed Content

### 3.1 Admins
| Email | `canViewVoters` | Purpose |
|---|---|---|
| `admin@niat.test` | `false` | Plain admin (manages election) |
| `judge@niat.test` | `true` | Voter-admin (audits votes) |

> Prod bootstrap uses real emails from `ADMIN_EMAILS` / `VOTER_ADMIN_EMAILS` env vars instead.

### 3.2 Positions (7)
| `id` | Name | Club | Colour | Icon | Order |
|---|---|---|---|---|---|
| `nsgc-president` | NSGC President | NSGC | `#5B3DF5` | `Landmark` | 1 |
| `sports-president` | Sports Club President | Sports | `#12B76A` | `Trophy` | 2 |
| `media-head` | Media Club Head | Media | `#FF5A36` | `Camera` | 3 |
| `genai-lead` | GenAI Club Lead | GenAI | `#0BA5EC` | `Sparkles` | 4 |
| `cultural-head` | Cultural Club Head | Cultural | `#EE46BC` | `Music` | 5 |
| `tech-lead` | Tech Club Lead | Tech | `#F79009` | `Code2` | 6 |
| `literary-head` | Literary Club Head | Literary | `#667085` | `BookOpen` | 7 |

> ⚠️ Placeholder list — replace with the official positions when you have them. Only `positions.ts` needs editing.

### 3.3 Nominees per position (dev/demo)
`nsgc-president` 3 · `sports-president` 3 · `media-head` 3 · `genai-lead` 2 · `cultural-head` 3 · `tech-lead` 2 · `literary-head` 2 → **18 nominees**.
Each gets: generated name, bio (≤ 300), 3–5 promises, placeholder avatar, and (demo) 2–6 posts + 1 story.

**Vote weights** (so the leaderboard looks like a real race, with one close contest):

| Position | Nominee weights |
|---|---|
| `nsgc-president` | 45 / 35 / 20 |
| `sports-president` | 50 / 37 / 13 *(PRD example shape)* |
| `media-head` | 34 / 33 / 33 *(near tie — tests ranking animation)* |
| `genai-lead` | 60 / 40 |
| `cultural-head` | 40 / 40 / 20 *(exact tie at top — tests tie display)* |
| `tech-lead` | 70 / 30 |
| `literary-head` | 55 / 45 |

### 3.4 Batches & IDs
- Seniors: batch `2025`, IDs `N25H01A0001…` (≈ 80%)
- Juniors: batch `2026`, IDs `N26H01A0001…` (≈ 20%) — mirrors 1,200 / 300 split
- Status mix (dev/demo): 96% `active`, 3% `pending` (with an open correction request), 1% `disabled`

### 3.5 Banners
| Variant | Text | Window |
|---|---|---|
| `info` | "Voting is live until tomorrow 5 PM. One vote per club." | now → +24 h |
| `warning` | "Check your details before voting. Wrong email? Request a correction." | now → +24 h |
| `success` *(inactive)* | "Results are out!" | for results phase |

### 3.6 Pulse polls (demo)
1. "Best club event this year?" — Hackathon / Sports Fest / Cultural Night / Media Expo
2. "How did you find out about the election?" — WhatsApp / Instagram / Friends / Notice board

### 3.7 Debates (demo)
One per position with 3 nominees: *"What's the first thing you'll change in your first 30 days?"* — answers generated for each nominee.

---

## 4. Test Accounts (emulator)

The seed creates **Auth emulator users** (email verified) so you can log in instantly with the emulator's fake Google/email-link flow.

| Login email | NIAT ID | State | Use to test |
|---|---|---|---|
| `voter@niat.test` | `N25H01A0001` | active, voted 0 | Full voting flow |
| `halfdone@niat.test` | `N25H01A0002` | active, voted 4/7 | Progress ring, My Votes |
| `alldone@niat.test` | `N25H01A0003` | active, voted 7/7 | Completion badge |
| `junior@niat.test` | `N26H01A0001` | active, batch 2026 | Batch analytics |
| `pending@niat.test` | `N25H01A0004` | **pending** + open request | Blocked login screen |
| `disabled@niat.test` | `N25H01A0005` | **disabled** | Disabled screen |
| `nominee@niat.test` | `N25H01A0010` | nominee, `sports-president` | Nominee Studio |
| `nominee2@niat.test` | `N25H01A0011` | nominee, `sports-president` | Rival edits (should fail) |
| `mismatch@gmail.test` | — (not in sheet) | Google account not matching | "Wrong account" error |
| `admin@niat.test` | — | admin | Admin panel |
| `judge@niat.test` | — | voter-admin | Who-voted screens |

---

## 5. Test Import Sheet (`seed/students-test.xlsx`)

Generated by `npm run seed:sheet`. Exercises every import rule from `SCHEMA.md §4.3`.

| Row | NIAT ID | Name | Email | Phone | Admission No | Batch | Expected result |
|---|---|---|---|---|---|---|---|
| 1 | `N25H01A0693` | Tarun Test | `Tarun.Test@Example.com ` | `98765 43210` | `adm25123` | 2025 | ✅ email lowercased/trimmed, phone → `+919876543210`, admission uppercased |
| 2 | `n25h01a0694` | priya   sharma | `priya@example.com` | `+91-9123456780` | ADM25124 | | ✅ ID uppercased, name spaces collapsed, batch derived `2025` |
| 3 | `N26H01A0001` | Junior One | `junior1@example.com` | `9012345678` | ADM26001 | | ✅ batch derived `2026` |
| 4 | `N25H01A0695` | Number Phone | `num@example.com` | `9988776655` *(numeric cell)* | `25125` *(numeric)* | 2025 | ✅ numbers coerced to strings |
| 5 | `N25H01A0693` | Duplicate ID | `dup@example.com` | `9876500000` | ADM25999 | 2025 | ❌ duplicate NIAT ID |
| 6 | `N25H01A0696` | Duplicate Email | `priya@example.com` | `9876511111` | ADM25126 | 2025 | ❌ duplicate email |
| 7 | `N25H01A0697` | Bad Email | `bad-email@` | `9876522222` | ADM25127 | 2025 | ❌ invalid email |
| 8 | `N25H01A0698` | Bad Phone | `badphone@example.com` | `12345` | ADM25128 | 2025 | ❌ invalid phone |
| 9 | `XYZ123456` | Odd ID | `odd@example.com` | `9876533333` | ADM25129 | 2025 | ⚠️ warning: ID format, still importable |
| 10 | `N25H01A0699` | | `noname@example.com` | `9876544444` | ADM25130 | 2025 | ❌ name required |
| 11 | *(blank row)* | | | | | | ⏭️ skipped silently |

**Headers in the test sheet** deliberately use alternate spellings: `Student ID`, `Full Name`, `Email ID`, `Mobile Number`, `Admission Number`, `Year` → all must map via `IMPORT_HEADER_MAP`.

---

## 6. Scripts

### 6.1 Setup
```bash
npm i -D tsx @faker-js/faker firebase-admin
# xlsx (SheetJS) already installed per TECHSTACK.md
```

`package.json` scripts:
```json
{
  "scripts": {
    "emulators": "firebase emulators:start --import=.emulator-data --export-on-exit",
    "seed": "tsx scripts/seed/index.ts",
    "seed:reset": "tsx scripts/seed/reset.ts",
    "seed:sheet": "tsx scripts/seed/make-sheet.ts",
    "bootstrap:prod": "tsx scripts/seed/bootstrap-prod.ts"
  }
}
```

`.env.seed` (emulator):
```bash
FIREBASE_PROJECT_ID=niat-elections-dev
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000
FIREBASE_DATABASE_URL=http://127.0.0.1:9000?ns=niat-elections-dev-default-rtdb
SEED_MEDIA_BASE_URL=http://localhost:3000/seed-media/
```
> Set `NEXT_PUBLIC_MEDIA_BASE_URL=http://localhost:3000/seed-media/` in `.env.local` for dev so `MediaUrl` validation accepts seed images. Put 10–20 placeholder images (avatars, posters) in `public/seed-media/`.

### 6.2 `scripts/seed/admin.ts` — guarded Admin SDK init
```ts
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required");

const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const isProd = /prod/i.test(projectId);
const isBootstrap = process.argv[1]?.includes("bootstrap-prod");

if (isProd && !isBootstrap) {
  console.error(`✋ Refusing to seed fake data into "${projectId}". Use bootstrap:prod for production.`);
  process.exit(1);
}
if (!usingEmulator && !isProd) {
  console.warn(`⚠️  Seeding REAL Firebase project "${projectId}" (not emulator). Ctrl+C within 5 s to abort…`);
  await new Promise((r) => setTimeout(r, 5000));
}

if (!getApps().length) {
  initializeApp({
    projectId,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    ...(usingEmulator ? {} : { credential: applicationDefault() }),
  });
}

export const db = getFirestore();
export const auth = getAuth();
export const rtdb = getDatabase();
export const env = { projectId, usingEmulator, isProd };
```

### 6.3 `scripts/seed/positions.ts`
```ts
export const POSITIONS = [
  { id: "nsgc-president",   name: "NSGC President",        club: "NSGC",     color: "#5B3DF5", icon: "Landmark", weights: [45, 35, 20] },
  { id: "sports-president", name: "Sports Club President", club: "Sports",   color: "#12B76A", icon: "Trophy",   weights: [50, 37, 13] },
  { id: "media-head",       name: "Media Club Head",       club: "Media",    color: "#FF5A36", icon: "Camera",   weights: [34, 33, 33] },
  { id: "genai-lead",       name: "GenAI Club Lead",       club: "GenAI",    color: "#0BA5EC", icon: "Sparkles", weights: [60, 40] },
  { id: "cultural-head",    name: "Cultural Club Head",    club: "Cultural", color: "#EE46BC", icon: "Music",    weights: [40, 40, 20] },
  { id: "tech-lead",        name: "Tech Club Lead",        club: "Tech",     color: "#F79009", icon: "Code2",    weights: [70, 30] },
  { id: "literary-head",    name: "Literary Club Head",    club: "Literary", color: "#667085", icon: "BookOpen", weights: [55, 45] },
] as const;

export type SeedPosition = (typeof POSITIONS)[number];
```

### 6.4 `scripts/seed/index.ts` — main seeder
```ts
import { faker } from "@faker-js/faker/locale/en_IN";
import { FieldValue, Timestamp, type WriteBatch } from "firebase-admin/firestore";
import { db, auth, rtdb, env } from "./admin";
import { POSITIONS } from "./positions";
import { ids, receiptCode, deriveBatch } from "../../lib/schema/common";
import { StudentImportRow } from "../../lib/schema/inputs";

// ---------------- args ----------------
const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const SIZE = arg("size", "dev") as "minimal" | "dev" | "demo" | "load";
const PHASE = arg("phase", "voting") as "campaign" | "voting" | "paused" | "closed" | "results" | "concluded";
const DIRECT_TALLIES = process.argv.includes("--direct-tallies"); // use when Functions emulator isn't running

const CFG = {
  minimal: { students: 20, juniorsPct: 0.2, nomineesPer: 1, turnout: 0, content: false },
  dev:     { students: 150, juniorsPct: 0.2, nomineesPer: 0, turnout: 0.6, content: false },
  demo:    { students: 300, juniorsPct: 0.2, nomineesPer: 0, turnout: 0.75, content: true },
  load:    { students: 1500, juniorsPct: 0.2, nomineesPer: 3, turnout: 0, content: false },
}[SIZE];

faker.seed(2026);
const MEDIA = process.env.SEED_MEDIA_BASE_URL ?? "http://localhost:3000/seed-media/";
const HOUR = 3600_000;
const now = Date.now();

// ---------------- batched writer (≤ 450 ops per batch) ----------------
class Writer {
  private batch: WriteBatch = db.batch();
  private ops = 0;
  private pending: Promise<unknown>[] = [];
  public total = 0;
  /** merge=true for partial updates of an existing doc */
  set(path: string, data: object, merge = false) {
    this.batch.set(db.doc(path), data, { merge });
    this.total++;
    if (++this.ops >= 450) this.rotate();
  }
  private rotate() {
    this.pending.push(this.batch.commit()); // commit the full batch, start a fresh one synchronously
    this.batch = db.batch();
    this.ops = 0;
  }
  async flush() {
    if (this.ops) this.rotate();
    await Promise.all(this.pending);
    this.pending = [];
  }
}
const w = new Writer();

// ---------------- helpers ----------------
const pad = (n: number) => String(n).padStart(4, "0");
const mask = {
  email: (e: string) => { const [u, d] = e.split("@"); return `${u[0]}${"*".repeat(Math.max(u.length - 1, 3))}@${d}`; },
  phone: (p: string) => `******${p.slice(-4)}`,
  admission: (a: string) => `${"*".repeat(Math.max(a.length - 3, 3))}${a.slice(-3)}`,
};
function pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = faker.number.float({ min: 0, max: total });
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

function electionWindow() {
  const t = (h: number) => Timestamp.fromMillis(now + h * HOUR);
  const base = { campaignOpensAt: t(-48), opensAt: t(-1), closesAt: t(24), siteClosesAt: t(96), paused: false, resultsPublished: false };
  switch (PHASE) {
    case "campaign":  return { ...base, phase: "campaign", opensAt: t(1), closesAt: t(25) };
    case "voting":    return { ...base, phase: "voting" };
    case "paused":    return { ...base, phase: "voting", paused: true };
    case "closed":    return { ...base, phase: "closed", opensAt: t(-25), closesAt: t(-1) };
    case "results":   return { ...base, phase: "results", opensAt: t(-25), closesAt: t(-1), resultsPublished: true };
    case "concluded": return { ...base, phase: "concluded", opensAt: t(-73), closesAt: t(-49), siteClosesAt: t(-1), resultsPublished: true };
  }
}

// ---------------- 1. admins & settings ----------------
async function seedAdminsAndSettings() {
  for (const [email, canViewVoters] of [["admin@niat.test", false], ["judge@niat.test", true]] as const) {
    w.set(`admins/${email}`, { email, name: email.split("@")[0], canViewVoters, addedBy: "seed", createdAt: FieldValue.serverTimestamp() });
  }
  const win = electionWindow();
  w.set("settings/election", {
    ...win, pausedReason: win.paused ? "Seeded pause for testing" : null,
    nomineesCanSelfVote: true, receiptsByEmail: false, updatedBy: "seed", updatedAt: FieldValue.serverTimestamp(),
  });
  return win;
}

// ---------------- 2. students ----------------
interface SeedStudent { niatId: string; name: string; email: string; phone: string; admissionNo: string; batch: string; status: "active" | "pending" | "disabled" }

const FIXED: Array<Partial<SeedStudent> & { niatId: string; email: string; status: SeedStudent["status"] }> = [
  { niatId: "N25H01A0001", email: "voter@niat.test", status: "active", name: "Test Voter" },
  { niatId: "N25H01A0002", email: "halfdone@niat.test", status: "active", name: "Half Done" },
  { niatId: "N25H01A0003", email: "alldone@niat.test", status: "active", name: "All Done" },
  { niatId: "N26H01A0001", email: "junior@niat.test", status: "active", name: "Junior Student" },
  { niatId: "N25H01A0004", email: "pending@niat.test", status: "pending", name: "Pending Person" },
  { niatId: "N25H01A0005", email: "disabled@niat.test", status: "disabled", name: "Disabled Person" },
  { niatId: "N25H01A0010", email: "nominee@niat.test", status: "active", name: "Ravi Kumar" },
  { niatId: "N25H01A0011", email: "nominee2@niat.test", status: "active", name: "Sneha Patel" },
];

function makeStudents(): SeedStudent[] {
  const juniors = Math.round(CFG.students * CFG.juniorsPct);
  const seniors = CFG.students - juniors;
  const out = new Map<string, SeedStudent>();

  for (const f of FIXED) {
    out.set(f.niatId, {
      niatId: f.niatId, email: f.email, status: f.status, name: f.name ?? faker.person.fullName(),
      phone: `+91${faker.helpers.arrayElement(["9", "8", "7", "6"])}${faker.string.numeric(9)}`,
      admissionNo: `ADM${f.niatId.slice(1, 3)}${f.niatId.slice(-4)}`, batch: deriveBatch(f.niatId),
    });
  }
  const add = (prefix: "N25" | "N26", count: number) => {
    let i = 100;
    while ([...out.values()].filter((s) => s.niatId.startsWith(prefix)).length < count) {
      const niatId = `${prefix}H01A${pad(i++)}`;
      if (out.has(niatId)) continue;
      const first = faker.person.firstName(); const last = faker.person.lastName();
      const row = StudentImportRow.parse({
        niatId, name: `${first} ${last}`,
        email: `${first}.${last}.${niatId.slice(-4)}@example.com`.toLowerCase(),
        phone: `${faker.helpers.arrayElement(["9", "8", "7", "6"])}${faker.string.numeric(9)}`,
        admissionNo: `ADM${niatId.slice(1, 3)}${niatId.slice(-4)}`,
      });
      const r = faker.number.float({ min: 0, max: 1 });
      out.set(niatId, { ...row, batch: deriveBatch(niatId), status: r < 0.03 ? "pending" : r < 0.04 ? "disabled" : "active" });
    }
  };
  add("N25", Math.max(seniors, FIXED.filter((f) => f.niatId.startsWith("N25")).length));
  add("N26", Math.max(juniors, 1));
  return [...out.values()];
}

async function seedStudents(students: SeedStudent[]) {
  for (const s of students) {
    w.set(`students/${s.niatId}`, {
      ...s, isNominee: false, nomineeOf: null, votedPositions: [], votedCount: 0,
      activeSessionId: null, lastLoginAt: null,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    w.set(`directory/${s.niatId}`, {
      name: s.name, maskedEmail: mask.email(s.email), maskedPhone: mask.phone(s.phone),
      maskedAdmission: mask.admission(s.admissionNo), batch: s.batch, status: s.status,
    });
    if (s.status === "pending") {
      w.set(`correctionRequests/seed-${s.niatId}`, {
        niatId: s.niatId, fields: ["email"], requested: { email: `new.${s.email}` },
        note: "I changed my email last semester.", contactEmail: `new.${s.email}`,
        status: "open", createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
}

// ---------------- 3. positions & nominees ----------------
async function seedPositionsAndNominees(students: SeedStudent[]) {
  const pool = faker.helpers.shuffle(
    students.filter((s) => s.status === "active" && !FIXED.some((f) => f.niatId === s.niatId)),
  );
  const nomineesByPos: Record<string, string[]> = {};

  for (const [i, p] of POSITIONS.entries()) {
    const count = CFG.nomineesPer || p.weights.length;
    const picks: SeedStudent[] = [];
    if (p.id === "sports-president") {
      // fixed test nominees always in Sports
      picks.push(students.find((s) => s.niatId === "N25H01A0010")!, students.find((s) => s.niatId === "N25H01A0011")!);
    }
    while (picks.length < count) picks.push(pool.pop()!);

    w.set(`positions/${p.id}`, {
      id: p.id, name: p.name, club: p.club, color: p.color, icon: p.icon,
      description: `Elect the ${p.name} for 2026–27.`, order: i + 1, active: true, nomineeCount: picks.length,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });

    nomineesByPos[p.id] = [];
    for (const [j, s] of picks.slice(0, count).entries()) {
      const nomineeId = ids.nominee(p.id, s.niatId);
      nomineesByPos[p.id].push(nomineeId);
      w.set(`students/${s.niatId}`, { isNominee: true, nomineeOf: p.id, updatedAt: FieldValue.serverTimestamp() }, true);
      w.set(`nominees/${nomineeId}`, {
        id: nomineeId, positionId: p.id, niatId: s.niatId, name: s.name, batch: s.batch,
        photoUrl: `${MEDIA}avatar-${((i * 3 + j) % 12) + 1}.webp`,
        bio: faker.lorem.sentences(2).slice(0, 300),
        promises: Array.from({ length: faker.number.int({ min: 3, max: 5 }) }, () => faker.lorem.sentence({ min: 5, max: 12 }).slice(0, 120)),
        active: true, reactionCounts: { fire: 0, clap: 0 }, postCount: 0, hasActiveStory: false,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
  return nomineesByPos;
}

// ---------------- 4. votes & tallies ----------------
async function seedVotes(students: SeedStudent[], nomineesByPos: Record<string, string[]>, win: ReturnType<typeof electionWindow>) {
  const tallies: Record<string, Record<string, number>> = {};
  const voted: Record<string, string[]> = {};
  const opens = win.opensAt.toMillis();
  const end = Math.min(now, win.closesAt.toMillis());
  if (end <= opens) return; // campaign phase: no votes yet

  const castVote = (s: SeedStudent, positionIndex: number) => {
    const p = POSITIONS[positionIndex];
    const nominees = nomineesByPos[p.id];
    const weights = nominees.map((_, k) => p.weights[k] ?? 10); // pad if a position has more nominees than weights
    const nomineeId = pickWeighted(nominees, weights);
    const voteId = ids.vote(s.niatId, p.id);
    const at = Timestamp.fromMillis(faker.number.int({ min: opens, max: end }));
    w.set(`votes/${voteId}`, {
      voterId: s.niatId, positionId: p.id, nomineeId, createdAt: at,
      ...(DIRECT_TALLIES ? { counted: true, receiptCode: receiptCode(p.club), batch: s.batch } : {}),
    });
    (tallies[p.id] ??= {})[nomineeId] = (tallies[p.id][nomineeId] ?? 0) + 1;
    (voted[s.niatId] ??= []).push(p.id);
  };

  for (const s of students) {
    if (s.status !== "active") continue;
    if (s.niatId === "N25H01A0001") continue;                                   // voter@ starts fresh
    if (s.niatId === "N25H01A0002") { [0, 1, 2, 3].forEach((i) => castVote(s, i)); continue; } // 4/7
    if (s.niatId === "N25H01A0003") { POSITIONS.forEach((_, i) => castVote(s, i)); continue; } // 7/7
    if (faker.number.float({ min: 0, max: 1 }) > CFG.turnout) continue;
    POSITIONS.forEach((_, i) => { if (faker.number.float({ min: 0, max: 1 }) < 0.9) castVote(s, i); });
  }

  if (DIRECT_TALLIES) {
    // Without the Functions emulator, write what onVoteCreated would have produced.
    for (const p of POSITIONS) {
      const counts = Object.fromEntries((nomineesByPos[p.id] ?? []).map((n) => [n, tallies[p.id]?.[n] ?? 0]));
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      w.set(`tallies/${p.id}`, { positionId: p.id, counts, total, updatedAt: FieldValue.serverTimestamp() });
      await rtdb.ref(`tallies/${p.id}`).set({ counts, total, updatedAt: now });
    }
    for (const [niatId, positions] of Object.entries(voted)) {
      w.set(`students/${niatId}`, { votedPositions: positions, votedCount: positions.length }, true);
    }
    const voters = Object.keys(voted).length;
    const active = students.filter((s) => s.status === "active").length;
    const totalVotes = Object.values(voted).reduce((a, v) => a + v.length, 0);
    await rtdb.ref("wall").set({ totalVotes, votersCount: voters, turnoutPct: +((voters / active) * 100).toFixed(1), recent: {} });
  } else {
    // Initialise empty tallies; onVoteCreated (Functions emulator) increments them.
    for (const p of POSITIONS) {
      w.set(`tallies/${p.id}`, {
        positionId: p.id, counts: Object.fromEntries((nomineesByPos[p.id] ?? []).map((n) => [n, 0])),
        total: 0, updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
}

// ---------------- 5. demo content ----------------
async function seedContent(students: SeedStudent[], nomineesByPos: Record<string, string[]>) {
  const active = students.filter((s) => s.status === "active");
  for (const [posId, nominees] of Object.entries(nomineesByPos)) {
    const debate: Record<string, { text: string; updatedAt: Timestamp }> = {};
    for (const nomineeId of nominees) {
      const niatId = nomineeId.split("_").pop()!;
      const postCount = faker.number.int({ min: 2, max: 6 });
      for (let k = 0; k < postCount; k++) {
        const ref = db.collection("posts").doc();
        w.set(ref.path, {
          nomineeId, niatId, type: faker.helpers.arrayElement(["photo", "poster"]),
          mediaUrl: `${MEDIA}post-${faker.number.int({ min: 1, max: 12 })}.webp`,
          caption: faker.lorem.sentence().slice(0, 200), commentCount: 0, deleted: false,
          createdAt: Timestamp.fromMillis(now - faker.number.int({ min: 1, max: 40 }) * HOUR),
        });
      }
      const story = db.collection("posts").doc();
      w.set(story.path, {
        nomineeId, niatId, type: "story", mediaUrl: `${MEDIA}story-${faker.number.int({ min: 1, max: 4 })}.webp`,
        caption: "Vote for change!", commentCount: 0, deleted: false,
        expiresAt: Timestamp.fromMillis(now + 20 * HOUR), createdAt: Timestamp.fromMillis(now - 4 * HOUR),
      });
      for (let q = 0; q < faker.number.int({ min: 2, max: 5 }); q++) {
        const qRef = db.collection("questions").doc();
        const answered = faker.datatype.boolean();
        w.set(qRef.path, {
          nomineeId, text: `${faker.lorem.sentence({ min: 6, max: 14 }).replace(/\.$/, "")}?`,
          answer: answered ? faker.lorem.sentences(2).slice(0, 600) : null,
          answeredAt: answered ? Timestamp.fromMillis(now - HOUR) : null, hidden: false,
          createdAt: Timestamp.fromMillis(now - 6 * HOUR),
        });
        w.set(`questionAuthors/${qRef.id}`, { niatId: faker.helpers.arrayElement(active).niatId, createdAt: Timestamp.fromMillis(now - 6 * HOUR) });
      }
      const fire = faker.number.int({ min: 10, max: 120 });
      const clap = faker.number.int({ min: 5, max: 60 });
      w.set(`nominees/${nomineeId}`, { postCount, hasActiveStory: true, reactionCounts: { fire, clap } }, true);
      debate[nomineeId] = { text: faker.lorem.sentences(2).slice(0, 600), updatedAt: Timestamp.fromMillis(now - 3 * HOUR) };
    }
    if (nominees.length >= 3) {
      w.set(`debates/${posId}`, {
        positionId: posId, question: "What's the first thing you'll change in your first 30 days?",
        answers: debate, createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
  const polls = [
    { id: "best-event", question: "Best club event this year?", options: ["Hackathon", "Sports Fest", "Cultural Night", "Media Expo"] },
    { id: "found-out", question: "How did you find out about the election?", options: ["WhatsApp", "Instagram", "Friends", "Notice board"] },
  ];
  for (const p of polls) {
    w.set(`pulsePolls/${p.id}`, {
      question: p.question, options: p.options, active: p.id === "best-event",
      opensAt: Timestamp.fromMillis(now - HOUR), closesAt: Timestamp.fromMillis(now + 23 * HOUR),
    });
  }
}

// ---------------- 6. banners ----------------
function seedBanners() {
  const t = (h: number) => Timestamp.fromMillis(now + h * HOUR);
  const banners = [
    { id: "live", variant: "info", text: "Voting is live until tomorrow 5 PM. One vote per club.", active: true },
    { id: "check-details", variant: "warning", text: "Check your details before voting. Wrong email? Request a correction.", active: true },
    { id: "results", variant: "success", text: "Results are out!", active: PHASE === "results" },
  ];
  for (const b of banners) {
    w.set(`banners/${b.id}`, { ...b, startsAt: t(-1), endsAt: t(24), createdBy: "seed", createdAt: FieldValue.serverTimestamp() });
  }
}

// ---------------- 7. auth users (emulator only) ----------------
async function seedAuthUsers() {
  if (!env.usingEmulator) return;
  const emails = [...FIXED.map((f) => f.email), "admin@niat.test", "judge@niat.test", "mismatch@gmail.test"];
  for (const email of emails) {
    try {
      await auth.createUser({ email, emailVerified: true, password: "password123", displayName: email.split("@")[0] });
    } catch (e) {
      if ((e as { code?: string }).code !== "auth/email-already-exists") throw e;
    }
  }
}

// ---------------- run ----------------
async function main() {
  console.log(`🌱 Seeding "${env.projectId}" · size=${SIZE} · phase=${PHASE}${DIRECT_TALLIES ? " · direct tallies" : ""}`);
  const win = await seedAdminsAndSettings();
  const students = makeStudents();
  await seedStudents(students);
  const nomineesByPos = await seedPositionsAndNominees(students);
  seedBanners();
  await w.flush();
  if (CFG.turnout > 0) await seedVotes(students, nomineesByPos, win);
  if (CFG.content) await seedContent(students, nomineesByPos);
  await w.flush();
  await rtdb.ref("election").set({
    phase: win.phase, paused: win.paused, closesAt: win.closesAt.toMillis(), resultsPublished: win.resultsPublished,
  });
  await seedAuthUsers();
  console.log(`✅ Done: ${students.length} students, ${Object.values(nomineesByPos).flat().length} nominees, ${w.total} writes.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

> **Why `--direct-tallies` exists:** normally `onVoteCreated` (Functions emulator) does the counting, exactly like prod — that's the preferred way because it tests the real function. If you're working on UI without the Functions emulator, pass `--direct-tallies` and the seeder writes the end state itself.

### 6.5 `scripts/seed/reset.ts` — wipe emulator/staging
```ts
import { db, auth, rtdb, env } from "./admin";

if (env.isProd) { console.error("✋ Never reset production."); process.exit(1); }

const COLLECTIONS = [
  "admins", "students", "directory", "correctionRequests", "positions", "nominees", "votes", "tallies",
  "posts", "questions", "questionAuthors", "comments", "commentAuthors", "reactions", "debates",
  "predictions", "pulsePolls", "pulseVotes", "banners", "settings", "auditLogs", "_rateLimits",
];

async function main() {
  for (const c of COLLECTIONS) {
    await db.recursiveDelete(db.collection(c));
    console.log(`🗑️  ${c}`);
  }
  await rtdb.ref("/").set(null);
  if (env.usingEmulator) {
    const { users } = await auth.listUsers(1000);
    if (users.length) await auth.deleteUsers(users.map((u) => u.uid));
  }
  console.log("✅ Reset complete");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

### 6.6 `scripts/seed/make-sheet.ts` — test Excel file
```ts
import * as XLSX from "xlsx";
import { mkdirSync } from "node:fs";

const rows = [
  ["Student ID", "Full Name", "Email ID", "Mobile Number", "Admission Number", "Year"],
  ["N25H01A0693", "Tarun Test", "Tarun.Test@Example.com ", "98765 43210", "adm25123", 2025],
  ["n25h01a0694", "priya   sharma", "priya@example.com", "+91-9123456780", "ADM25124", ""],
  ["N26H01A0001", "Junior One", "junior1@example.com", "9012345678", "ADM26001", ""],
  ["N25H01A0695", "Number Phone", "num@example.com", 9988776655, 25125, 2025],
  ["N25H01A0693", "Duplicate ID", "dup@example.com", "9876500000", "ADM25999", 2025],
  ["N25H01A0696", "Duplicate Email", "priya@example.com", "9876511111", "ADM25126", 2025],
  ["N25H01A0697", "Bad Email", "bad-email@", "9876522222", "ADM25127", 2025],
  ["N25H01A0698", "Bad Phone", "badphone@example.com", "12345", "ADM25128", 2025],
  ["XYZ123456", "Odd ID", "odd@example.com", "9876533333", "ADM25129", 2025],
  ["N25H01A0699", "", "noname@example.com", "9876544444", "ADM25130", 2025],
  ["", "", "", "", "", ""],
];

mkdirSync("seed", { recursive: true });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Students");
XLSX.writeFile(wb, "seed/students-test.xlsx");
console.log("✅ seed/students-test.xlsx — expect 5 imported (1 with a warning), 5 rejected, 1 blank skipped");
```

**Expected import result:** 5 rows imported (rows 1–4 + row 9 with a warning), 5 rejected (rows 5–8, 10), 1 blank skipped. Make this an E2E assertion in Playwright.

### 6.7 `scripts/seed/bootstrap-prod.ts` — production bootstrap (no fake data)
```ts
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, env } from "./admin";
import { POSITIONS } from "./positions";

if (!process.argv.includes("--confirm")) {
  console.error("Add --confirm to bootstrap production. This writes admins, settings and positions only.");
  process.exit(1);
}

const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const ADMINS = list(process.env.ADMIN_EMAILS);
const VOTER_ADMINS = list(process.env.VOTER_ADMIN_EMAILS);
if (!ADMINS.length) throw new Error("Set ADMIN_EMAILS");

/** Interpret "YYYY-MM-DDTHH:mm" as IST. */
const ist = (s: string) => Timestamp.fromDate(new Date(`${s}:00+05:30`));

async function main() {
  const existing = await db.doc("settings/election").get();
  if (existing.exists && !process.argv.includes("--overwrite-settings")) {
    console.log("ℹ️  settings/election exists — leaving it (pass --overwrite-settings to replace).");
  } else {
    await db.doc("settings/election").set({
      phase: "setup",
      campaignOpensAt: ist(process.env.CAMPAIGN_OPENS ?? "2026-11-17T09:00"),
      opensAt: ist(process.env.VOTING_OPENS ?? "2026-11-19T09:00"),
      closesAt: ist(process.env.VOTING_CLOSES ?? "2026-11-20T17:00"),
      siteClosesAt: ist(process.env.SITE_CLOSES ?? "2026-11-23T23:59"),
      paused: false, pausedReason: null, resultsPublished: false,
      nomineesCanSelfVote: true, receiptsByEmail: true,
      updatedBy: "bootstrap", updatedAt: FieldValue.serverTimestamp(),
    });
  }

  for (const email of new Set([...ADMINS, ...VOTER_ADMINS])) {
    await db.doc(`admins/${email}`).set({
      email, name: email.split("@")[0], canViewVoters: VOTER_ADMINS.includes(email),
      addedBy: "bootstrap", createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  for (const [i, p] of POSITIONS.entries()) {
    const ref = db.doc(`positions/${p.id}`);
    if ((await ref.get()).exists) continue; // never clobber edits made in the admin panel
    await ref.set({
      id: p.id, name: p.name, club: p.club, color: p.color, icon: p.icon,
      description: "", order: i + 1, active: true, nomineeCount: 0,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    await db.doc(`tallies/${p.id}`).set({ positionId: p.id, counts: {}, total: 0, updatedAt: FieldValue.serverTimestamp() });
  }

  console.log(`✅ Bootstrapped ${env.projectId}: ${ADMINS.length} admins, ${POSITIONS.length} positions. Import students from the admin panel.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```
Run:
```bash
FIREBASE_PROJECT_ID=niat-elections-prod \
ADMIN_EMAILS="you@gmail.com,organiser@gmail.com" VOTER_ADMIN_EMAILS="you@gmail.com" \
VOTING_OPENS=2026-11-19T09:00 VOTING_CLOSES=2026-11-20T17:00 \
npm run bootstrap:prod -- --confirm
```
(Uses `gcloud auth application-default login` credentials; no key file needed.)

---

## 7. Load-Test Data (staging, 18 Nov)

1. `npm run seed:reset && npm run seed -- --size=load --phase=voting` on **staging**.
2. Export 1,500 test credentials for k6: for staging, create Auth users via Admin SDK with emails `load+{niatId}@niat.test` and mint **custom tokens** in a setup script → exchange for ID tokens → k6 uses them.
3. k6 scenario: 1,500 VUs ramp over 10 min; each opens landing → looks up ID → reads positions → casts 7 votes with 2–10 s think time.
4. Pass criteria: 0 double votes, 0 lost votes (`verifyIntegrity` green), p95 vote confirm < 1.5 s, no Worker CPU-limit errors, Firestore/RTDB usage within budget.
5. `npm run seed:reset` on staging afterwards.

---

## 8. Daily Dev Loop

```bash
npm run emulators                         # terminal 1 (keeps data in .emulator-data between runs)
npm run seed:reset && npm run seed        # terminal 2 — fresh dev dataset, voting live
npm run dev                               # terminal 3

# different situations
npm run seed -- --phase=campaign          # nominee studio, countdown
npm run seed -- --phase=paused            # pause banner
npm run seed -- --phase=results --size=demo   # results page with content
npm run seed -- --size=minimal --direct-tallies   # UI only, no functions emulator
```

Log in at `localhost:3000` with any account from §4 (emulator shows a fake Google picker; email-link emails appear in the Emulator UI → Auth tab).
