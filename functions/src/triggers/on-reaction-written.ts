import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { db, REGION } from "../lib/admin";

/**
 * Keeps nominees.reactionCounts in sync (PRD N7). An `_events/{eventId}` marker inside the
 * transaction makes at-least-once delivery safe: a replayed event changes nothing.
 */
export const onReactionWritten = onDocumentWritten(
  { document: "reactions/{reactionId}", region: REGION },
  async (event) => {
    const before = event.data?.before.data() as { type?: string; nomineeId?: string } | undefined;
    const after = event.data?.after.data() as { type?: string; nomineeId?: string } | undefined;
    const nomineeId = after?.nomineeId ?? before?.nomineeId;
    if (!nomineeId || before?.type === after?.type) return;

    const marker = db.doc(`_events/${event.id}`);
    const nominee = db.doc(`nominees/${nomineeId}`);
    await db.runTransaction(async (tx) => {
      if ((await tx.get(marker)).exists) return;
      const n = await tx.get(nominee);
      if (!n.exists) return;
      const patch: Record<string, FieldValue> = {};
      if (before?.type === "fire" || before?.type === "clap") patch[`reactionCounts.${before.type}`] = FieldValue.increment(-1);
      if (after?.type === "fire" || after?.type === "clap") patch[`reactionCounts.${after.type}`] = FieldValue.increment(1);
      tx.update(nominee, patch);
      tx.set(marker, { at: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 7 * 86400_000) });
    });
  },
);

/**
 * Free-hosting path (no triggers): recount one nominee's reactions from scratch with two
 * cheap count() queries. Idempotent by construction — no event markers needed.
 */
export async function recountReactions(nomineeId: string): Promise<void> {
  const nominee = db.doc(`nominees/${nomineeId}`);
  if (!(await nominee.get()).exists) return;
  const base = db.collection("reactions").where("nomineeId", "==", nomineeId);
  const [fire, clap] = await Promise.all([
    base.where("type", "==", "fire").count().get(),
    base.where("type", "==", "clap").count().get(),
  ]);
  await nominee.update({ "reactionCounts.fire": fire.data().count, "reactionCounts.clap": clap.data().count });
}
