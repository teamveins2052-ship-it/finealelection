import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db, ENFORCE_APP_CHECK, IS_EMULATOR } from "../lib/admin";

export interface StudentCtx {
  niatId: string;
  email: string;
  name: string;
  batch: string;
  isNominee: boolean;
  nomineeOf: string | null;
}
export interface AdminCtx {
  email: string;
  canViewVoters: boolean;
}

export const ADMIN_SESSION_SEC = 12 * 3600;

/**
 * 2-step proof lives in a custom claim `mfa` equal to the token's `auth_time`. A new sign-in
 * changes auth_time, so every fresh login must pass the authenticator step again.
 */
export function mfaVerified(req: CallableRequest): boolean {
  const t = req.auth?.token as { mfa?: number; auth_time?: number } | undefined;
  return !!t && typeof t.mfa === "number" && t.mfa === t.auth_time;
}

export async function studentMfaRequired(): Promise<boolean> {
  const s = await db.doc("settings/election").get();
  return s.get("requireStudentMfa") !== false; // default ON
}

export function verifiedEmail(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (ENFORCE_APP_CHECK && !req.app) throw new HttpsError("failed-precondition", "App verification failed."); // P-APP-01
  const { email, email_verified } = req.auth.token;
  if (!email || email_verified !== true) throw new HttpsError("permission-denied", "Email not verified.");
  return email.toLowerCase();
}

/** Caller must be the verified, active owner of a student record (RLSPOLICIES §2). */
export async function requireStudent(req: CallableRequest): Promise<StudentCtx> {
  const email = verifiedEmail(req);
  const snap = await db.collection("students").where("email", "==", email).limit(2).get();
  if (snap.size !== 1) throw new HttpsError("permission-denied", "No unique student record for this email.");
  const s = snap.docs[0].data();
  if (s.status !== "active") throw new HttpsError("permission-denied", "Account is not active.");
  // 2-step: required for everyone when the setting is on; otherwise only for students who opted in.
  if (!mfaVerified(req) && (s.mfaEnabled === true || (await studentMfaRequired()))) {
    throw new HttpsError("permission-denied", "Finish 2-step verification first.");
  }
  return {
    niatId: snap.docs[0].id,
    email,
    name: s.name,
    batch: s.batch,
    isNominee: !!s.isNominee,
    nomineeOf: s.nomineeOf ?? null,
  };
}

export async function requireNominee(req: CallableRequest): Promise<StudentCtx & { nomineeId: string }> {
  const s = await requireStudent(req);
  if (!s.isNominee || !s.nomineeOf) throw new HttpsError("permission-denied", "Nominees only.");
  const nomineeId = `${s.nomineeOf}_${s.niatId}`;
  const n = await db.doc(`nominees/${nomineeId}`).get();
  if (!n.exists || n.get("active") !== true) throw new HttpsError("permission-denied", "Nominee profile inactive.");
  return { ...s, nomineeId };
}

export async function requireAdmin(req: CallableRequest): Promise<AdminCtx> {
  const email = verifiedEmail(req);
  const a = await db.doc(`admins/${email}`).get();
  if (!a.exists) throw new HttpsError("permission-denied", "Admins only.");
  const s = await db.doc("settings/election").get();
  const mfaReq = s.get("requireAdminMfa") === true;
  if (mfaReq && !mfaVerified(req)) throw new HttpsError("permission-denied", "Finish 2-step verification first.");
  const authTime = Number((req.auth!.token as { auth_time?: number }).auth_time ?? 0);
  if (authTime && Date.now() / 1000 - authTime > ADMIN_SESSION_SEC) {
    throw new HttpsError("unauthenticated", "Your admin session expired. Sign in again.");
  }
  return { email, canViewVoters: a.get("canViewVoters") === true };
}

export async function requireVoterAdmin(req: CallableRequest): Promise<AdminCtx> {
  const admin = await requireAdmin(req);
  if (!admin.canViewVoters) throw new HttpsError("permission-denied", "Voter access not granted.");
  return admin;
}

/** Firestore-backed fixed-window limiter for callables (Redis is used on the edge). */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<void> {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const ref = db.doc(`_rateLimits/${key.replace(/[/.]/g, "_")}_${bucket}`);
  const count = await db.runTransaction(async (tx) => {
    const cur = ((await tx.get(ref)).get("count") as number | undefined) ?? 0;
    if (cur >= max) return cur + 1;
    tx.set(ref, { count: cur + 1, expiresAt: new Date((bucket + 1) * windowSec * 1000 + 3600_000) }, { merge: true });
    return cur + 1;
  });
  if (count > max) throw new HttpsError("resource-exhausted", "Too many requests. Try again shortly.");
}

export async function audit(
  actor: string,
  actorRole: "student" | "nominee" | "admin" | "system",
  action: string,
  target: string | null,
  meta: Record<string, unknown> = {},
) {
  await db.collection("auditLogs").add({ actor, actorRole, action, target, meta, at: FieldValue.serverTimestamp() });
}

/** Cloudflare Turnstile check for anonymous callables. Skipped in the emulator / when unconfigured. */
export async function verifyTurnstile(token: string, ip?: string): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET;
  if (IS_EMULATOR || !secret) return;
  const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const json = (await res.json()) as { success?: boolean };
  if (!json.success) throw new HttpsError("permission-denied", "Bot check failed. Refresh and try again.");
}
