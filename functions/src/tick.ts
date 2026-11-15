import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./lib/admin";
import { countVote } from "./triggers/on-vote-created";
import { syncSettingsFromDb } from "./triggers/on-settings-written";
import { drainQueue } from "./triggers/mail-triggers";

/**
 * Background housekeeping for free hosting (replaces triggers + the scheduled function):
 *  1. count any vote the browser never reported (closed tab, lost signal…)
 *  2. mirror settings → RTDB (covers changes made in the Firebase console)
 *  3. send queued emails that waited for Brevo's daily limit
 * A Firestore lease makes sure only one server instance runs it per window.
 */
const LEASE_MS = 60_000;

export async function runTick(force = false): Promise<{ ran: boolean; counted: number; mailed: number }> {
  const lease = db.doc("_meta/tick");
  const got = await db.runTransaction(async (tx) => {
    const cur = await tx.get(lease);
    const last = (cur.get("at") as Timestamp | undefined)?.toMillis() ?? 0;
    if (!force && Date.now() - last < LEASE_MS) return false;
    tx.set(lease, { at: Timestamp.now() }, { merge: true });
    return true;
  });
  if (!got) return { ran: false, counted: 0, mailed: 0 };

  // Sweep votes created since the last cursor (5 min overlap — counting is idempotent).
  const cur = await lease.get();
  const since = (cur.get("voteCursor") as Timestamp | undefined) ?? Timestamp.fromMillis(0);
  const from = Timestamp.fromMillis(Math.max(0, since.toMillis() - 5 * 60_000));
  const votes = await db.collection("votes").where("createdAt", ">", from).orderBy("createdAt").limit(400).get();
  let counted = 0;
  let newest = since;
  for (const v of votes.docs) {
    if (v.get("counted") !== true && (await countVote(v.id))) counted++;
    const at = v.get("createdAt") as Timestamp | undefined;
    if (at && at.toMillis() > newest.toMillis()) newest = at;
  }
  // Only advance past a full page when it was fully processed; a partial page means caught up.
  await lease.set({ voteCursor: newest, lastRun: FieldValue.serverTimestamp() }, { merge: true });

  await syncSettingsFromDb();
  const mailed = await drainQueue(50);
  return { ran: true, counted, mailed };
}
