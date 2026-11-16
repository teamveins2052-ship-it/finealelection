import { onCall, HttpsError } from "../lib/callable";
import { FieldValue, Timestamp } from "../lib/store";
import { db, rtdb, callOpts } from "../lib/admin";
import { audit, verifiedEmail } from "../auth/guards";

/** Placeholder ballot — edit in Admin → Positions & Nominees (SEEDDATA §3.2). */
const POSITIONS = [
  { id: "nsgc-president", name: "NSGC President", club: "NSGC", color: "#5B3DF5", icon: "Landmark" },
  { id: "sports-president", name: "Sports Club President", club: "Sports", color: "#12B76A", icon: "Trophy" },
  { id: "media-head", name: "Media Club Head", club: "Media", color: "#FF5A36", icon: "Camera" },
  { id: "genai-lead", name: "GenAI Club Lead", club: "GenAI", color: "#0BA5EC", icon: "Sparkles" },
  { id: "cultural-head", name: "Cultural Club Head", club: "Cultural", color: "#EE46BC", icon: "Music" },
  { id: "tech-lead", name: "Tech Club Lead", club: "Tech", color: "#F79009", icon: "Code2" },
  { id: "literary-head", name: "Literary Club Head", club: "Literary", color: "#667085", icon: "BookOpen" },
];

/** "YYYY-MM-DDTHH:mm" read as IST. */
const ist = (s: string) => Timestamp.fromDate(new Date(`${s}:00+05:30`));

/**
 * One-time setup of a brand-new project without any service-account key (Google's default
 * org policy blocks key creation). Only works when:
 *   1. the caller's *verified* email equals BOOTSTRAP_ADMIN_EMAIL (set by whoever deploys), and
 *   2. no admin exists yet.
 * After the first admin exists this function refuses forever — add more admins in the
 * Supabase table editor (RLSPOLICIES §10: no in-app privilege escalation).
 */
export const bootstrapElection = onCall(callOpts, async (req) => {
  const email = verifiedEmail(req);
  const allowed = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!allowed || email !== allowed) throw new HttpsError("permission-denied", "This account can't set up the election.");

  const created = await db.runTransaction(async (tx) => {
    const anyAdmin = await tx.get(db.collection("admins").limit(1));
    if (!anyAdmin.empty) return false;
    const settingsRef = db.doc("settings/election");
    const settings = await tx.get(settingsRef);
    const positions = await tx.get(db.collection("positions").limit(1));

    tx.set(db.doc(`admins/${email}`), {
      email, name: email.split("@")[0], canViewVoters: true, addedBy: "bootstrap", createdAt: FieldValue.serverTimestamp(),
    });
    if (!settings.exists) {
      tx.set(settingsRef, {
        phase: "setup",
        campaignOpensAt: ist(process.env.CAMPAIGN_OPENS ?? "2026-11-17T09:00"),
        opensAt: ist(process.env.VOTING_OPENS ?? "2026-11-19T09:00"),
        closesAt: ist(process.env.VOTING_CLOSES ?? "2026-11-20T20:00"),
        siteClosesAt: ist(process.env.SITE_CLOSES ?? "2026-11-23T23:59"),
        paused: false, pausedReason: null, resultsPublished: false,
        nomineesCanSelfVote: true, receiptsByEmail: false, requireStudentMfa: false,
        updatedBy: email, updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (positions.empty) {
      POSITIONS.forEach((p, i) => {
        tx.set(db.doc(`positions/${p.id}`), {
          ...p, description: "", order: i + 1, active: true, nomineeCount: 0,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(db.doc(`tallies/${p.id}`), { positionId: p.id, counts: {}, total: 0, updatedAt: FieldValue.serverTimestamp() });
      });
    }
    return true;
  });
  if (!created) throw new HttpsError("already-exists", "The election is already set up. Ask an existing admin to add you.");

  await rtdb.ref("meta/eligible").set(0);
  await audit(email, "admin", "settings_changed", "settings/election", { op: "bootstrap" });
  return { ok: true };
});
