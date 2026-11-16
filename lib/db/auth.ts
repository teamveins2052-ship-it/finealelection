"use client";

import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

/**
 * Supabase Auth with the small firebase/auth-style surface the screens use:
 * a `User` with getIdToken(), onAuthStateChanged / onIdTokenChanged, signOut, Google sign-in
 * and password sign-in (test accounts). Google sign-in is a full-page redirect to
 * /auth/callback (Supabase has no popup flow); the callback finishes the login.
 */

export interface User {
  uid: string;
  email: string | null;
  getIdToken(forceRefresh?: boolean): Promise<string>;
  getIdTokenResult(): Promise<{ token: string; claims: Record<string, unknown> }>;
}
export type Auth = { readonly currentUser: User | null };

let current: User | null = null;
export const auth: Auth = {
  get currentUser() {
    return current;
  },
};

function claimsOf(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] ?? "";
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown> & { amr?: Array<{ timestamp: number }> };
    const amr = (json.amr ?? []).map((a) => a.timestamp).filter((t) => typeof t === "number");
    return { ...json, auth_time: amr.length ? Math.min(...amr) : json.iat };
  } catch {
    return {};
  }
}

function toUser(s: Session | null): User | null {
  if (!s?.user) return null;
  return {
    uid: s.user.id,
    email: s.user.email ?? null,
    async getIdToken(force) {
      if (force) {
        const { data } = await supabase().auth.refreshSession();
        return data.session?.access_token ?? s.access_token;
      }
      const { data } = await supabase().auth.getSession();
      return data.session?.access_token ?? s.access_token;
    },
    async getIdTokenResult() {
      const token = await this.getIdToken();
      return { token, claims: claimsOf(token) };
    },
  };
}

/** Fires on sign-in / sign-out (not on hourly token refresh), like Firebase. */
export function onAuthStateChanged(_auth: Auth, cb: (u: User | null) => void): () => void {
  let lastUid: string | null | undefined;
  const { data } = supabase().auth.onAuthStateChange((_event, session) => {
    const u = toUser(session);
    current = u;
    const uid = u?.uid ?? null;
    if (uid === lastUid) return;
    lastUid = uid;
    // Defer: supabase-js warns against awaiting auth calls inside this callback.
    setTimeout(() => cb(u), 0);
  });
  return () => data.subscription.unsubscribe();
}

const tokenListeners = new Set<(u: User | null) => void>();
/** Fires on every token change, including refreshes and refreshToken() below. */
export function onIdTokenChanged(_auth: Auth, cb: (u: User | null) => void): () => void {
  const { data } = supabase().auth.onAuthStateChange((_event, session) => {
    current = toUser(session);
    setTimeout(() => cb(current), 0);
  });
  tokenListeners.add(cb);
  return () => {
    data.subscription.unsubscribe();
    tokenListeners.delete(cb);
  };
}

/** Tell token listeners to re-check (e.g. after 2-step passed — the proof lives on the server). */
export function notifyTokenListeners() {
  tokenListeners.forEach((l) => l(current));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function signOut(_auth?: Auth): Promise<void> {
  await supabase().auth.signOut();
  current = null;
}

export class GoogleAuthProvider {
  params: Record<string, string> = {};
  setCustomParameters(p: Record<string, string>) {
    this.params = { ...this.params, ...p };
    return this;
  }
}

/** Google sign-in: redirects the whole page to Google, then back to /auth/callback. */
export async function signInWithPopup(_auth: Auth, provider: GoogleAuthProvider): Promise<never> {
  const { error } = await supabase().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { prompt: "select_account", ...(provider.params.login_hint ? { login_hint: provider.params.login_hint } : {}) },
    },
  });
  if (error) throw Object.assign(new Error(error.message), { code: "auth/operation-not-allowed" });
  return new Promise<never>(() => undefined); // the browser is navigating away
}

/** Password sign-in — only for the seeded test accounts. */
export async function signInWithEmailAndPassword(_auth: Auth, email: string, password: string) {
  const { data, error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw Object.assign(new Error(error.message), { code: "auth/invalid-credential" });
  current = toUser(data.session);
  return { user: current };
}
