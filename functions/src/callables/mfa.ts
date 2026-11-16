import { onCall, HttpsError, type CallableRequest } from "../lib/callable";
import { FieldValue, type Timestamp } from "../lib/store";
import { db, callOpts } from "../lib/admin";

// Authenticator secrets are encrypted with MFA_ENCRYPTION_KEY (lib/totp.ts).
const mfaOpts = callOpts;
import { audit, mfaVerified, rateLimit, requireAdmin, studentMfaRequired, verifiedEmail } from "../auth/guards";
import {
  currentStep, decryptSecret, encryptSecret, hashBackupCode, newBackupCodes, newSecret, otpauthUri, verifyTotp,
} from "../lib/totp";
import { MfaCodeInput, MfaResetInput } from "../schema";

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

interface Account {
  uid: string;
  email: string;
  role: "admin" | "student";
  authTime: number;
  sessionId: string;
  required: boolean;
}

/** Any verified admin or *active* student may manage their own 2-step (no 2-step needed to start it). */
async function requireAccount(req: CallableRequest): Promise<Account> {
  const email = verifiedEmail(req);
  const uid = req.auth!.uid;
  const authTime = Number(req.auth!.token.auth_time ?? 0);
  const sessionId = String(req.auth!.token.session_id ?? "");
  if (!sessionId) throw new HttpsError("unauthenticated", "Sign in again.");
  if ((await db.doc(`admins/${email}`).get()).exists) return { uid, email, role: "admin", authTime, sessionId, required: true };
  const s = await db.collection("students").where("email", "==", email).limit(2).get();
  if (s.size !== 1 || s.docs[0].get("status") !== "active") {
    throw new HttpsError("permission-denied", "This account can't sign in right now.");
  }
  // Students: required when the election setting says so, OR when they opted in themselves.
  const optedIn = s.docs[0].get("mfaEnabled") === true;
  return { uid, email, role: "student", authTime, sessionId, required: optedIn || (await studentMfaRequired()) };
}

const mfaRef = (uid: string) => db.doc(`mfa/${uid}`);

/** students.mfaEnabled is server-owned (clients can't change it — P-STU-02 allows only login fields). */
async function setStudentMfaFlag(email: string, on: boolean) {
  const s = await db.collection("students").where("email", "==", email.toLowerCase()).limit(1).get();
  if (!s.empty) await s.docs[0].ref.update({ mfaEnabled: on, updatedAt: FieldValue.serverTimestamp() });
}

/**
 * Proof bound to THIS sign-in: a row keyed by the Supabase session id. A new sign-in gets a
 * new session id, so every fresh login must pass 2-step again (lib/auth.ts reads it).
 */
async function grantSession(me: Account) {
  await db.doc(`_mfaSessions/${me.sessionId}`).set({
    uid: me.uid, email: me.email, authTime: me.authTime, at: FieldValue.serverTimestamp(),
  });
}

export const mfaStatus = onCall(mfaOpts, async (req) => {
  const me = await requireAccount(req);
  const snap = await mfaRef(me.uid).get();
  const lockedUntil = (snap.get("lockedUntil") as Timestamp | undefined)?.toMillis() ?? 0;
  return {
    role: me.role,
    required: me.required,
    verified: mfaVerified(req), // this sign-in already passed 2-step
    enrolled: snap.get("enabled") === true,
    backupCodesLeft: ((snap.get("backupHashes") as string[] | undefined) ?? []).length,
    lockedUntil: lockedUntil > Date.now() ? lockedUntil : null,
  };
});

