import { db } from "../lib/admin";
import { deliver, queueEmail, welcomeEmail } from "../lib/mailer";

/** Queues the welcome email; the dedupe id makes repeat calls send nothing (free-hosting path). */
export async function welcomeOnce(niatId: string): Promise<void> {
  const s = await db.doc(`students/${niatId}`).get();
  if (!s.exists || s.get("status") !== "active" || !s.get("email")) return;
  const firstName = String(s.get("name") ?? "").split(" ")[0] || "there";
  const { subject, html } = welcomeEmail(firstName);
  await queueEmail("welcome", String(s.get("email")), subject, html, `welcome_${niatId}`);
}

/** Sends emails that waited for Brevo's daily limit; stops as soon as the accounts are full again. */
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
