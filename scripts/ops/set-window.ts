/**
 * Operator script (16 Nov): open voting NOW and close it 20 Nov 8:00 PM IST on the real project,
 * then mirror to RTDB + audit (same code the site runs). Times are set on the server clock.
 *   tsx --env-file=.env.bootstrap scripts/ops/set-window.ts
 */
import { readFileSync } from "node:fs";
process.env.FIREBASE_SERVICE_ACCOUNT_B64 = Buffer.from(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!)).toString("base64");
process.env.DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const { db } = await import("../../functions/src/lib/admin");
const now = new Date();
const closes = new Date("2026-11-20T20:00:00+05:30");
const siteCloses = new Date("2026-11-23T23:59:00+05:30");
if (closes <= now) throw new Error("Close time is in the past");
await db.doc("settings/election").update({
  campaignOpensAt: now, opensAt: now, closesAt: closes, siteClosesAt: siteCloses,
  phase: "voting", paused: false, pausedReason: null,
  updatedBy: (process.env.ADMIN_EMAILS ?? "operator").split(",")[0], updatedAt: now,
});
const { runTick } = await import("../../functions/src/tick");
await runTick(true);
const s = (await db.doc("settings/election").get()).data()!;
const ist = (t: { toDate(): Date }) => t.toDate().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
console.log(`✅ voting opens ${ist(s.opensAt)} · closes ${ist(s.closesAt)} · site closes ${ist(s.siteClosesAt)} · paused=${s.paused}`);
process.exit(0);