/** Step 1 of setup: a fresh secret, stored encrypted and *not yet active*. */
export const mfaEnrollStart = onCall(mfaOpts, async (req) => {
  const me = await requireAccount(req);
  await rateLimit(`mfa_enroll_${me.uid}`, 10, 3600);
  const ref = mfaRef(me.uid);
  if ((await ref.get()).get("enabled") === true) {
    throw new HttpsError("already-exists", "2-step is already set up. Ask the committee to reset it if you lost your phone.");
  }
  const secret = newSecret();
  await ref.set({ email: me.email, pendingSecret: encryptSecret(secret), enabled: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { secret, otpauthUri: otpauthUri(secret, me.email) };
});

/** Step 2 of setup: prove the app works, activate, hand out backup codes once. */
export const mfaEnrollConfirm = onCall(mfaOpts, async (req) => {
  const me = await requireAccount(req);
  await rateLimit(`mfa_enroll_${me.uid}`, 10, 3600);
  const { code } = MfaCodeInput.parse(req.data);
  const ref = mfaRef(me.uid);
  const snap = await ref.get();
  const pending = snap.get("pendingSecret") as string | undefined;
  if (snap.get("enabled") === true || !pending) throw new HttpsError("failed-precondition", "Start setup again.");
  const secret = decryptSecret(pending);
  const step = verifyTotp(secret, code);
  if (step === null) throw new HttpsError("invalid-argument", "That code didn't match. Check your phone's time is automatic and try the newest code.");

  const backupCodes = newBackupCodes();
  await ref.set({
    secret: encryptSecret(secret), pendingSecret: FieldValue.delete(), enabled: true, lastStep: step,
    backupHashes: backupCodes.map(hashBackupCode), failCount: 0, lockedUntil: null,
    enrolledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await grantSession(me);
  // Opt-in flag on the student record: from now on rules + guards demand the code for them (P-MFA-05).
  if (me.role === "student") await setStudentMfaFlag(me.email, true);
  await audit(me.email, me.role, "mfa_enrolled", `mfa/${me.uid}`);
  return { backupCodes };
});

/** Every sign-in: authenticator code (or a one-time backup code). Lockout after 5 misses. */
export const mfaVerify = onCall(mfaOpts, async (req) => {
  const me = await requireAccount(req);
  await rateLimit(`mfa_verify_${me.uid}`, 20, 900);
  const { code } = MfaCodeInput.parse(req.data);
  const ref = mfaRef(me.uid);

  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get("enabled") !== true) return { ok: false as const, reason: "not_enrolled" as const };
    const lockedUntil = (snap.get("lockedUntil") as Timestamp | null | undefined)?.toMillis() ?? 0;
    if (lockedUntil > Date.now()) return { ok: false as const, reason: "locked" as const, lockedUntil };

    let ok = false;
    let usedBackup = false;
    const patch: Record<string, unknown> = {};
    if (/^\d{6}$/.test(code)) {
      const step = verifyTotp(decryptSecret(snap.get("secret") as string), code);
      // Replay protection: a code (time-step) can only be used once.
      if (step !== null && step > ((snap.get("lastStep") as number | undefined) ?? 0)) {
        ok = true;
        patch.lastStep = step;
      }
    } else {
      const hashes = (snap.get("backupHashes") as string[] | undefined) ?? [];
      const h = hashBackupCode(code);
      if (hashes.includes(h)) {
        ok = true;
        usedBackup = true;
        patch.backupHashes = hashes.filter((x) => x !== h); // one-time use
      }
    }

    if (ok) {
      tx.update(ref, { ...patch, failCount: 0, lockedUntil: null, lastVerifiedAt: FieldValue.serverTimestamp() });
      return { ok: true as const, usedBackup, left: ((snap.get("backupHashes") as string[] | undefined) ?? []).length - (usedBackup ? 1 : 0) };
    }
    const fails = ((snap.get("failCount") as number | undefined) ?? 0) + 1;
    const lock = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null;
    tx.update(ref, { failCount: lock ? 0 : fails, lockedUntil: lock });
    return { ok: false as const, reason: lock ? ("locked" as const) : ("wrong" as const), lockedUntil: lock?.getTime(), attemptsLeft: MAX_FAILS - fails };
  });

  if (!outcome.ok) {
    if (outcome.reason === "not_enrolled") throw new HttpsError("failed-precondition", "Set up 2-step verification first.");
    await audit(me.email, me.role, outcome.reason === "locked" ? "mfa_locked" : "mfa_failed", `mfa/${me.uid}`);
    if (outcome.reason === "locked") {
      throw new HttpsError("resource-exhausted", "Too many wrong codes. Try again in 15 minutes or ask the committee for help.");
    }
    throw new HttpsError("invalid-argument", `Wrong code. ${outcome.attemptsLeft} ${outcome.attemptsLeft === 1 ? "try" : "tries"} left.`);
  }
  await grantSession(me);
  await audit(me.email, me.role, "mfa_verified", `mfa/${me.uid}`, { backup: outcome.usedBackup });
  return { ok: true, usedBackup: outcome.usedBackup, backupCodesLeft: outcome.left, step: currentStep() };
});

/** Lost phone: an admin (who has passed their own 2-step) wipes a user's enrollment. */
export const mfaReset = onCall(mfaOpts, async (req) => {
  const admin = await requireAdmin(req);
  const { email } = MfaResetInput.parse(req.data);
  if (email === admin.email) throw new HttpsError("failed-precondition", "Ask another admin to reset your own 2-step.");
  const enrolled = await db.collection("mfa").where("email", "==", email).limit(5).get();
  const sessions = await db.collection("_mfaSessions").where("email", "==", email).get();
  if (enrolled.empty && sessions.empty) throw new HttpsError("not-found", "That person hasn't set up 2-step — nothing to reset.");
  const uid = enrolled.docs[0]?.id ?? (sessions.docs[0]?.get("uid") as string);
  const batch = db.batch();
  enrolled.docs.forEach((d) => batch.delete(d.ref));
  sessions.docs.forEach((d) => batch.delete(d.ref)); // every signed-in device loses its 2-step proof
  await batch.commit();
  await setStudentMfaFlag(email, false); // back to "optional, not set up" (no-op for admins)
  await audit(admin.email, "admin", "mfa_reset", `mfa/${uid}`, { email });
  return { ok: true };
});
