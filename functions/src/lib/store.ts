import pg from "pg";
import { randomBytes } from "node:crypto";
import { FieldSentinel, FieldValue, Timestamp, decode, encode, getPath } from "../../../lib/db/codec";

/**
 * Document store on Supabase Postgres. Each former Firestore collection is a table
 * (id text PK, data jsonb) — see supabase/migrations/0001_init.sql. The API mirrors the
 * small part of firebase-admin/firestore the server uses, so callables kept their logic:
 *   db.doc("students/X").get() · db.collection("votes").where(...).orderBy(...).get()
 *   db.runTransaction(tx => …) · db.batch() · FieldValue.* · Timestamp
 * Transactions are real Postgres transactions; every doc read inside one takes a
 * transaction-scoped advisory lock on that doc, so concurrent transactions on the same doc
 * (even one that doesn't exist yet) run one after another — like Firestore's.
 */

export { FieldValue, Timestamp };
// Same shape as Firestore's DocumentData: fields are checked by Zod where they matter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocumentData = { [field: string]: any };

const DB_URL = process.env.SUPABASE_DB_URL?.trim();
let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!DB_URL) throw new Error("SUPABASE_DB_URL is not set");
  pool ??= new pg.Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    max: Number(process.env.SUPABASE_DB_POOL ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}
type Q = Pick<pg.PoolClient, "query">;

/** collection name → table name ("correctionRequests" → "correction_requests", "_mailQueue" → "_mail_queue"). */
export const tableOf = (collection: string) => {
  const t = collection.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
  if (!/^_?[a-z][a-z0-9_]*$/.test(t)) throw new Error(`bad collection ${collection}`);
  return t;
};
const ident = (t: string) => `"${t}"`;

function splitPath(path: string): [string, string] {
  const parts = path.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`only top-level docs are supported: ${path}`);
  return [parts[0], parts[1]];
}

export class StoreError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

/** Firestore-style auto id (20 chars). */
export function autoId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (const b of randomBytes(20)) id += chars[b % chars.length];
  return id;
}

// ------------------------------------------------------------------ snapshots

export class DocumentSnapshot {
  constructor(
    public readonly ref: DocumentReference,
    private readonly raw: DocumentData | undefined,
  ) {}
  get id() {
    return this.ref.id;
  }
  get exists() {
    return this.raw !== undefined;
  }
  data(): DocumentData | undefined {
    return this.raw === undefined ? undefined : (decode(this.raw) as DocumentData);
  }
  get(field: string): unknown {
    return this.raw === undefined ? undefined : decode(getPath(this.raw, field));
  }
}

/** A document returned by a query always exists, so data() is never undefined. */
export class QueryDocumentSnapshot extends DocumentSnapshot {
  override data(): DocumentData {
    return super.data()!;
  }
}

export class QuerySnapshot {
  constructor(public readonly docs: QueryDocumentSnapshot[]) {}
  get size() {
    return this.docs.length;
  }
  get empty() {
    return this.docs.length === 0;
  }
  forEach(fn: (d: QueryDocumentSnapshot) => void) {
    this.docs.forEach(fn);
  }
}

// ------------------------------------------------------------------ write application

type WriteOp =
  | { kind: "set"; ref: DocumentReference; data: DocumentData; merge: boolean }
  | { kind: "update"; ref: DocumentReference; data: DocumentData }
  | { kind: "create"; ref: DocumentReference; data: DocumentData }
  | { kind: "delete"; ref: DocumentReference };

function resolve(value: unknown, current: unknown): unknown {
  if (value instanceof FieldSentinel) {
    const s = value.s;
    switch (s.$sv) {
      case "ts":
        return Timestamp.now();
      case "inc":
        return (typeof current === "number" ? current : 0) + s.n;
      case "union": {
        const arr = Array.isArray(current) ? [...current] : [];
        for (const x of s.v) if (!arr.some((y) => JSON.stringify(y) === JSON.stringify(x))) arr.push(x);
        return arr;
      }
      case "remove": {
        const arr = Array.isArray(current) ? current : [];
        return arr.filter((y) => !s.v.some((x) => JSON.stringify(x) === JSON.stringify(y)));
      }
      case "del":
        return undefined;
    }
  }
  return value;
}

/** Deep-merge `patch` into `base` (decoded JS values); FieldSentinels resolved against current values. */
function mergeDeep(base: DocumentData, patch: DocumentData): DocumentData {
  const out: DocumentData = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof FieldSentinel) && !(v instanceof Date)) {
      const cur = out[k];
      out[k] = mergeDeep(cur && typeof cur === "object" && !Array.isArray(cur) && !(cur instanceof Timestamp) ? (cur as DocumentData) : {}, v as DocumentData);
    } else {
      const r = resolve(v, out[k]);
      if (r === undefined) delete out[k];
      else out[k] = r;
    }
  }
  return out;
}

