import { FieldValue, type DocumentReference } from "./store";
import { db } from "./admin";
import { APP_URL, sendEmail } from "./helpers";

/**
 * Brevo email outbox. Every app email (welcome, sticker, announcement, reminder, correction)
 * goes through here:
 *   1. a row is written to `_mail_queue` (server-only — no browser access),
 *   2. we try to send immediately (switching Brevo accounts automatically),
 *   3. if every account is at today's limit, the row stays "queued" and runTick
 *      (tick.ts) sends it later — nobody is silently dropped.
 * Sign-in-link emails are NOT queued: callables/login.ts sends them immediately.
 */
export type MailKind = "welcome" | "sticker" | "announcement" | "reminder" | "correction";

export interface QueuedMail {
  kind: MailKind;
  to: string;
  subject: string;
  html: string;
  status: "queued" | "sent" | "failed";
  attempts: number;
}

const queue = () => db.collection("_mailQueue");

/**
 * Queue (and try to send) one email. `dedupeId` makes it idempotent: e.g. `welcome_<niatId>`
 * can never be sent twice even if a trigger fires twice (triggers are at-least-once).
 */
export async function queueEmail(kind: MailKind, to: string, subject: string, html: string, dedupeId?: string): Promise<"sent" | "queued" | "failed" | "duplicate"> {
  const ref = dedupeId ? queue().doc(dedupeId) : queue().doc();
  try {
    await ref.create({ kind, to, subject, html, status: "queued", attempts: 0, createdAt: FieldValue.serverTimestamp() });
  } catch (e) {
    if ((e as { code?: number }).code === 6) return "duplicate"; // ALREADY_EXISTS
    throw e;
  }
  return deliver(ref);
}

/** Try one queued email. Leaves it "queued" when all accounts are full for today. */
export async function deliver(ref: DocumentReference): Promise<"sent" | "queued" | "failed"> {
  const snap = await ref.get();
  const m = snap.data() as QueuedMail | undefined;
  if (!m || m.status !== "queued") return m?.status === "sent" ? "sent" : "failed";
  const result = await sendEmail(m.to, m.subject, m.html);
  if (result === "full") {
    await ref.update({ attempts: FieldValue.increment(1), lastTriedAt: FieldValue.serverTimestamp() });
    return "queued";
  }
  await ref.update({
    status: result === "sent" ? "sent" : "failed",
    attempts: FieldValue.increment(1),
    [result === "sent" ? "sentAt" : "failedAt"]: FieldValue.serverTimestamp(),
    html: FieldValue.delete(), // don't keep message bodies (may contain names) once handled
  });
  return result === "sent" ? "sent" : "failed";
}

// ---------------- templates (paper & ink, like the app) ----------------

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F2F1EC;font-family:Arial,Helvetica,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F1EC;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#FBFAF7;border:2px solid #111;border-radius:16px;padding:28px">
<tr><td>
<div style="font-weight:900;font-size:14px;letter-spacing:.04em">✓ NIAT ELECTIONS '26</div>
<h1 style="font-size:28px;line-height:1.1;margin:18px 0 12px;text-transform:uppercase">${esc(title)}</h1>
${bodyHtml}
<p style="margin-top:28px;font-size:12px;color:#5C5B56">You're getting this because you're registered to vote in NIAT Elections '26. Your vote stays private — we never email who you voted for.</p>
</td></tr></table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${href}" style="display:inline-block;background:#111;color:#FBFAF7;text-decoration:none;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:14px 26px;border-radius:999px">${esc(label)}</a></p>`;

export function welcomeEmail(firstName: string): { subject: string; html: string } {
  return {
    subject: "Welcome to NIAT Elections '26",
    html: layout(`Welcome, ${firstName}!`, `
<p style="font-size:16px;line-height:1.5">You're signed in and ready. Here's how it works:</p>
<ol style="font-size:15px;line-height:1.6;padding-left:20px">
<li>Browse every nominee's profile and promises.</li>
<li>Vote once in each club — your choice is final and private.</li>
<li>Keep your receipt codes in <b>My Votes</b>.</li>
</ol>
${button(`${APP_URL}/dashboard`, "Open your ballot")}`),
  };
}

/** "I voted" sticker — names the clubs count and the student, NEVER a nominee (D-16). */
export function stickerEmail(firstName: string, clubs: number): { subject: string; html: string } {
  const sticker = `<table role="presentation" align="center" style="margin:8px auto 4px"><tr><td align="center"
style="background:#111;color:#FBFAF7;border-radius:24px;padding:26px 34px;box-shadow:6px 7px 0 #F1DC9A">
<div style="font-size:44px;line-height:1">✓</div>
<div style="font-weight:900;font-size:34px;letter-spacing:.02em;margin-top:6px">I VOTED</div>
<div style="font-size:14px;margin-top:6px">in all ${clubs} clubs · NIAT Elections '26</div>
<div style="font-size:13px;margin-top:10px;opacity:.8">— ${esc(firstName)}</div>
</td></tr></table>`;
  return {
    subject: "Your 'I voted' sticker 🎉",
    html: layout("You did it!", `
<p style="font-size:16px;line-height:1.5">Thanks for voting in every club, ${esc(firstName)}. Here's your sticker — screenshot it and share it anywhere.</p>
${sticker}
${button(`${APP_URL}/my-votes`, "See your receipts")}`),
  };
}

/** Admin-written announcement. Plain text in, safely escaped, line breaks kept. */
export function announcementEmail(subject: string, message: string, firstName: string): { subject: string; html: string } {
  const paragraphs = esc(message).split(/\n{2,}/).map((p) => `<p style="font-size:16px;line-height:1.55">${p.replace(/\n/g, "<br>")}</p>`).join("");
  return {
    subject,
    html: layout(subject, `<p style="font-size:16px">Hi ${esc(firstName)},</p>${paragraphs}${button(APP_URL, "Open NIAT Elections")}`),
  };
}

export function reminderEmail(firstName: string, niatId: string): { subject: string; html: string } {
  return {
    subject: "Your vote is waiting — NIAT Elections '26",
    html: layout("Don't miss your vote", `<p style="font-size:16px;line-height:1.5">Hi ${esc(firstName)}, you still have clubs to vote in. It takes under a minute per club.</p>${button(`${APP_URL}/login?id=${encodeURIComponent(niatId)}`, "Vote now")}`),
  };
}

export function correctionEmail(resolved: boolean, niatId: string, note?: string): { subject: string; html: string } {
  return resolved
    ? { subject: "Your details are fixed — you can log in now", html: layout("You're all set", `<p style="font-size:16px;line-height:1.5">Your details were updated by the election committee.</p>${button(`${APP_URL}/login?id=${encodeURIComponent(niatId)}`, "Sign in to vote")}`) }
    : { subject: "Update on your correction request", html: layout("Request update", `<p style="font-size:16px;line-height:1.5">Your request wasn't approved${note ? `: ${esc(note)}` : ""}. Your account is active again with the original details.</p>${button(`${APP_URL}/login?id=${encodeURIComponent(niatId)}`, "Sign in")}`) };
}
