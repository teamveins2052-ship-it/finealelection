"use client";

import { collection, doc, getDoc, getDocs, orderBy, query, where } from "@/lib/db/firestore";
import { AppError } from "@/lib/db/errors";
import { accessToken } from "@/lib/supabase/client";
import { backend } from "@/lib/backend/client";
import { conv, type WithId } from "@/lib/schema/converters";
import type { Nominee, Position } from "@/lib/schema";

/**
 * Ballot data barely changes during voting (nominees lock at open, D-15), so a short
 * in-memory cache makes tab switches instant and saves server reads.
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
    const snap = await getDocs(query(collection(backend().db, "positions").withConverter(conv.position), orderBy("order")));
    return snap.docs.map((d) => d.data());
  });
}

export function getNominees(positionId: string): Promise<WithId<Nominee>[]> {
  return memo(`nominees:${positionId}`, 30_000, async () => {
    const snap = await getDocs(
      query(collection(backend().db, "nominees").withConverter(conv.nominee), where("positionId", "==", positionId)),
    );
    return snap.docs.map((d) => d.data()).filter((n) => n.active);
  });
}

export function getAllNominees(): Promise<WithId<Nominee>[]> {
  return memo("all-nominees", 30_000, async () => {
    const snap = await getDocs(
      query(collection(backend().db, "nominees").withConverter(conv.nominee), where("active", "==", true)),
    );
    return snap.docs.map((d) => d.data());
  });
}

export function getNominee(id: string): Promise<WithId<Nominee> | null> {
  return memo(`nominee:${id}`, 30_000, async () => {
    const snap = await getDoc(doc(backend().db, "nominees", id).withConverter(conv.nominee));
    return snap.exists() ? snap.data() : null;
  });
}

/**
 * Calls a server action: POST /api/fn/<name> with the Supabase access token. Errors come back
 * as AppError("functions/<code>"), so every caller's error handling stays the same.
 */
export async function call<I, O>(name: string, data: I): Promise<O> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await accessToken().catch(() => null);
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api/fn/${name}`, { method: "POST", headers, body: JSON.stringify({ data }) });
  } catch {
    throw new AppError("functions/unavailable", "You're offline or the server is unreachable. Try again.");
  }
  const body = (await res.json().catch(() => null)) as { result?: O; error?: { status: string; message: string } } | null;
  if (!res.ok || !body || body.error) {
    const err = body?.error;
    throw new AppError(`functions/${err?.status ?? "internal"}`, err?.message ?? "Something went wrong. Try again.");
  }
  return body.result as O;
}

/** One plain sentence for the user (AGENTS §7), never a stack trace. */
export function errorMessage(e: unknown, fallback = "Something went wrong. Try again."): string {
  if (e instanceof AppError) {
    if (e.code === "permission-denied" || e.code === "functions/permission-denied") return e.message.includes("Missing or insufficient") ? "You don't have access to do that." : e.message;
    if (e.code === "unavailable") return "You're offline. Check your connection and try again.";
    if (e.code.startsWith("functions/")) return e.message || fallback;
  }
  return fallback;
}
