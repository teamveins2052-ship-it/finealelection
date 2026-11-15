"use client";

import { signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { firebase } from "@/lib/firebase/client";
import { SESSION_KEY } from "@/hooks/use-session";

export const NIAT_KEY = "niat.loginId";
export const EMAIL_LINK_KEY = "niat.emailForSignIn";

export type LoginOutcome =
  | { ok: true; to: string }
  | { ok: false; reason: "mismatch"; message: string };

/**
 * Runs after Google / email-link / emulator sign-in. Identity = verified email matches the
 * sheet (D-01). A Google account that isn't the registered one is signed straight back out.
 */
export async function finishLogin(expectedNiatId?: string | null): Promise<LoginOutcome> {
  const { auth, db } = firebase();
  const user = auth.currentUser;
  const email = user?.email?.toLowerCase();
  if (!user || !email) return { ok: false, reason: "mismatch", message: "Sign-in didn't complete. Try again." };

  let isAdmin = false;
  try {
    isAdmin = (await getDoc(doc(db, "admins", email))).exists();
  } catch {
    isAdmin = false;
  }

  const snap = await getDocs(query(collection(db, "students"), where("email", "==", email), limit(1)));
  const student = snap.docs[0];

  if (!student) {
    if (isAdmin) return { ok: true, to: "/admin" };
    await signOut(auth);
    return {
      ok: false,
      reason: "mismatch",
      message: "This account isn't the one registered for your NIAT ID. Use your registered email, or request a correction.",
    };
  }
  if (expectedNiatId && student.id !== expectedNiatId) {
    await signOut(auth);
    return {
      ok: false,
      reason: "mismatch",
      message: `This account isn't the one registered for ${expectedNiatId}. Use the email shown on the previous step, or request a correction.`,
    };
  }

  if (student.get("status") === "active") {
    // A7 single-device session: newest login wins; older devices see the change and sign out.
    const sid = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sid);
    await updateDoc(doc(db, "students", student.id), { activeSessionId: sid, lastLoginAt: serverTimestamp() }).catch(() => undefined);
  }
  sessionStorage.removeItem(NIAT_KEY);
  return { ok: true, to: "/dashboard" };
}
