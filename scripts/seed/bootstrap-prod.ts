import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, rtdb, env } from "./admin";
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
      closesAt: ist(process.env.VOTING_CLOSES ?? "2026-11-20T20:00"),
      siteClosesAt: ist(process.env.SITE_CLOSES ?? "2026-11-23T23:59"),
      paused: false, pausedReason: null, resultsPublished: false,
      nomineesCanSelfVote: true, receiptsByEmail: false, requireStudentMfa: false, // receipts stay in-app (decision 15 Nov)
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

  // Live-count mirrors start empty; onVoteCreated fills them. Turnout denominator set by importStudents.
  await rtdb.ref("meta/eligible").set(0);

  console.log(`✅ Bootstrapped ${env.projectId}: ${ADMINS.length} admins, ${POSITIONS.length} positions. Import students from the admin panel.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