/** Replace semantics (set without merge): resolve sentinels at every level. */
function resolveAll(data: DocumentData): DocumentData {
  return mergeDeep({}, data);
}

/** update(): keys may be dotted paths ("reactionCounts.fire"). */
function applyUpdate(base: DocumentData, patch: DocumentData): DocumentData {
  const out: DocumentData = structuredCloneDoc(base);
  for (const [path, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const parts = path.split(".");
    let cur: DocumentData = out;
    for (const p of parts.slice(0, -1)) {
      const next = cur[p];
      if (!next || typeof next !== "object" || Array.isArray(next) || next instanceof Timestamp) cur[p] = {};
      cur = cur[p] as DocumentData;
    }
    const last = parts[parts.length - 1]!;
    const r = v instanceof FieldSentinel ? resolve(v, cur[last]) : v instanceof Date ? Timestamp.fromDate(v) : v;
    if (r === undefined) delete cur[last];
    else cur[last] = r;
  }
  return out;
}

function structuredCloneDoc(d: DocumentData): DocumentData {
  return decode(encode(d)) as DocumentData;
}

async function lockDoc(c: Q, table: string, id: string) {
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [`${table}/${id}`]);
}

async function readRaw(c: Q, table: string, id: string, forUpdate: boolean): Promise<DocumentData | undefined> {
  const r = await c.query(`select data from public.${ident(table)} where id = $1${forUpdate ? " for update" : ""}`, [id]);
  return r.rows[0]?.data as DocumentData | undefined;
}

async function applyWrite(c: Q, op: WriteOp) {
  const table = tableOf(op.ref.parent.id);
  const id = op.ref.id;
  if (op.kind === "delete") {
    await c.query(`delete from public.${ident(table)} where id = $1`, [id]);
    return;
  }
  await lockDoc(c, table, id);
  const curRaw = await readRaw(c, table, id, true);
  const cur = curRaw === undefined ? undefined : (decode(curRaw) as DocumentData);
  let next: DocumentData;
  if (op.kind === "create") {
    if (cur !== undefined) throw new StoreError(6, `Document already exists: ${op.ref.path}`);
    next = resolveAll(op.data);
  } else if (op.kind === "update") {
    if (cur === undefined) throw new StoreError(5, `No document to update: ${op.ref.path}`);
    next = applyUpdate(cur, op.data);
  } else {
    next = op.merge ? mergeDeep(cur ?? {}, op.data) : resolveAll(op.data);
  }
  await c.query(
    `insert into public.${ident(table)} (id, data) values ($1, $2::jsonb)
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    [id, JSON.stringify(encode(next))],
  );
}

// ------------------------------------------------------------------ references & queries

type Op = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "array-contains";
interface Filter {
  field: string;
  op: Op;
  value: unknown;
}

export class Query {
  constructor(
    public readonly collectionId: string,
    protected readonly filters: Filter[] = [],
    protected readonly orders: Array<{ field: string; dir: "asc" | "desc" }> = [],
    protected readonly max: number | null = null,
  ) {}
  where(field: string, op: Op, value: unknown): Query {
    return new Query(this.collectionId, [...this.filters, { field, op, value }], this.orders, this.max);
  }
  orderBy(field: string, dir: "asc" | "desc" = "asc"): Query {
    return new Query(this.collectionId, this.filters, [...this.orders, { field, dir }], this.max);
  }
  limit(n: number): Query {
    return new Query(this.collectionId, this.filters, this.orders, n);
  }
  /** Field projection is a read-cost optimisation in Firestore; here we just return whole docs. */
  select(): Query {
    return this;
  }
  toSql(columns: string): { text: string; values: unknown[] } {
    const values: unknown[] = [];
    const pathOf = (f: string) => {
      values.push(f.split("."));
      return `data #> $${values.length}::text[]`;
    };
    const val = (v: unknown) => {
      values.push(JSON.stringify(encode(v)));
      return `$${values.length}::jsonb`;
    };
    const where: string[] = [];
    for (const f of this.filters) {
      const p = pathOf(f.field);
      if (f.op === "in") {
        const arr = (f.value as unknown[]).map((v) => JSON.stringify(encode(v)));
        values.push(arr);
        where.push(`${p} = any($${values.length}::jsonb[])`);
      } else if (f.op === "array-contains") {
        where.push(`${p} @> jsonb_build_array(${val(f.value)})`);
      } else if (f.op === "!=") {
        where.push(`${p} is not null and ${p} <> ${val(f.value)}`);
      } else {
        where.push(`${p} ${f.op === "==" ? "=" : f.op} ${val(f.value)}`);
      }
    }
    // Firestore skips docs that lack an orderBy field.
    for (const o of this.orders) where.push(`${pathOf(o.field)} is not null`);
    const order = this.orders.map((o) => `${pathOf(o.field)} ${o.dir === "desc" ? "desc" : "asc"}`);
    let text = `select ${columns} from public.${ident(tableOf(this.collectionId))}`;
    if (where.length) text += ` where ${where.join(" and ")}`;
    if (order.length && columns !== "count(*)::int as n") text += ` order by ${order.join(", ")}, id`;
    if (this.max !== null && columns !== "count(*)::int as n") text += ` limit ${Math.max(0, Math.floor(this.max))}`;
    return { text, values };
  }
  async run(c: Q): Promise<QuerySnapshot> {
    const { text, values } = this.toSql("id, data");
    const r = await c.query(text, values);
    const coll = new CollectionReference(this.collectionId);
    return new QuerySnapshot(r.rows.map((row: { id: string; data: DocumentData }) => new QueryDocumentSnapshot(coll.doc(row.id), row.data)));
  }
  get(): Promise<QuerySnapshot> {
    return this.run(getPool());
  }
  count() {
    return {
      get: async () => {
        const { text, values } = this.toSql("count(*)::int as n");
        const r = await getPool().query(text, values);
        const n = Number(r.rows[0]?.n ?? 0);
        return { data: () => ({ count: n }) };
      },
    };
  }
}

