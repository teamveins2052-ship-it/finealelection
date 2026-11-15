import { onDocumentWritten } from "firebase-functions/v2/firestore";
import type { DocumentData, Timestamp } from "firebase-admin/firestore";
import { db, rtdb, REGION } from "../lib/admin";
import { audit } from "../auth/guards";

/**
 * Admins write settings directly (P-SET-02), so this trigger guarantees every change is
 * audited and mirrors the flags students need instantly to RTDB /election.
 */
export const onSettingsWritten = onDocumentWritten({ document: "settings/election", region: REGION }, async (event) => {
  await mirrorSettings(event.data?.before.data(), event.data?.after.data());
});

/**
 * Free-hosting path (no triggers): compare settings/election with the last copy we mirrored
 * (_meta/settingsMirror) and run the same mirror + audit. Idempotent — an unchanged
 * document audits nothing.
 */
export async function syncSettingsFromDb(): Promise<void> {
  const [cur, last] = await Promise.all([db.doc("settings/election").get(), db.doc("_meta/settingsMirror").get()]);
  const after = cur.data();
  if (!after) return;
  const before = last.exists ? (last.get("data") as DocumentData) : undefined;
  if (before && JSON.stringify(before) === JSON.stringify(after)) return;
  await mirrorSettings(before, after);
  await db.doc("_meta/settingsMirror").set({ data: after });
}

export async function mirrorSettings(before: DocumentData | undefined, after: DocumentData | undefined): Promise<void> {
  if (!after) return;

  await rtdb.ref("election").set({
    phase: after.phase ?? "setup",
    paused: after.paused === true,
    closesAt: (after.closesAt as Timestamp).toMillis(),
    resultsPublished: after.resultsPublished === true,
  });

  const actor = (after.updatedBy as string | undefined) ?? "system";
  const role = actor.includes("@") ? "admin" : "system";
  if (before && before.paused !== after.paused) {
    await audit(actor, role, after.paused ? "voting_paused" : "voting_resumed", "settings/election", {
      reason: after.pausedReason ?? null,
    });
  }
  if (before && before.resultsPublished !== after.resultsPublished && after.resultsPublished) {
    await audit(actor, role, "results_published", "settings/election");
  }
  const changed = Object.keys(after).filter(
    (k) => !["paused", "pausedReason", "resultsPublished", "updatedAt", "updatedBy"].includes(k)
      && JSON.stringify(before?.[k]) !== JSON.stringify(after[k]),
  );
  if (changed.length) await audit(actor, role, "settings_changed", "settings/election", { fields: changed });
}
