import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { callOpts } from "../lib/admin";
import { rateLimit, requireAdmin, requireStudent } from "../auth/guards";
import { countVote } from "../triggers/on-vote-created";
import { syncSettingsFromDb } from "../triggers/on-settings-written";
import { recountReactions } from "../triggers/on-reaction-written";
import { welcomeOnce } from "../triggers/mail-triggers";
import { NomineeId, PositionId, ids } from "../schema";

/*
 * Free-hosting replacements for the Firestore triggers (no Blaze plan → no triggers).
 * The browser calls these right after it writes; each one only re-derives server-owned data
 * from documents already in the database, so a caller can't forge anything — at worst it
 * makes the server do idempotent work early. tick.ts sweeps anything a client never reported.
 */

/** "Count my vote": a student can only ask for THEIR OWN vote doc to be counted (P-VOT-*). */
export const countMyVote = onCall(callOpts, async (req) => {
  const me = await requireStudent(req);
  const { positionId } = z.object({ positionId: PositionId }).parse(req.data);
  await rateLimit(`count_${me.niatId}`, 30, 600);
  const counted = await countVote(ids.vote(me.niatId, positionId));
  return { counted };
});

/** Recount reactions for one nominee after the student changes their reaction. */
export const syncReactions = onCall(callOpts, async (req) => {
  const me = await requireStudent(req);
  const { nomineeId } = z.object({ nomineeId: NomineeId }).parse(req.data);
  await rateLimit(`react_${me.niatId}`, 60, 600);
  await recountReactions(nomineeId);
  return { ok: true };
});

/** Mirror settings to RTDB + audit, right after an admin saves them. */
export const syncElection = onCall(callOpts, async (req) => {
  await requireAdmin(req);
  await syncSettingsFromDb();
  return { ok: true };
});

/** Welcome email on sign-in (deduped per student, so repeat logins send nothing). */
export const welcome = onCall(callOpts, async (req) => {
  const me = await requireStudent(req).catch(() => {
    throw new HttpsError("permission-denied", "Not a student.");
  });
  await welcomeOnce(me.niatId);
  return { ok: true };
});
