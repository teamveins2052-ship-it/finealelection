import { fakerEN_IN as faker } from "@faker-js/faker";
import { FieldValue, Timestamp, type WriteBatch } from "firebase-admin/firestore";
import { db, auth, rtdb, env } from "./admin";
import { POSITIONS } from "./positions";
import { ids, receiptCode, deriveBatch } from "../../lib/schema/common";
import { StudentImportRow } from "../../lib/schema/inputs";
import { encryptSecret, hashBackupCode } from "../../functions/src/lib/totp";

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
    nomineesCanSelfVote: true, receiptsByEmail: false, requireStudentMfa: false, updatedBy: "seed", updatedAt: FieldValue.serverTimestamp(),
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
        // Like the real sheet: 2025 rows carry a hall-ticket number, 2026 rows don't.
        ...(prefix === "N25" ? { admissionNo: `ADM${niatId.slice(1, 3)}${niatId.slice(-4)}` } : {}),
      });
      const r = faker.number.float({ min: 0, max: 1 });
      out.set(niatId, { ...row, admissionNo: row.admissionNo ?? "", batch: deriveBatch(niatId), status: r < 0.03 ? "pending" : r < 0.04 ? "disabled" : "active" });
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
        photoUrl: `${MEDIA}avatar-${((i * 3 + j) % 12) + 1}.svg`,
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
    // Last few anonymous ticker events (club + time only), like onVoteCreated produces.
    const recent = Object.fromEntries(POSITIONS.slice(0, 6).map((p, i) => [`-seed${i}`, { club: p.club, at: now - (6 - i) * 20_000 }]));
    await rtdb.ref("wall").set({ totalVotes, votersCount: voters, turnoutPct: +((voters / active) * 100).toFixed(1), recent });
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
          mediaUrl: `${MEDIA}post-${faker.number.int({ min: 1, max: 12 })}.svg`,
          caption: faker.lorem.sentence().slice(0, 200), commentCount: 0, deleted: false,
          createdAt: Timestamp.fromMillis(now - faker.number.int({ min: 1, max: 40 }) * HOUR),
        });
      }
      const story = db.collection("posts").doc();
      w.set(story.path, {
        nomineeId, niatId, type: "story", mediaUrl: `${MEDIA}story-${faker.number.int({ min: 1, max: 4 })}.svg`,
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

// ---------------- 8. 2-step for test accounts (emulator only) ----------------
/**
 * 2-step is optional for students (16 Nov). Pre-enrolled with ONE shared dev secret so testers add
 * it to their authenticator app once: both admins (always required) and nominee@ (a student who
 * opted in → asked for the code at every sign-in). Other test students start without 2-step.
 * Encrypted with the emulator-only dev key. Never used outside the emulator.
 */
export const DEV_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
export const DEV_BACKUP_CODES = ["TEST-2222", "TEST-3333", "TEST-4444", "TEST-5555", "TEST-6666"];
async function seedMfa() {
  if (!env.usingEmulator) return;
  const emails = ["nominee@niat.test", "admin@niat.test", "judge@niat.test"];
  for (const email of emails) {
    const uid = (await auth.getUserByEmail(email)).uid;
    await db.doc(`mfa/${uid}`).set({
      email, enabled: true, secret: encryptSecret(DEV_TOTP_SECRET), lastStep: 0,
      backupHashes: DEV_BACKUP_CODES.map(hashBackupCode), failCount: 0, lockedUntil: null,
      enrolledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    // Students who enrolled are flagged so rules/guards demand the code (P-MFA-05).
    const st = await db.collection("students").where("email", "==", email).limit(1).get();
    if (!st.empty) await st.docs[0].ref.update({ mfaEnabled: true });
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
  // Server-only denominator for turnout % (read by onVoteCreated; root RTDB rule denies clients).
  await rtdb.ref("meta/eligible").set(students.filter((s) => s.status === "active").length);
  await seedAuthUsers();
  await seedMfa();
  console.log(`✅ Done: ${students.length} students, ${Object.values(nomineesByPos).flat().length} nominees, ${w.total} writes.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
