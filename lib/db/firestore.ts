"use client";

import { accessToken, supabase } from "@/lib/supabase/client";
import { FieldValue, Timestamp, decode, encode, getPath } from "./codec";
import { AppError } from "./errors";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Browser document API backed by our server (/api/db → functions/src/rules.ts). It mirrors
 * the parts of firebase/firestore the screens use (doc, collection, query, getDoc, getDocs,
 * onSnapshot, setDoc, updateDoc, addDoc, deleteDoc, serverTimestamp), so screens kept their
 * logic. Live updates: the server tells us which "change keys" to watch; Supabase Realtime
 * pings us on `_changes` and we re-read through the server (pings carry no data).
 */

export { Timestamp };
export type DocumentData = Record<string, unknown>;
export interface SnapshotOptions {
  serverTimestamps?: "estimate" | "previous" | "none";
}
export type Firestore = { readonly kind: "db" };
export const db: Firestore = { kind: "db" };

export interface FirestoreDataConverter<T> {
  toFirestore(data: T): DocumentData;
  fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions): T;
}

// ------------------------------------------------------------------ references

export class DocumentReference<T = DocumentData> {
  readonly type = "document";
  constructor(
    public readonly collection: string,
    public readonly id: string,
    public readonly converter: FirestoreDataConverter<T> | null = null,
  ) {}
  get path() {
    return `${this.collection}/${this.id}`;
  }
  withConverter<U>(c: FirestoreDataConverter<U>): DocumentReference<U> {
    return new DocumentReference<U>(this.collection, this.id, c);
  }
}

type Constraint =
  | { kind: "where"; field: string; op: string; value: unknown }
  | { kind: "orderBy"; field: string; dir: "asc" | "desc" }
  | { kind: "limit"; n: number };

export class Query<T = DocumentData> {
  readonly type: "query" | "collection" = "query";
  constructor(
    public readonly collection: string,
    public readonly constraints: Constraint[] = [],
    public readonly converter: FirestoreDataConverter<T> | null = null,
  ) {}
  withConverter<U>(c: FirestoreDataConverter<U>): Query<U> {
    return new Query<U>(this.collection, this.constraints, c);
  }
}

export class CollectionReference<T = DocumentData> extends Query<T> {
  override readonly type = "collection";
  get id() {
    return this.collection;
  }
  override withConverter<U>(c: FirestoreDataConverter<U>): CollectionReference<U> {
    return new CollectionReference<U>(this.collection, [], c);
  }
}

export function collection(_db: Firestore, name: string): CollectionReference {
  return new CollectionReference(name);
}

export function doc(_db: Firestore, coll: string, id: string): DocumentReference {
  return new DocumentReference(coll, id);
}

export const where = (field: string, op: string, value: unknown): Constraint => ({ kind: "where", field, op, value });
export const orderBy = (field: string, dir: "asc" | "desc" = "asc"): Constraint => ({ kind: "orderBy", field, dir });
export const limit = (n: number): Constraint => ({ kind: "limit", n });

export function query<T>(q: Query<T>, ...constraints: Constraint[]): Query<T> {
  return new Query<T>(q.collection, [...q.constraints, ...constraints], q.converter);
}

export const serverTimestamp = () => FieldValue.serverTimestamp();
export const increment = (n: number) => FieldValue.increment(n);
export const arrayUnion = (...v: unknown[]) => FieldValue.arrayUnion(...v);
export const deleteField = () => FieldValue.delete();

// ------------------------------------------------------------------ snapshots

export class DocumentSnapshot<T = DocumentData> {
  readonly metadata = { hasPendingWrites: false, fromCache: false };
  constructor(
    public readonly ref: DocumentReference<T>,
    private readonly raw: DocumentData | null,
  ) {}
  get id() {
    return this.ref.id;
  }
  exists(): boolean {
    return this.raw !== null;
  }
  data(options?: SnapshotOptions): T {
    if (this.raw === null) return undefined as T;
    if (this.ref.converter) return this.ref.converter.fromFirestore(new QueryDocumentSnapshot(new DocumentReference(this.ref.collection, this.ref.id), this.raw), options);
    return decode(this.raw) as T;
  }
  get(field: string): unknown {
    return this.raw === null ? undefined : decode(getPath(this.raw, field));
  }
}

