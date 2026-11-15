import { FieldValue, type DocumentData, type Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db, rtdb, IS_EMULATOR } from "./admin";
import { mailAccounts, pickAccount, type DayUsage } from "./mail-accounts";

export const mask = {
  email: (e: string) => {
    const [u = "", d = ""] = e.split("@");
    return `${u[0] ?? ""}${"*".repeat(Math.max(u.length - 1, 3))}@${d}`;
  },
  phone: (p: string) => `******${p.slice(-4)}`,
  admission: (a: string | undefined) => (a ? `${"*".repeat(Math.max(a.length - 3, 3))}${a.slice(-3)}` : ""),
};

/** directory/{niatId} is the only pre-login view of a student — masked fields only (P-DIR-01). */
export function directoryEntry(s: DocumentData) {
  return {
    name: s.name,
    maskedEmail: mask.email(s.email),
    maskedPhone: mask.phone(s.phone),
    maskedAdmission: mask.admission(s.admissionNo),
    batch: s.batch,
    status: s.status,
  };
}

export interface ElectionTimes {
  opensAt: number;
  closesAt: number;
  paused: boolean;
}

export async function electionTimes(): Promise<ElectionTimes> {
  const s = await db.doc("settings/election").get();
  if (!s.exists) throw new HttpsError("failed-precondition", "Election settings missing.");
  return {
    opensAt: (s.get("opensAt") as Timestamp).toMillis(),
    closesAt: (s.get("closesAt") as Timestamp).toMillis(),
    paused: s.get("paused") === true,
  };
}

/** Eligible voter count for turnout %, kept in a server-only RTDB node (root rule denies reads). */
export async function refreshEligible(): Promise<number> {
  const agg = await db.collection("students").where("status", "==", "active").count().get();
  const n = agg.data().count;
  await rtdb.ref("meta/eligible").set(n);
  return n;
}

export async function emailUniqueOrThrow(email: string, exceptNiatId: string) {
  const dup = await db.collection("students").where("email", "==", email).limit(2).get();
  if (dup.docs.some((d) => d.id !== exceptNiatId)) {
    throw new HttpsError("already-exists", "Another student already uses that email.");
  }
}

/**
 * Brevo transactional email with automatic account switching (see mail-accounts.ts).
 * Without any BREVO key (local dev) it logs instead, so flows still complete.
 * Each account stops at BREVO_DAILY_CAP (default 280, safely under Brevo's 300/day);
 * if Brevo refuses an account early (limit/suspension), that account is skipped for the day.
 */
/** sent · full (every account at today's limit → retry tomorrow) · failed (bad address etc.) */
export type SendResult = "sent" | "full" | "failed";

export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  const accounts = mailAccounts();
  if (!accounts.length || IS_EMULATOR) {
    console.log(`[email:dev] to=${to.replace(/(.).+@/, "$1***@")} subject="${subject}"`);
    return "sent";
  }
  const day = new Date().toISOString().slice(0, 10);
  const quotaRef = db.doc(`_emailQuota/${day}`);
  const cap = Number(process.env.BREVO_DAILY_CAP ?? 280);
  const tried = new Set<number>();

  while (tried.size < accounts.length) {
    // Reserve one send on the first account with room (transaction → no double-counting).
    const idx = await db.runTransaction(async (tx) => {
      const snap = await tx.get(quotaRef);
      const usage: DayUsage = {
        sent: accounts.map((_, i) => (snap.get(`sent_${i}`) as number | undefined) ?? 0),
        full: accounts.map((_, i) => snap.get(`full_${i}`) === true || tried.has(i)),
      };
      const i = pickAccount(usage, accounts.length, cap);
      if (i >= 0) tx.set(quotaRef, { [`sent_${i}`]: usage.sent[i] + 1 }, { merge: true });
      return i;
    });
    if (idx < 0) {
      console.warn("[email] all Brevo accounts at today's limit — queued for tomorrow");
      return "full";
    }
    tried.add(idx);
    const { key, from } = accounts[idx];
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { email: from, name: "NIAT Elections" },
        ...(process.env.EMAIL_REPLY_TO ? { replyTo: { email: process.env.EMAIL_REPLY_TO, name: "NIAT Elections" } } : {}),
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (res.ok) return "sent";
    // Give the reserved slot back; on limit/account errors, mark this account full for today and try the next.
    const accountProblem = res.status === 402 || res.status === 403 || res.status === 429 || res.status === 401;
    await quotaRef.set({ [`sent_${idx}`]: FieldValue.increment(-1), ...(accountProblem ? { [`full_${idx}`]: true } : {}) }, { merge: true });
    console.error("[email] brevo failed", { account: idx + 1, status: res.status });
    if (!accountProblem) return "failed"; // e.g. bad recipient address — another account won't help
  }
  return "full";
}

export const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
