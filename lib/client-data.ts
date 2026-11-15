"use client";

import { collection, doc, getDoc, getDocs, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { FirebaseError } from "firebase/app";
import { firebase } from "@/lib/firebase/client";
import { conv, type WithId } from "@/lib/schema/converters";
import type { Nominee, Position } from "@/lib/schema";

/**
 * Ballot data barely changes during voting (nominees lock at open, D-15), so a short
 * in-memory cache makes tab switches instant and saves Firestore reads.
 */
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: Date.now(), value });
  return value;
}
export const invalidate = (prefix: string) => [...cache.keys()].filter((k) => k.startsWith(prefix)).forEach((k) => cache.delete(k));

export function getPositions(): Promise<WithId<Position>[]> {
  return memo("positions", 60_000, async () => {
    const snap = await getDocs(query(collection(firebase().db, "positions").withConverter(conv.position), orderBy("order")));
    return snap.docs.map((d) => d.data());
  });
}

export function getNominees(positionId: string): Promise<WithId<Nominee>[]> {
  return memo(`nominees:${positionId}`, 30_000, async () => {
    const snap = await getDocs(
      query(collection(firebase().db, "nominees").withConverter(conv.nominee), where("positionId", "==", positionId)),
    );
    return snap.docs.map((d) => d.data()).filter((n) => n.active);
  });
}

export function getNominee(id: string): Promise<WithId<Nominee> | null> {
  return memo(`nominee:${id}`, 30_000, async () => {
    const snap = await getDoc(doc(firebase().db, "nominees", id).withConverter(conv.nominee));
    return snap.exists() ? snap.data() : null;
  });
}

/**
 * Calls a server action. Default: POST /api/fn/<name> on our own server (free hosting —
 * no Cloud Functions needed). NEXT_PUBLIC_FUNCTIONS_MODE=callable switches back to Cloud
 * Functions. Errors come back as FirebaseError("functions/<code>") either way, so every
 * caller's error handling stays the same.
 */
export async function call<I, O>(name: string, data: I): Promise<O> {
  if (process.env.NEXT_PUBLIC_FUNCTIONS_MODE === "callable") {
    const fn = httpsCallable<I, O>(firebase().functions, name);
    return (await fn(data)).data;
  }
  const { auth, appCheck } = firebase();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const user = auth.currentUser;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  if (appCheck) {
    try {
      const { getToken } = await import("firebase/app-check");
      headers["X-Firebase-AppCheck"] = (await getToken(appCheck, false)).token;
    } catch {
      // No App Check token yet — the server decides whether that's allowed (ENFORCE_APP_CHECK).
    }
  }
  let res: Response;
  try {
    res = await fetch(`/api/fn/${name}`, { method: "POST", headers, body: JSON.stringify({ data }) });
  } catch {
    throw new FirebaseError("functions/unavailable", "You're offline or the server is unreachable. Try again.");
  }
  const body = (await res.json().catch(() => null)) as { result?: O; error?: { status: string; message: string } } | null;
  if (!res.ok || !body || body.error) {
    const err = body?.error;
    throw new FirebaseError(`functions/${err?.status ?? "internal"}`, err?.message ?? "Something went wrong. Try again.");
  }
  return body.result as O;
}

/** One plain sentence for the user (AGENTS §7), never a stack trace. */
export function errorMessage(e: unknown, fallback = "Something went wrong. Try again."): string {
  if (e instanceof FirebaseError) {
    // The SDK can append an HTTP status like " [400]" — users shouldn't see it.
    e.message = e.message.replace(/\s*\[\d{3}\]\s*$/, "");
    if (e.code === "permission-denied" || e.code === "functions/permission-denied") return e.message.includes("Missing or insufficient") ? "You don't have access to do that." : e.message;
    if (e.code === "unavailable") return "You're offline. Check your connection and try again.";
    if (e.code.startsWith("functions/")) return e.message || fallback;
  }
  return fallback;
}
