import { db } from "../lib/admin";

/**
 * Keeps nominees.reactionCounts in sync (PRD N7): recount one nominee's reactions from scratch with two
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