export class QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
  override data(options?: SnapshotOptions): T {
    return super.data(options);
  }
}

export class QuerySnapshot<T = DocumentData> {
  readonly metadata = { hasPendingWrites: false, fromCache: false };
  constructor(public readonly docs: QueryDocumentSnapshot<T>[]) {}
  get size() {
    return this.docs.length;
  }
  get empty() {
    return this.docs.length === 0;
  }
  forEach(fn: (d: QueryDocumentSnapshot<T>) => void) {
    this.docs.forEach(fn);
  }
}

// ------------------------------------------------------------------ server calls

interface RawDoc {
  id: string;
  data: DocumentData;
}

async function api<R>(body: unknown): Promise<R> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await accessToken().catch(() => null);
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch("/api/db", { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    throw new AppError("unavailable", "You're offline. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => null)) as { result?: R; error?: { status: string; message: string } } | null;
  if (!res.ok || !json || json.error) {
    throw new AppError(json?.error?.status ?? (res.status >= 500 ? "unavailable" : "internal"), json?.error?.message ?? "Something went wrong. Try again.");
  }
  return json.result as R;
}

function queryBody(q: Query<unknown>) {
  const where: unknown[] = [];
  const order: unknown[] = [];
  let max: number | undefined;
  for (const c of q.constraints) {
    if (c.kind === "where") where.push([c.field, c.op, encode(c.value)]);
    else if (c.kind === "orderBy") order.push([c.field, c.dir]);
    else max = c.n;
  }
  return { op: "query", collection: q.collection, where, orderBy: order, ...(max ? { limit: max } : {}) };
}

async function fetchDoc<T>(ref: DocumentReference<T>) {
  const r = await api<{ doc: RawDoc | null; watch: string[] }>({ op: "get", path: ref.path });
  return { snap: new DocumentSnapshot<T>(ref, r.doc?.data ?? null), watch: r.watch };
}

async function fetchQuery<T>(q: Query<T>) {
  const r = await api<{ docs: RawDoc[]; watch: string[] }>(queryBody(q as Query<unknown>));
  const snap = new QuerySnapshot<T>(r.docs.map((d) => new QueryDocumentSnapshot<T>(new DocumentReference<T>(q.collection, d.id, q.converter), d.data)));
  return { snap, watch: r.watch };
}

export async function getDoc<T>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  return (await fetchDoc(ref)).snap;
}

export async function getDocs<T>(q: Query<T>): Promise<QuerySnapshot<T>> {
  return (await fetchQuery(q)).snap;
}

const toData = <T>(ref: { converter: FirestoreDataConverter<T> | null }, data: unknown) =>
  encode(ref.converter ? ref.converter.toFirestore(data as T) : data);

export async function setDoc<T>(ref: DocumentReference<T>, data: T | DocumentData, opts?: { merge?: boolean }): Promise<void> {
  await api({ op: "set", path: ref.path, data: toData(ref, data), ...(opts?.merge ? { merge: true } : {}) });
  pingLocal(ref.collection);
}

export async function updateDoc(ref: DocumentReference<unknown>, data: DocumentData): Promise<void> {
  await api({ op: "update", path: ref.path, data: encode(data) });
  pingLocal(ref.collection);
}

export async function addDoc<T>(coll: CollectionReference<T>, data: T | DocumentData): Promise<DocumentReference<T>> {
  const r = await api<{ id: string }>({ op: "add", collection: coll.collection, data: toData(coll, data) });
  pingLocal(coll.collection);
  return new DocumentReference<T>(coll.collection, r.id, coll.converter);
}

export async function deleteDoc(ref: DocumentReference<unknown>): Promise<void> {
  await api({ op: "delete", path: ref.path });
  pingLocal(ref.collection);
}

// ------------------------------------------------------------------ live updates

type Listener = () => void;
const watchers = new Map<string, { channel: RealtimeChannel | null; listeners: Set<Listener>; poll: ReturnType<typeof setInterval> | null }>();
const localListeners = new Map<string, Set<Listener>>();

/** Our own writes refresh our own listeners immediately (no need to wait for the ping). */
function pingLocal(coll: string) {
  localListeners.get(coll)?.forEach((l) => l());
}

function watchKey(key: string, l: Listener): () => void {
  let w = watchers.get(key);
  if (!w) {
    const entry: { channel: RealtimeChannel | null; listeners: Set<Listener>; poll: ReturnType<typeof setInterval> | null } = { channel: null, listeners: new Set(), poll: null };
    w = entry;
    watchers.set(key, entry);
    try {
      entry.channel = supabase()
        .channel(`w:${key}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "_changes", filter: `key=eq.${key}` }, () => entry.listeners.forEach((x) => x()))
        .subscribe((status) => {
          // Realtime unavailable (connection limit, network) → fall back to a slow refresh.
          if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !entry.poll) {
            entry.poll = setInterval(() => entry.listeners.forEach((x) => x()), 30_000);
          }
          if (status === "SUBSCRIBED" && entry.poll) {
            clearInterval(entry.poll);
            entry.poll = null;
          }
        });
    } catch {
      entry.poll = setInterval(() => entry.listeners.forEach((x) => x()), 30_000);
    }
  }
  w.listeners.add(l);
  return () => {
    const cur = watchers.get(key);
    if (!cur) return;
    cur.listeners.delete(l);
    if (!cur.listeners.size) {
      if (cur.poll) clearInterval(cur.poll);
      if (cur.channel) void supabase().removeChannel(cur.channel);
      watchers.delete(key);
    }
  };
}

type Next<S> = (snap: S) => void;
type Err = (e: Error) => void;

type Opts = { includeMetadataChanges?: boolean };
export function onSnapshot<T>(target: DocumentReference<T>, next: Next<DocumentSnapshot<T>>, error?: Err): () => void;
export function onSnapshot<T>(target: DocumentReference<T>, opts: Opts, next: Next<DocumentSnapshot<T>>, error?: Err): () => void;
export function onSnapshot<T>(target: Query<T>, next: Next<QuerySnapshot<T>>, error?: Err): () => void;
export function onSnapshot<T>(target: Query<T>, opts: Opts, next: Next<QuerySnapshot<T>>, error?: Err): () => void;
export function onSnapshot<T>(
  target: DocumentReference<T> | Query<T>,
  a: Next<never> | object,
  b?: Next<never> | Err,
  c?: Err,
): () => void {
  const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
  const error = (typeof a === "function" ? b : c) as Err | undefined;
  let stopped = false;
  let unwatch: Array<() => void> = [];
  let watching = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let again = false;

  const load = async () => {
    if (stopped) return;
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    try {
      const r = target instanceof DocumentReference ? await fetchDoc(target) : await fetchQuery(target);
      if (stopped) return;
      next(r.snap);
      const keys = [...r.watch].sort().join("|");
      if (keys !== watching) {
        unwatch.forEach((u) => u());
        watching = keys;
        unwatch = r.watch.map((k) => watchKey(k, schedule));
      }
    } catch (e) {
      if (!stopped) error?.(e as Error);
    } finally {
      inFlight = false;
      if (again && !stopped) {
        again = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(load, 250 + Math.random() * 500); // spread re-reads when many clients get the same ping
  };

  const coll = target.collection;
  const local = localListeners.get(coll) ?? new Set<Listener>();
  local.add(schedule);
  localListeners.set(coll, local);
  const onFocus = () => document.visibilityState === "visible" && schedule();
  document.addEventListener("visibilitychange", onFocus);
  window.addEventListener("online", schedule);
  const { data: authSub } = supabase().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") schedule();
  });

  void load();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    unwatch.forEach((u) => u());
    local.delete(schedule);
    document.removeEventListener("visibilitychange", onFocus);
    window.removeEventListener("online", schedule);
    authSub.subscription.unsubscribe();
  };
}