export class CollectionReference extends Query {
  constructor(public readonly id: string) {
    super(id);
  }
  doc(id?: string): DocumentReference {
    return new DocumentReference(this, id ?? autoId());
  }
  async add(data: DocumentData): Promise<DocumentReference> {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
}

export class DocumentReference {
  constructor(
    public readonly parent: CollectionReference,
    public readonly id: string,
  ) {}
  get path() {
    return `${this.parent.id}/${this.id}`;
  }
  async get(): Promise<DocumentSnapshot> {
    return new DocumentSnapshot(this, await readRaw(getPool(), tableOf(this.parent.id), this.id, false));
  }
  set(data: DocumentData, opts?: { merge?: boolean }) {
    return inTx((c) => applyWrite(c, { kind: "set", ref: this, data, merge: !!opts?.merge }));
  }
  update(data: DocumentData) {
    return inTx((c) => applyWrite(c, { kind: "update", ref: this, data }));
  }
  create(data: DocumentData) {
    return inTx((c) => applyWrite(c, { kind: "create", ref: this, data }));
  }
  delete() {
    return applyWrite(getPool(), { kind: "delete", ref: this });
  }
}

// ------------------------------------------------------------------ transactions & batches

export class Transaction {
  readonly writes: WriteOp[] = [];
  constructor(private readonly c: pg.PoolClient) {}
  async get(target: DocumentReference): Promise<DocumentSnapshot>;
  async get(target: Query): Promise<QuerySnapshot>;
  async get(target: DocumentReference | Query): Promise<DocumentSnapshot | QuerySnapshot> {
    if (target instanceof DocumentReference) {
      const table = tableOf(target.parent.id);
      await lockDoc(this.c, table, target.id);
      return new DocumentSnapshot(target, await readRaw(this.c, table, target.id, true));
    }
    return target.run(this.c);
  }
  set(ref: DocumentReference, data: DocumentData, opts?: { merge?: boolean }) {
    this.writes.push({ kind: "set", ref, data, merge: !!opts?.merge });
    return this;
  }
  update(ref: DocumentReference, data: DocumentData) {
    this.writes.push({ kind: "update", ref, data });
    return this;
  }
  create(ref: DocumentReference, data: DocumentData) {
    this.writes.push({ kind: "create", ref, data });
    return this;
  }
  delete(ref: DocumentReference) {
    this.writes.push({ kind: "delete", ref });
    return this;
  }
}

const RETRY = new Set(["40001", "40P01"]);

async function inTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const c = await getPool().connect();
    try {
      await c.query("begin");
      const out = await fn(c);
      await c.query("commit");
      return out;
    } catch (e) {
      await c.query("rollback").catch(() => undefined);
      if (attempt < 4 && RETRY.has((e as { code?: string }).code ?? "")) continue;
      throw e;
    } finally {
      c.release();
    }
  }
}

