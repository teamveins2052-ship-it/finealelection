import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { db, rtdb, REGION } from "../lib/admin";
import { audit } from "../auth/guards";
import { queueEmail, stickerEmail } from "../lib/mailer";
import { receiptCode } from "../schema";

/**
 * The ONLY place votes are counted (AGENTS §5.3). Triggers are at-least-once, so the
 * `counted` flag inside the transaction makes a replay a no-op (DATAMODEL §8).
 */
export const onVoteCreated = onDocumentCreated({ document: "votes/{voteId}", region: REGION }, async (event) => {
  await countVote(event.params.voteId);
});

/**
 * Counts one vote. Shared by the Firestore trigger (Cloud Functions) and the free-hosting
 * path (/api/fn/countMyVote + the sweep in tick.ts). Safe to call any number of times.
 * Returns true only on the call that actually counted it.
 */
export async function countVote(voteId: string): Promise<boolean> {
  const voteRef = db.doc(`votes/${voteId}`);

  const result = await db.runTransaction(async (tx) => {
    const vote = await tx.get(voteRef);
    if (!vote.exists || vote.get("counted") === true) return null;
    const { voterId, positionId, nomineeId } = vote.data() as { voterId: string; positionId: string; nomineeId: string };

    const tallyRef = db.doc(`tallies/${positionId}`);
    const studentRef = db.doc(`students/${voterId}`);
    const positionRef = db.doc(`positions/${positionId}`);
    const [tally, student, position] = await Promise.all([tx.get(tallyRef), tx.get(studentRef), tx.get(positionRef)]);

    const club = (position.get("club") as string | undefined) ?? positionId;
    const code = receiptCode(club);
    const counts = { ...((tally.get("counts") as Record<string, number> | undefined) ?? {}) };
    counts[nomineeId] = (counts[nomineeId] ?? 0) + 1;
    const total = ((tally.get("total") as number | undefined) ?? 0) + 1;
    const prevCount = (student.get("votedCount") as number | undefined) ?? 0;
    const firstVote = prevCount === 0;

    tx.update(voteRef, { counted: true, receiptCode: code, batch: student.get("batch") ?? "unknown" });
    tx.set(tallyRef, { positionId, counts, total, updatedAt: FieldValue.serverTimestamp() });
    tx.update(studentRef, {
      votedPositions: FieldValue.arrayUnion(positionId),
      votedCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      voterId, positionId, counts, total, club, firstVote, votedCount: prevCount + 1,
      email: student.get("email") as string, name: student.get("name") as string,
    };
  });
  if (!result) return false;

  // Mirrors are disposable and rebuildable (9001/9002), so they run after commit.
  // `set` (not increment) keeps the tally mirror idempotent.
  await rtdb.ref(`tallies/${result.positionId}`).set({ counts: result.counts, total: result.total, updatedAt: Date.now() });

  const eligible = ((await rtdb.ref("meta/eligible").get()).val() as number | null) ?? 0;
  await rtdb.ref("wall").transaction((cur: { totalVotes?: number; votersCount?: number } | null) => {
    const totalVotes = (cur?.totalVotes ?? 0) + 1;
    const votersCount = (cur?.votersCount ?? 0) + (result.firstVote ? 1 : 0);
    const turnoutPct = eligible > 0 ? Math.min(100, +((votersCount / eligible) * 100).toFixed(1)) : 0;
    return { ...(cur ?? {}), totalVotes, votersCount, turnoutPct };
  });
  // Anonymous ticker: club + time only — no names, no IDs (P-RTD-01).
  await rtdb.ref("wall/recent").push({ club: result.club, at: Date.now() });
  const recent = await rtdb.ref("wall/recent").orderByKey().get();
  const keys = Object.keys((recent.val() as Record<string, unknown> | null) ?? {});
  if (keys.length > 10) {
    await rtdb.ref("wall/recent").update(Object.fromEntries(keys.slice(0, keys.length - 10).map((k) => [k, null])));
  }

  await audit(result.voterId, "student", "vote_cast", `votes/${voteId}`, { positionId: result.positionId });

  // Receipts stay in-app (My Votes) — per-vote emails would use up the daily Brevo limit.
  // "I voted" sticker email once the student has voted in EVERY active club (never names a nominee).
  const activeClubs = (await db.collection("positions").where("active", "==", true).count().get()).data().count;
  if (result.email && activeClubs > 0 && result.votedCount >= activeClubs) {
    const { subject, html } = stickerEmail(result.name.split(" ")[0], activeClubs);
    await queueEmail("sticker", result.email, subject, html, `sticker_${result.voterId}`);
  }
  return true;
}
