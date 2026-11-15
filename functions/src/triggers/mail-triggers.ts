import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, REGION } from "../lib/admin";
import { deliver, queueEmail, welcomeEmail } from "../lib/mailer";

/**
 * Welcome email on a student's FIRST sign-in (lastLoginAt goes from null → set).
 * The dedupe id `welcome_<niatId>` guarantees one email per student even if the trigger repeats.
 */
export const onStudentFirstLogin = onDocumentUpdated({ document: "students/{niatId}", region: REGION }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.lastLoginAt || !after.lastLoginAt || after.status !== "active" || !after.email) return;
  await welcomeOnce(event.params.niatId);
});

/** Queues the welcome email; the dedupe id makes repeat calls send nothing (free-hosting path). */
export async function welcomeOnce(niatId: string): Promise<void> {
  const s = await db.doc(`students/${niatId}`).get();
  if (!s.exists || s.get("status") !== "active" || !s.get("email")) return;
  const firstName = String(s.get("name") ?? "").split(" ")[0] || "there";
  const { subject, html } = welcomeEmail(firstName);
  await queueEmail("welcome", String(s.get("email")), subject, html, `welcome_${niatId}`);
}

/**
 * Sends emails that were waiting because both Brevo accounts hit today's limit.
 * Stops as soon as the accounts are full again, so it never wastes calls.
 */
export const drainMailQueue = onSchedule({ schedule: "every 15 minutes", region: REGION, timeZone: "Asia/Kolkata" }, async () => {
  await drainQueue(200);
});

export async function drainQueue(max: number): Promise<number> {
  const pending = await db.collection("_mailQueue").where("status", "==", "queued").orderBy("createdAt").limit(max).get();
  let sent = 0;
  for (const doc of pending.docs) {
    const r = await deliver(doc.ref);
    if (r === "queued") break; // all accounts full for today — try again next run
    if (r === "sent") sent++;
  }
  if (pending.size) console.log("[mail] drain", { waiting: pending.size, sent });
  return sent;
}