export class WriteBatch {
  private readonly ops: WriteOp[] = [];
  set(ref: DocumentReference, data: DocumentData, opts?: { merge?: boolean }) {
    this.ops.push({ kind: "set", ref, data, merge: !!opts?.merge });
    return this;
  }
  update(ref: DocumentReference, data: DocumentData) {
    this.ops.push({ kind: "update", ref, data });
    return this;
  }
  create(ref: DocumentReference, data: DocumentData) {
    this.ops.push({ kind: "create", ref, data });
    return this;
  }
  delete(ref: DocumentReference) {
    this.ops.push({ kind: "delete", ref });
    return this;
  }
  commit() {
    return inTx(async (c) => {
      for (const op of this.ops) await applyWrite(c, op);
    });
  }
}

export const db = {
  doc(path: string) {
    const [coll, id] = splitPath(path);
    return new CollectionReference(coll).doc(id);
  },
  collection(name: string) {
    return new CollectionReference(name);
  },
  batch() {
    return new WriteBatch();
  },
  runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return inTx(async (c) => {
      const tx = new Transaction(c);
      const out = await fn(tx);
      for (const op of tx.writes) await applyWrite(c, op);
      return out;
    });
  },
  async getAll(...refs: DocumentReference[]): Promise<DocumentSnapshot[]> {
    const byColl = new Map<string, DocumentReference[]>();
    refs.forEach((r) => byColl.set(r.parent.id, [...(byColl.get(r.parent.id) ?? []), r]));
    const found = new Map<string, DocumentData>();
    for (const [coll, rs] of byColl) {
      const r = await getPool().query(`select id, data from public.${ident(tableOf(coll))} where id = any($1::text[])`, [rs.map((x) => x.id)]);
      for (const row of r.rows as Array<{ id: string; data: DocumentData }>) found.set(`${coll}/${row.id}`, row.data);
    }
    return refs.map((r) => new DocumentSnapshot(r, found.get(r.path)));
  },
  /** Raw SQL for the few places that need it (live-data rebuild, ping key secret). */
  query(text: string, values: unknown[] = []) {
    return getPool().query(text, values);
  },
};

// ------------------------------------------------------------------ public live data (old RTDB)

/** Push-style ids that sort by time (like RTDB push keys). */
let lastPush = 0;
function pushId(): string {
  const now = Math.max(Date.now(), lastPush + 1);
  lastPush = now;
  return now.toString(36).padStart(9, "0") + randomBytes(4).toString("hex");
}

function setIn(obj: unknown, parts: string[], v: unknown): unknown {
  if (!parts.length) return v === null ? undefined : v;
  const base = obj && typeof obj === "object" && !Array.isArray(obj) ? { ...(obj as DocumentData) } : {};
  const [head, ...rest] = parts;
  const next = setIn(base[head!], rest, v);
  if (next === undefined) delete base[head!];
  else base[head!] = next;
  return Object.keys(base).length ? base : undefined;
}

class RtRef {
  constructor(private readonly path: string) {}
  private parts() {
    const p = this.path.split("/").filter(Boolean);
    if (!p.length) throw new Error("rt root writes are not allowed");
    return p;
  }
  private async mutate(fn: (cur: unknown) => unknown) {
    const [top, ...rest] = this.parts();
    await inTx(async (c) => {
      await lockDoc(c, "rt", top!);
      const r = await c.query("select value from public.rt where path = $1 for update", [top]);
      const whole = r.rows[0]?.value ?? null;
      const cur = rest.length ? getPath(whole, rest.join(".")) : whole;
      const next = fn(cur ?? null);
      const updated = rest.length ? setIn(whole, rest, next) : next === null ? undefined : next;
      await c.query(
        `insert into public.rt (path, value) values ($1, $2::jsonb)
         on conflict (path) do update set value = excluded.value, updated_at = now()`,
        [top, JSON.stringify(updated ?? null)],
      );
    });
  }
  set(v: unknown) {
    return this.mutate(() => v);
  }
  update(patch: Record<string, unknown>) {
    return this.mutate((cur) => {
      let out: unknown = cur;
      for (const [k, v] of Object.entries(patch)) out = setIn(out, k.split("/"), v) ?? null;
      return out;
    });
  }
  async transaction<T>(fn: (cur: T | null) => T) {
    await this.mutate((cur) => fn(cur as T | null));
  }
  async push(v: unknown) {
    const id = pushId();
    await new RtRef(`${this.path}/${id}`).set(v);
    return { key: id };
  }
  orderByKey() {
    return this;
  }
  async get() {
    const [top, ...rest] = this.parts();
    const r = await getPool().query("select value from public.rt where path = $1", [top]);
    const whole = r.rows[0]?.value ?? null;
    const val = rest.length ? (getPath(whole, rest.join(".")) ?? null) : whole;
    return { val: () => val, exists: () => val !== null };
  }
}

export const rtdb = { ref: (path: string) => new RtRef(path) };
