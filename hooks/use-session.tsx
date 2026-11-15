"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, onIdTokenChanged, signOut, type User } from "firebase/auth";
import { collection, doc, getDoc, limit, onSnapshot, query, where } from "firebase/firestore";
import { firebase } from "@/lib/firebase/client";
import { conv, type WithId } from "@/lib/schema/converters";
import type { Student } from "@/lib/schema";

export const SESSION_KEY = "niat.sid";

export interface AdminInfo {
  email: string;
  name: string;
  canViewVoters: boolean;
}

export type Session =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "ready"; user: User; email: string; student: WithId<Student> | null; admin: AdminInfo | null; kicked: boolean };

const Ctx = createContext<Session>({ status: "loading" });

/**
 * One source of identity for every screen. The student doc is found by verified email
 * (rules allow a query constrained to `email == myEmail`, P-STU-01) and listened to, so
 * status changes (pending → active) and progress update live.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading" });

  useEffect(() => {
    const { auth, db } = firebase();
    let unsubStudent: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      unsubStudent?.();
      unsubStudent = null;
      if (!user || !user.email) {
        setSession({ status: "signedOut" });
        return;
      }
      setSession({ status: "loading" });
      const email = user.email.toLowerCase();

      let admin: AdminInfo | null = null;
      try {
        const a = await getDoc(doc(db, "admins", email));
        if (a.exists()) admin = { email, name: String(a.get("name") ?? email), canViewVoters: a.get("canViewVoters") === true };
      } catch {
        admin = null; // permission-denied = not an admin
      }

      const q = query(collection(db, "students").withConverter(conv.student), where("email", "==", email), limit(1));
      unsubStudent = onSnapshot(
        q,
        (snap) => {
          const student = snap.docs[0]?.data() ?? null;
          const sid = typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
          // P1 A7: a newer login elsewhere overwrote activeSessionId → this device is stale.
          const kicked = !!(student?.activeSessionId && sid && student.activeSessionId !== sid);
          setSession({ status: "ready", user, email, student, admin, kicked });
        },
        () => setSession({ status: "ready", user, email, student: null, admin, kicked: false }),
      );
    });
    return () => {
      unsubAuth();
      unsubStudent?.();
    };
  }, []);

  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}

export async function logout() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.clear();
  await signOut(firebase().auth);
}

export function useIsNominee() {
  const s = useSession();
  return useMemo(() => s.status === "ready" && !!s.student?.isNominee && !!s.student.nomineeOf, [s]);
}

/**
 * Has this sign-in passed 2-step? The proof is a custom claim `mfa` equal to the token's
 * `auth_time` — the same check the database rules and functions make, so the UI never
 * believes something the server wouldn't.
 */
export function useTwoStep(): { verified: boolean | null; refresh: () => Promise<void> } {
  const [verified, setVerified] = useState<boolean | null>(null);
  useEffect(() => {
    const { auth } = firebase();
    return onIdTokenChanged(auth, async (user) => {
      if (!user) return setVerified(null);
      const { claims } = await user.getIdTokenResult();
      setVerified(typeof claims.mfa === "number" && Number(claims.mfa) === Number(claims.auth_time));
    });
  }, []);
  const refresh = async () => {
    const user = firebase().auth.currentUser;
    if (!user) return;
    await user.getIdToken(true); // fires onIdTokenChanged → Firestore picks up the new claim too
  };
  return { verified, refresh };
}
