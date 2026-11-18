import { FieldValue } from "../lib/store";
import { db } from "../lib/admin";
import { flushLive } from "../lib/live";
import { audit } from "../auth/guards";
import { queueEmail, stickerEmail } from "../lib/mailer";
import { receiptCode } from "../schema";

/**
 * The ONLY place votes are counted (AGENTS §5.3): /api/fn/countMyVote right after the
 * browser writes, plus the sweep in tick.ts. The `counted` flag inside the transaction makes
 * a repeat a no-op (DATAMODEL §8). Safe to call any number of times.
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

  // Public live counts (rt.tallies / rt.wall) are rebuilt from the tallies, throttled (lib/live.ts).
  await flushLive().catch((e) => console.error("[live] flush failed", e instanceof Error ? e.message : e));

  await audit(result.voterId, "student", "vote_cast", `votes/${voteId}`, { positionId: result.positionId });

  // "I voted" sticker email once the student has voted in EVERY active club (never names a nominee).
  try {
    let activeClubs = 7;
    try {
      const snap = await db.collection("positions").where("active", "==", true).get();
      activeClubs = snap.size || 7;
    } catch {
      activeClubs = 7;
    }
    if (result.email && activeClubs > 0 && result.votedCount >= activeClubs) {
      const { subject, html } = stickerEmail(result.name.split(" ")[0], activeClubs);
      await queueEmail("sticker", result.email, subject, html, `sticker_${result.voterId}`);
    }
  } catch (mailErr) {
    console.error("[vote] sticker email failed", mailErr);
  }
  return true;
}
